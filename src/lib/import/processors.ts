import 'server-only'

import * as XLSX from 'xlsx'
import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'

const CHUNK_SIZE = 500

const SUPPORTED_JOB_TYPES = ['excel_rystad', 'pdf_contract_awards', 'pdf_market_report'] as const

type ImportJobType = typeof SUPPORTED_JOB_TYPES[number]

type ProcessorStats = {
  batchId: string
  recordsTotal: number
  recordsImported: number
  recordsSkipped: number
}

type ImportJob = {
  id: string
  file_name: string
  file_type: ImportJobType
  status: 'pending' | 'processing' | 'completed' | 'failed'
  storage_bucket: string
  storage_path: string
  import_batch_id: string | null
}

interface ContractRow {
  supplier: string
  operator: string
  value: string
  scope: string
  region: string
  segment: string
  duration: string
}

interface ForecastEntry {
  year: number
  metric: string
  value: number
  unit: string
}

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

async function upsertChunked(
  supabase: ReturnType<typeof createAdminClient>,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string
) {
  let imported = 0
  let skipped = 0

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE)
    const { data, error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict, ignoreDuplicates: false })
      .select('id')

    if (error) {
      console.error(`Error upserting to ${table}:`, error.message)
      skipped += chunk.length
    } else {
      imported += data?.length ?? chunk.length
    }
  }

  return { imported, skipped }
}

function parseSheet(workbook: XLSX.WorkBook, sheetName: string): Record<string, unknown>[] {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return []
  return XLSX.utils.sheet_to_json(sheet, { defval: null })
}

function findSheet(workbook: XLSX.WorkBook, ...prefixes: string[]): string | undefined {
  return workbook.SheetNames.find((name) =>
    prefixes.some((prefix) => name.toLowerCase().startsWith(prefix.toLowerCase()))
  )
}

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  return String(v).trim()
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

function int(v: unknown): number | null {
  const n = num(v)
  return n !== null ? Math.round(n) : null
}

function mapSegment(segment: string): 'EPCI' | 'Subsea' | 'SURF' | 'SPS' | 'Other' {
  if (!segment) return 'Other'
  const s = segment.toLowerCase()
  if (s.includes('epci')) return 'EPCI'
  if (s.includes('subsea') || s.includes('sps')) return 'SPS'
  if (s.includes('surf')) return 'SURF'
  return 'Other'
}

function parseValue(value: string): number | null {
  if (!value) return null
  const cleaned = value.replace(/[^0-9.]/g, '')
  const n = parseFloat(cleaned)
  if (Number.isNaN(n)) return null
  const lower = value.toLowerCase()
  if (lower.includes('b')) return Math.round(n * 1_000_000_000)
  if (lower.includes('m')) return Math.round(n * 1_000_000)
  if (lower.includes('k')) return Math.round(n * 1_000)
  return Math.round(n)
}

