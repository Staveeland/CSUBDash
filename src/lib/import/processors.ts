import 'server-only'

import * as XLSX from 'xlsx'
import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'

const CHUNK_SIZE = 500

let _systemUserId: string | null = null
async function getSystemUserId(supabase: ReturnType<typeof createAdminClient>): Promise<string> {
  if (_systemUserId) return _systemUserId

  const existingUsers = await supabase
    .from('users')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)

  const existingId = existingUsers.data?.[0]?.id
  if (!existingUsers.error && existingId) {
    _systemUserId = existingId
    return existingId
  }

  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 })
  const firstUser = data?.users?.[0]
  if (!firstUser?.id) throw new Error('No users found in auth.users — cannot set uploaded_by')

  const upsertUser = await supabase
    .from('users')
    .upsert(
      {
        id: firstUser.id,
        email: firstUser.email ?? 'system@csub.com',
        full_name: (firstUser.user_metadata?.full_name as string | undefined) ?? null,
        role: 'admin',
      },
      { onConflict: 'id' }
    )

  if (upsertUser.error) {
    throw new Error(`Failed to create fallback user for document uploads: ${upsertUser.error.message}`)
  }

  _systemUserId = firstUser.id
  return firstUser.id
}

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

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

/**
 * Deduplicate rows by conflict key columns.
 * When duplicates exist, numeric values are summed and the last row's
 * non-numeric values win.
 */
function deduplicateByConflictKey(
  rows: Record<string, unknown>[],
  conflictColumns: string[]
): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>()

  for (const row of rows) {
    const key = conflictColumns.map((col) => String(row[col] ?? '')).join('|:|')

    if (!map.has(key)) {
      map.set(key, { ...row })
    } else {
      const existing = map.get(key)!
      for (const [k, v] of Object.entries(row)) {
        if (conflictColumns.includes(k)) continue
        if (typeof v === 'number' && typeof existing[k] === 'number') {
          ;(existing[k] as number) += v
        } else if (v !== null && v !== undefined) {
          existing[k] = v
        }
      }
    }
  }

  return Array.from(map.values())
}