function hashStr(s: string): string {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    const chr = s.charCodeAt(i)
    hash = (hash << 5) - hash + chr
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

async function loadJob(supabase: ReturnType<typeof createAdminClient>, jobId: string): Promise<ImportJob> {
  const { data, error } = await supabase
    .from('import_jobs')
    .select('id, file_name, file_type, status, storage_bucket, storage_path, import_batch_id')
    .eq('id', jobId)
    .single()

  if (error || !data) {
    throw new Error(error?.message || `Import job not found: ${jobId}`)
  }

  if (!SUPPORTED_JOB_TYPES.includes(data.file_type as ImportJobType)) {
    throw new Error(`Unsupported import job type: ${String(data.file_type)}`)
  }

  return data as ImportJob
}

async function startBatch(
  supabase: ReturnType<typeof createAdminClient>,
  job: ImportJob,
  fileType: 'excel_rystad' | 'pdf_contract_awards' | 'pdf_market_report'
): Promise<string> {
  const { data, error } = await supabase
    .from('import_batches')
    .insert({
      file_name: job.file_name,
      file_type: fileType,
      status: 'processing',
    })
    .select('id')
    .single()

  if (error || !data) throw new Error(error?.message || 'Failed to create import batch')

  await supabase
    .from('import_jobs')
    .update({ import_batch_id: data.id, started_at: new Date().toISOString() })
    .eq('id', job.id)

  return data.id
}

async function completeBatch(
  supabase: ReturnType<typeof createAdminClient>,
  batchId: string,
  stats: { total: number; imported: number; skipped: number }
) {
  await supabase
    .from('import_batches')
    .update({
      status: 'completed',
      records_total: stats.total,
      records_imported: stats.imported,
      records_skipped: stats.skipped,
      completed_at: new Date().toISOString(),
    })
    .eq('id', batchId)
}

async function failBatch(supabase: ReturnType<typeof createAdminClient>, batchId: string, errorMessage: string) {
  await supabase
    .from('import_batches')
    .update({
      status: 'failed',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', batchId)
}

async function downloadJobBuffer(supabase: ReturnType<typeof createAdminClient>, job: ImportJob): Promise<Buffer> {
  const { data, error } = await supabase
    .storage
    .from(job.storage_bucket)
    .download(job.storage_path)

  if (error || !data) {
    throw new Error(error?.message || `Could not download ${job.storage_bucket}/${job.storage_path}`)
  }

  return Buffer.from(await data.arrayBuffer())
}

async function processExcelJob(supabase: ReturnType<typeof createAdminClient>, job: ImportJob): Promise<ProcessorStats> {
  const batchId = await startBatch(supabase, job, 'excel_rystad')

  try {
    const buffer = await downloadJobBuffer(supabase, job)
    const workbook = XLSX.read(buffer, { type: 'buffer' })

    const stats = { total: 0, imported: 0, skipped: 0 }

    const xmtRows = parseSheet(workbook, 'XMTs')
      .map((r) => ({
        import_batch_id: batchId,
        year: int((r as Record<string, unknown>)['Year']),
        continent: str((r as Record<string, unknown>)['Continent']),
        country: str((r as Record<string, unknown>)['Country']),
        development_project: str((r as Record<string, unknown>)['Development Project']),
        asset: str((r as Record<string, unknown>)['Asset']),
        operator: str((r as Record<string, unknown>)['Operator']),
        surf_contractor: str((r as Record<string, unknown>)['SURF Installation Contractor']),
        facility_category: str((r as Record<string, unknown>)['Facility Category']),
        field_type: str((r as Record<string, unknown>)['Field Type Category']),
        water_depth_category: str((r as Record<string, unknown>)['Water Depth Category']),
        distance_group: str((r as Record<string, unknown>)['Distance To Tie In Group']),
        contract_award_year: int((r as Record<string, unknown>)['XMT Contract Award Year']),
        contract_type: str((r as Record<string, unknown>)['XMT Contract Type']),
        purpose: str((r as Record<string, unknown>)['XMT Purpose']),
        state: str((r as Record<string, unknown>)['XMT State']),
        xmt_count: int((r as Record<string, unknown>)['XMTs installed (also future)']),
      }))
      .filter((r) => r.development_project)

    stats.total += xmtRows.length
    const xmtResult = await upsertChunked(supabase, 'xmt_data', xmtRows, 'year,development_project,asset,purpose,state')
    stats.imported += xmtResult.imported
    stats.skipped += xmtResult.skipped

    const surfRows = parseSheet(workbook, 'Surf lines')
      .map((r) => ({
        import_batch_id: batchId,
        year: int((r as Record<string, unknown>)['Year']),
        continent: str((r as Record<string, unknown>)['Continent']),
        country: str((r as Record<string, unknown>)['Country']),
        development_project: str((r as Record<string, unknown>)['Development Project']),
        asset: str((r as Record<string, unknown>)['Asset']),
        operator: str((r as Record<string, unknown>)['Operator']),
        surf_contractor: str((r as Record<string, unknown>)['SURF Installation Contractor']),
        facility_category: str((r as Record<string, unknown>)['Facility Category']),
        field_type: str((r as Record<string, unknown>)['Field Type Category']),
        water_depth_category: str((r as Record<string, unknown>)['Water Depth Category']),
        distance_group: str((r as Record<string, unknown>)['Distance To Tie In Group']),
        design_category: str((r as Record<string, unknown>)['SURF Line Design Category']),
        line_group: str((r as Record<string, unknown>)['SURF Line Group']),
        km_surf_lines: num((r as Record<string, unknown>)['KM Surf Lines']),
      }))
      .filter((r) => r.development_project)

    stats.total += surfRows.length
    const surfResult = await upsertChunked(supabase, 'surf_data', surfRows, 'year,development_project,asset,design_category,line_group')
    stats.imported += surfResult.imported
    stats.skipped += surfResult.skipped

    const subseaRows = parseSheet(workbook, 'Subsea units')
      .map((r) => ({
        import_batch_id: batchId,
        year: int((r as Record<string, unknown>)['Year']),
        continent: str((r as Record<string, unknown>)['Continent']),
        country: str((r as Record<string, unknown>)['Country']),
        development_project: str((r as Record<string, unknown>)['Development Project']),
        asset: str((r as Record<string, unknown>)['Asset']),
        operator: str((r as Record<string, unknown>)['Operator']),
        surf_contractor: str((r as Record<string, unknown>)['SURF Installation Contractor']),
        facility_category: str((r as Record<string, unknown>)['Facility Category']),
        field_type: str((r as Record<string, unknown>)['Field Type Category']),
        water_depth_category: str((r as Record<string, unknown>)['Water Depth Category']),
        distance_group: str((r as Record<string, unknown>)['Distance To Tie In Group']),
        unit_category: str((r as Record<string, unknown>)['Subsea Unit Category']),
        unit_count: int((r as Record<string, unknown>)['Subsea Units']),
      }))
      .filter((r) => r.development_project)

    stats.total += subseaRows.length
    const subseaResult = await upsertChunked(supabase, 'subsea_unit_data', subseaRows, 'year,development_project,asset,unit_category')
    stats.imported += subseaResult.imported
    stats.skipped += subseaResult.skipped

    const awardsSheetName = findSheet(workbook, 'Upcomming awards', 'Upcoming awards') || 'Upcomming awards'
    const awardRows = parseSheet(workbook, awardsSheetName)
      .map((r) => ({
        import_batch_id: batchId,
        year: int((r as Record<string, unknown>)['Year']),
        country: str((r as Record<string, unknown>)['Country']),
        development_project: str((r as Record<string, unknown>)['Development Project']),
        asset: str((r as Record<string, unknown>)['Asset']),
        operator: str((r as Record<string, unknown>)['Operator']),
        surf_contractor: str((r as Record<string, unknown>)['SURF Installation Contractor']),
        facility_category: str((r as Record<string, unknown>)['Facility Category']),
        field_size_category: str((r as Record<string, unknown>)['Field Size Category']),
        field_type: str((r as Record<string, unknown>)['Field Type Category']),
        water_depth_category: str((r as Record<string, unknown>)['Water Depth Category']),
        xmts_awarded: int((r as Record<string, unknown>)['XMTs Awarded']),
      }))
      .filter((r) => r.development_project)

    stats.total += awardRows.length
    const awardResult = await upsertChunked(supabase, 'upcoming_awards', awardRows, 'year,development_project,asset')
    stats.imported += awardResult.imported
    stats.skipped += awardResult.skipped

    const projectMap = new Map<string, Record<string, unknown>>()
    const allRows = [
      ...xmtRows.map((row) => ({ ...row, _type: 'xmt' })),
      ...surfRows.map((row) => ({ ...row, _type: 'surf' })),
      ...subseaRows.map((row) => ({ ...row, _type: 'subsea' })),
      ...awardRows.map((row) => ({ ...row, _type: 'award' })),
    ]

    for (const row of allRows) {
      const key = `${row.development_project}|${row.asset}|${row.country}`
      if (!projectMap.has(key)) {
        projectMap.set(key, {
          development_project: row.development_project,
          asset: row.asset,
          country: row.country,
          continent: (row as Record<string, unknown>).continent ?? null,
          operator: row.operator,
          surf_contractor: row.surf_contractor,
          facility_category: row.facility_category,
          field_type: row.field_type,
          water_depth_category: row.water_depth_category,
          field_size_category: (row as Record<string, unknown>).field_size_category ?? null,
          xmt_count: 0,
          surf_km: 0,
          subsea_unit_count: 0,
          first_year: row.year,
          last_year: row.year,
        })
      }

      const project = projectMap.get(key)!
      if (row.year) {
        if (!project.first_year || row.year < (project.first_year as number)) project.first_year = row.year
        if (!project.last_year || row.year > (project.last_year as number)) project.last_year = row.year
      }

      if (row._type === 'xmt') project.xmt_count = ((project.xmt_count as number) || 0) + ((row as Record<string, unknown>).xmt_count as number || 0)
      if (row._type === 'surf') project.surf_km = ((project.surf_km as number) || 0) + ((row as Record<string, unknown>).km_surf_lines as number || 0)
      if (row._type === 'subsea') project.subsea_unit_count = ((project.subsea_unit_count as number) || 0) + ((row as Record<string, unknown>).unit_count as number || 0)
    }

    const projects = Array.from(projectMap.values())
    if (projects.length > 0) {
      await upsertChunked(supabase, 'projects', projects, 'development_project,asset,country')
    }

    const contractRows = awardRows
      .map((row) => ({
        date: `${row.year}-01-01`,
        supplier: row.surf_contractor || 'TBD',
        operator: row.operator || 'Unknown',
        project_name: row.development_project || 'Unknown',
        description: `${row.xmts_awarded || 0} XMTs awarded - ${row.facility_category || 'N/A'}`,
        contract_type: 'Subsea' as const,
        region: row.country,
        country: row.country,
        source: 'rystad_forecast' as const,
        pipeline_phase: 'feed' as const,
        external_id: `rystad-award-${row.year}-${row.development_project}-${row.asset}`,
      }))
      .filter((row) => row.project_name !== 'Unknown')

    if (contractRows.length > 0) {
      await upsertChunked(supabase, 'contracts', contractRows, 'external_id')
    }

    await completeBatch(supabase, batchId, stats)

    return {
      batchId,
      recordsTotal: stats.total,
      recordsImported: stats.imported,
      recordsSkipped: stats.skipped,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await failBatch(supabase, batchId, message)
    throw error
  }
}

async function processPdfContractsJob(supabase: ReturnType<typeof createAdminClient>, job: ImportJob): Promise<ProcessorStats> {
  const batchId = await startBatch(supabase, job, 'pdf_contract_awards')

  try {
    const buffer = await downloadJobBuffer(supabase, job)
    const base64 = buffer.toString('base64')

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: {
                file_data: `data:application/pdf;base64,${base64}`,
                filename: job.file_name,
              },
            } as unknown as OpenAI.Chat.Completions.ChatCompletionContentPartText,
            {
              type: 'text',
              text: `Extract ALL contract rows from this PDF table. The table has columns: Leverandør (supplier), Operatør (operator), Verdi (value), Omfang (scope), Region/Prosjekt (region/project), Segment, and Varighet (duration/contract period).

Return a JSON array of objects with these exact fields:
- supplier: string
- operator: string
- value: string (keep original format, e.g. "NOK 500M" or "USD 1.2B")
- scope: string (full description)
- region: string
- segment: string
- duration: string (contract duration/period, e.g. "2025-2028", "3 years", "36 months". Empty string if not found)

Extract EVERY row from ALL pages. Return ONLY the JSON array, no other text.`,
            },
          ],
        },
      ],
      temperature: 0,
      max_completion_tokens: 16000,
    })

    const content = response.choices[0]?.message?.content || '[]'
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    const rows: ContractRow[] = jsonMatch ? JSON.parse(jsonMatch[0]) : []

    const contractRows = rows.map((row) => ({
      date: new Date().toISOString().split('T')[0],
      supplier: row.supplier || 'Unknown',
      operator: row.operator || 'Unknown',
      project_name: row.region || 'Unknown',
      description: [row.scope, row.duration ? `Varighet: ${row.duration}` : ''].filter(Boolean).join(' | ') || '',
      contract_type: mapSegment(row.segment),
      region: row.region,
      source: 'rystad_awards' as const,
      pipeline_phase: 'awarded' as const,
      external_id: `rystad-pdf-${hashStr(row.supplier + row.operator + (row.scope || '').substring(0, 100))}`,
      estimated_value_usd: parseValue(row.value),
    }))

    let imported = 0
    let skipped = 0

    for (let i = 0; i < contractRows.length; i += CHUNK_SIZE) {
      const chunk = contractRows.slice(i, i + CHUNK_SIZE)
      const { data, error } = await supabase
        .from('contracts')
        .upsert(chunk, { onConflict: 'external_id', ignoreDuplicates: false })
        .select('id')

      if (error) {
        console.error('PDF contract upsert error:', error.message)
        skipped += chunk.length
      } else {
        imported += data?.length ?? chunk.length
      }
    }

    await completeBatch(supabase, batchId, {
      total: rows.length,
      imported,
      skipped,
    })

    return {
      batchId,
      recordsTotal: rows.length,
      recordsImported: imported,
      recordsSkipped: skipped,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await failBatch(supabase, batchId, message)
    throw error
  }
}

async function processMarketReportJob(supabase: ReturnType<typeof createAdminClient>, job: ImportJob): Promise<ProcessorStats> {
  const batchId = await startBatch(supabase, job, 'pdf_market_report')

  try {
    const buffer = await downloadJobBuffer(supabase, job)
    const base64 = buffer.toString('base64')

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: {
                file_data: `data:application/pdf;base64,${base64}`,
                filename: job.file_name,
              },
            } as unknown as OpenAI.Chat.Completions.ChatCompletionContentPartText,
            {
              type: 'text',
              text: `This is a Subsea Market Report. Analyze the entire document and return a JSON object with:

1. "summary": A comprehensive executive summary (500-800 words) covering:
   - Market outlook and trends
   - Key regions and activity drivers
   - Major operators and contractors mentioned
   - Risks and challenges
   - Notable contract awards or project updates

2. "key_figures": An object with notable numbers extracted:
   - "total_subsea_capex_usd_bn": number or null
   - "xmt_forecast_units": number or null (annual XMT installations forecast)
   - "surf_km_forecast": number or null
   - "yoy_growth_pct": number or null (year-over-year growth)
   - Other notable metrics as key-value pairs

3. "forecasts": An array of forecast data points, each with:
   - "year": number (the forecast year)
   - "metric": string (e.g. "subsea_capex_usd_bn", "xmt_installations", "surf_km", "subsea_unit_count", "pipeline_km")
   - "value": number
   - "unit": string (e.g. "USD bn", "units", "km", "%")

Extract as many forecast data points as possible from tables, charts and text. Include historical data points if shown.

4. "report_period": string (e.g. "Q1 2024", "Q3 2024")

Return ONLY valid JSON, no other text.`,
            },
          ],
        },
      ],
      temperature: 0,
      max_completion_tokens: 16000,
    })

    const content = response.choices[0]?.message?.content || '{}'
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}

    const summary = parsed.summary || 'No summary generated'
    const keyFigures = parsed.key_figures || {}
    const forecasts: ForecastEntry[] = parsed.forecasts || []
    const reportPeriod = parsed.report_period || job.file_name

    const { data: existingDoc } = await supabase
      .from('documents')
      .select('id')
      .eq('file_name', job.file_name)
      .limit(1)

    let documentId: string
    if (existingDoc && existingDoc.length > 0) {
      documentId = existingDoc[0].id
      await supabase
        .from('documents')
        .update({
          ai_summary: `## ${reportPeriod}\n\n${summary}\n\n### Key Figures\n${JSON.stringify(keyFigures, null, 2)}`,
          file_path: `${job.storage_bucket}/${job.storage_path}`,
          file_size_bytes: buffer.length,
        })
        .eq('id', documentId)
    } else {
      const { data: doc, error: docError } = await supabase
        .from('documents')
        .insert({
          uploaded_by: '00000000-0000-0000-0000-000000000000',
          file_name: job.file_name,
          file_path: `${job.storage_bucket}/${job.storage_path}`,
          file_type: 'application/pdf',
          file_size_bytes: buffer.length,
          ai_summary: `## ${reportPeriod}\n\n${summary}\n\n### Key Figures\n${JSON.stringify(keyFigures, null, 2)}`,
        })
        .select('id')
        .single()

      if (docError || !doc) {
        throw new Error(docError?.message || 'Failed to create market report document')
      }

      documentId = doc.id
    }

    let forecastsImported = 0
    if (forecasts.length > 0) {
      const forecastRows = forecasts.map((f) => ({
        year: f.year,
        metric: f.metric,
        value: f.value,
        unit: f.unit,
        source: 'rystad_report',
      }))

      for (const row of forecastRows) {
        const { error } = await supabase
          .from('forecasts')
          .upsert(row, { onConflict: 'year,metric', ignoreDuplicates: false })

        if (!error) forecastsImported++
      }
    }

    const total = forecasts.length + 1
    const imported = forecastsImported + 1

    await completeBatch(supabase, batchId, {
      total,
      imported,
      skipped: 0,
    })

    return {
      batchId,
      recordsTotal: total,
      recordsImported: imported,
      recordsSkipped: 0,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await failBatch(supabase, batchId, message)
    throw error
  }
}

export async function processImportJob(jobId: string): Promise<ProcessorStats> {
  const supabase = createAdminClient()
  const job = await loadJob(supabase, jobId)

  if (job.status === 'completed') {
    return {
      batchId: job.import_batch_id || '',
      recordsTotal: 0,
      recordsImported: 0,
      recordsSkipped: 0,
    }
  }

  await supabase
    .from('import_jobs')
    .update({ status: 'processing', started_at: new Date().toISOString(), error_message: null })
    .eq('id', job.id)

  try {
    let result: ProcessorStats

    if (job.file_type === 'excel_rystad') {
      result = await processExcelJob(supabase, job)
    } else if (job.file_type === 'pdf_contract_awards') {
      result = await processPdfContractsJob(supabase, job)
    } else {
      result = await processMarketReportJob(supabase, job)
    }

    await supabase
      .from('import_jobs')
      .update({
        status: 'completed',
        import_batch_id: result.batchId,
        records_total: result.recordsTotal,
        records_imported: result.recordsImported,
        records_skipped: result.recordsSkipped,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)

    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    await supabase
      .from('import_jobs')
      .update({
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)

    throw error
  }
}