async function upsertChunked(
  supabase: ReturnType<typeof createAdminClient>,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string
) {
  let imported = 0
  let skipped = 0
  const conflictColumns = onConflict.split(',').map((c) => c.trim())

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const rawChunk = rows.slice(i, i + CHUNK_SIZE)
    const chunk = deduplicateByConflictKey(rawChunk, conflictColumns)
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

function normalizeMetricKey(metric: string): string {
  return metric
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeForecastMetric(metric: string): string {
  const normalized = normalizeMetricKey(metric)
  if (!normalized) return normalized

  const regionalMetricCandidates: Array<{ pattern: RegExp; metric: string }> = [
    { pattern: /(^|_)europe(_|$)/, metric: 'europe_subsea_spend_total_usd_bn' },
    { pattern: /(^|_)south_america(_|$)/, metric: 'south_america_subsea_spend_total_usd_bn' },
    { pattern: /(^|_)north_america(_|$)/, metric: 'north_america_subsea_spend_total_usd_bn' },
    { pattern: /(^|_)africa(_|$)/, metric: 'africa_subsea_spend_total_usd_bn' },
    { pattern: /(^|_)asia(_|$)|(^|_)australia(_|$)/, metric: 'asia_australia_subsea_spend_total_usd_bn' },
    { pattern: /(^|_)middle_east(_|$)|(^|_)russia(_|$)/, metric: 'middle_east_russia_subsea_spend_total_usd_bn' },
  ]

  const isRegionalSpend =
    normalized.includes('subsea') &&
    (normalized.includes('spend') || normalized.includes('capex')) &&
    regionalMetricCandidates.some((candidate) => candidate.pattern.test(normalized))

  if (isRegionalSpend) {
    const regionalMetric = regionalMetricCandidates.find((candidate) => candidate.pattern.test(normalized))
    if (regionalMetric) return regionalMetric.metric
  }

  if (
    normalized.includes('subsea') &&
    (normalized.includes('spend') || normalized.includes('spending') || normalized.includes('capex')) &&
    (normalized.includes('usd') || normalized.includes('bn') || normalized.includes('billion'))
  ) {
    return 'subsea_spend_usd_bn'
  }

  if (
    normalized.includes('xmt') &&
    (normalized.includes('install') || normalized.includes('unit') || normalized.includes('count') || normalized.includes('tree'))
  ) {
    return 'xmt_installations'
  }

  if (
    normalized.includes('surf') &&
    (normalized.includes('km') || normalized.includes('install') || normalized.includes('line'))
  ) {
    return 'surf_km'
  }

  if (
    (normalized.includes('growth') || normalized.includes('yoy')) &&
    (normalized.includes('subsea') || normalized.includes('capex') || normalized.includes('spend'))
  ) {
    return 'subsea_capex_growth_yoy_pct'
  }

  if (normalized.includes('brent')) {
    return 'brent_avg_usd_per_bbl'
  }

  if (normalized.includes('pipeline') && normalized.includes('km')) {
    return 'pipeline_km'
  }

  return normalized
}

function normalizeForecastUnit(unit: unknown): string {
  if (typeof unit !== 'string') return ''
  const cleaned = unit.trim()
  if (!cleaned) return ''

  const normalized = cleaned.toLowerCase()

  if (normalized.includes('usd') && (normalized.includes('bn') || normalized.includes('billion'))) return 'USD bn'
  if (normalized === '%' || normalized.includes('percent') || normalized.includes('pct')) return '%'
  if (normalized.includes('km')) return 'km'
  if (normalized.includes('unit')) return 'units'
  if (normalized.includes('bbl') || normalized.includes('barrel')) return 'USD/bbl'

  return cleaned
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim()
    if (!cleaned) return null
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toYear(value: unknown): number | null {
  const parsed = toNumber(value)
  if (parsed === null) return null
  const year = Math.round(parsed)
  return year >= 1900 && year <= 2200 ? year : null
}

function extractFirstJsonObject(content: string): string | null {
  const start = content.indexOf('{')
  if (start < 0) return null

  let depth = 0
  let inString = false
  let escaping = false

  for (let i = start; i < content.length; i++) {
    const char = content[i]

    if (inString) {
      if (escaping) {
        escaping = false
      } else if (char === '\\') {
        escaping = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') depth++
    if (char === '}') {
      depth--
      if (depth === 0) return content.slice(start, i + 1)
    }
  }

  return null
}

function parseResponseJsonObject(content: string): Record<string, unknown> {
  const strippedCodeFence = content
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const candidate = strippedCodeFence.startsWith('{')
    ? strippedCodeFence
    : extractFirstJsonObject(strippedCodeFence)

  if (!candidate) return {}

  try {
    const parsed = JSON.parse(candidate)
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function extractSummaryHighlights(summary: string): string[] {
  const bullets = summary.match(/^\s*(?:[-*•]|\d+\.)\s+(.+)$/gm) || []
  const cleanedBullets = bullets
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+\.)\s+/, '').trim())
    .filter((line) => line.length > 16)
    .slice(0, 6)

  if (cleanedBullets.length > 0) return cleanedBullets

  return summary
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 32)
    .map((paragraph) => {
      const sentence = paragraph.match(/^[^.!?]+[.!?]/)
      return sentence ? sentence[0].trim() : `${paragraph.slice(0, 160).trim()}…`
    })
    .slice(0, 5)
}

function buildMarketSummaryMarkdown(input: {
  reportHeading: string
  reportTitle: string | null
  summary: string
  highlights: string[]
  keyFigures: Record<string, unknown>
}): string {
  const normalizedKeyFigures = Object.fromEntries(
    Object.entries(input.keyFigures).map(([key, value]) => [key, value ?? null])
  )

  const sections = [
    `## ${input.reportHeading}`,
    input.reportTitle && input.reportTitle !== input.reportHeading
      ? `### Report\n${input.reportTitle}`
      : '',
    input.highlights.length > 0
      ? `### Highlights\n${input.highlights.map((line) => `- ${line}`).join('\n')}`
      : '',
    input.summary.trim().length > 0
      ? `### Executive Summary\n${input.summary.trim()}`
      : '',
    `### Key Figures\n\`\`\`json\n${JSON.stringify(normalizedKeyFigures, null, 2)}\n\`\`\``,
  ]

  return sections.filter(Boolean).join('\n\n')
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
        purpose: str((r as Record<string, unknown>)['XMT Purpose']) || '',
        state: str((r as Record<string, unknown>)['XMT State']) || '',
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
        design_category: str((r as Record<string, unknown>)['SURF Line Design Category']) || '',
        line_group: str((r as Record<string, unknown>)['SURF Line Group']) || '',
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
        unit_category: str((r as Record<string, unknown>)['Subsea Unit Category']) || '',
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
              text: `Analyze this Subsea Market Report and return ONE valid JSON object with this schema:
{
  "report_period": "Q1 2026" | null,
  "report_title": "string" | null,
  "summary": "executive summary text",
  "highlights": ["bullet", "bullet"],
  "key_figures": {
    "total_subsea_capex_usd_bn": number | null,
    "xmt_forecast_units": number | null,
    "surf_km_forecast": number | null,
    "yoy_growth_pct": number | null,
    "brent_avg_usd_per_bbl": number | null
  },
  "forecasts": [
    { "year": 2026, "metric": "subsea_spend_usd_bn", "value": 54.3, "unit": "USD bn" },
    { "year": 2026, "metric": "xmt_installations", "value": 1120, "unit": "units" }
  ]
}

Rules:
- Extract as many yearly forecast datapoints as possible from charts/tables/text.
- Prefer these canonical metric names when possible:
  subsea_spend_usd_bn, xmt_installations, surf_km, subsea_capex_growth_yoy_pct, brent_avg_usd_per_bbl, pipeline_km
- Regional spend should use:
  europe_subsea_spend_total_usd_bn, south_america_subsea_spend_total_usd_bn, north_america_subsea_spend_total_usd_bn,
  africa_subsea_spend_total_usd_bn, asia_australia_subsea_spend_total_usd_bn, middle_east_russia_subsea_spend_total_usd_bn
- No markdown. No prose outside JSON.`,
            },
          ],
        },
      ],
      temperature: 0,
      max_completion_tokens: 16000,
    })

    const content = response.choices[0]?.message?.content || '{}'
    const parsed = parseResponseJsonObject(content)

    const summary = typeof parsed.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim()
      : 'No summary generated'

    const reportPeriod = typeof parsed.report_period === 'string' && parsed.report_period.trim()
      ? parsed.report_period.trim()
      : null

    const reportTitle = typeof parsed.report_title === 'string' && parsed.report_title.trim()
      ? parsed.report_title.trim()
      : null

    const keyFigures = (
      parsed.key_figures && typeof parsed.key_figures === 'object' && !Array.isArray(parsed.key_figures)
        ? parsed.key_figures
        : {}
    ) as Record<string, unknown>

    const modelHighlights = Array.isArray(parsed.highlights)
      ? parsed.highlights
        .map((line) => (typeof line === 'string' ? line.trim() : ''))
        .filter((line) => line.length > 10)
        .slice(0, 6)
      : []

    const highlights = modelHighlights.length > 0 ? modelHighlights : extractSummaryHighlights(summary)
    const reportHeading = reportPeriod || reportTitle || job.file_name
    const aiSummary = buildMarketSummaryMarkdown({
      reportHeading,
      reportTitle,
      summary,
      highlights,
      keyFigures,
    })

    const rawForecasts = Array.isArray(parsed.forecasts) ? parsed.forecasts : []
    const normalizedForecasts = rawForecasts
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null

        const row = entry as Record<string, unknown>
        const year = toYear(row.year)
        const value = toNumber(row.value)
        const metric = typeof row.metric === 'string' ? normalizeForecastMetric(row.metric) : ''
        const unit = normalizeForecastUnit(row.unit)

        if (year === null || value === null || !metric) return null

        return {
          year,
          metric,
          value,
          unit,
          source: 'rystad_report' as const,
        }
      })
      .filter((row): row is { year: number; metric: string; value: number; unit: string; source: 'rystad_report' } => Boolean(row))

    const fallbackYearFromText = (() => {
      const match = (reportPeriod || reportTitle || job.file_name).match(/\b(19|20)\d{2}\b/)
      return match ? Number(match[0]) : null
    })()

    if (!normalizedForecasts.length && fallbackYearFromText !== null) {
      const keyFigureMap = new Map<string, number>()
      for (const [key, value] of Object.entries(keyFigures)) {
        const parsedNumber = toNumber(value)
        if (parsedNumber === null) continue
        keyFigureMap.set(normalizeMetricKey(key), parsedNumber)
      }

      const fallbackMetrics = [
        { keyOptions: ['total_subsea_capex_usd_bn', 'subsea_spend_usd_bn', 'subsea_capex_usd_bn'], metric: 'subsea_spend_usd_bn', unit: 'USD bn' },
        { keyOptions: ['xmt_forecast_units', 'xmt_installations'], metric: 'xmt_installations', unit: 'units' },
        { keyOptions: ['surf_km_forecast', 'surf_km'], metric: 'surf_km', unit: 'km' },
        { keyOptions: ['yoy_growth_pct', 'subsea_capex_growth_yoy_pct'], metric: 'subsea_capex_growth_yoy_pct', unit: '%' },
        { keyOptions: ['brent_avg_usd_per_bbl', 'brent_price_usd'], metric: 'brent_avg_usd_per_bbl', unit: 'USD/bbl' },
      ]

      for (const fallback of fallbackMetrics) {
        const value = fallback.keyOptions
          .map((key) => keyFigureMap.get(normalizeMetricKey(key)) ?? null)
          .find((candidate) => candidate !== null)

        if (typeof value === 'number') {
          normalizedForecasts.push({
            year: fallbackYearFromText,
            metric: fallback.metric,
            value,
            unit: fallback.unit,
            source: 'rystad_report' as const,
          })
        }
      }
    }

    const dedupedForecasts = Array.from(
      normalizedForecasts.reduce((map, row) => {
        map.set(`${row.year}:${row.metric}`, row)
        return map
      }, new Map<string, { year: number; metric: string; value: number; unit: string; source: 'rystad_report' }>())
      .values()
    )

    const existingDocRes = await supabase
      .from('documents')
      .select('id')
      .eq('file_name', job.file_name)
      .order('created_at', { ascending: false })
      .limit(1)

    if (existingDocRes.error) {
      throw new Error(existingDocRes.error.message)
    }

    if (existingDocRes.data && existingDocRes.data.length > 0) {
      await supabase
        .from('documents')
        .update({
          ai_summary: aiSummary,
          file_path: `${job.storage_bucket}/${job.storage_path}`,
          file_size_bytes: buffer.length,
        })
        .eq('id', existingDocRes.data[0].id)
    } else {
      const systemUserId = await getSystemUserId(supabase)
      const { data: doc, error: docError } = await supabase
        .from('documents')
        .insert({
          uploaded_by: systemUserId,
          file_name: job.file_name,
          file_path: `${job.storage_bucket}/${job.storage_path}`,
          file_type: 'application/pdf',
          file_size_bytes: buffer.length,
          ai_summary: aiSummary,
        })
        .select('id')
        .single()

      if (docError || !doc) {
        throw new Error(docError?.message || 'Failed to create market report document')
      }
    }

    let forecastsImported = 0
    let forecastsSkipped = 0
    if (dedupedForecasts.length > 0) {
      for (const row of dedupedForecasts) {
        const { error } = await supabase
          .from('forecasts')
          .upsert(row, { onConflict: 'year,metric', ignoreDuplicates: false })

        if (!error) forecastsImported++
        if (error) forecastsSkipped++
      }
    }

    const total = dedupedForecasts.length + 1
    const imported = forecastsImported + 1

    await completeBatch(supabase, batchId, {
      total,
      imported,
      skipped: forecastsSkipped,
    })

    return {
      batchId,
      recordsTotal: total,
      recordsImported: imported,
      recordsSkipped: forecastsSkipped,
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
