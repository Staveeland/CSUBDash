/**
 * Direct import script - bypasses API auth by calling processor directly.
 * Usage: npx tsx scripts/import-all.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import OpenAI from 'openai'
import * as fs from 'fs'
import * as path from 'path'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const DOWNLOADS = path.join(process.env.HOME!, 'Downloads')

const EXCEL_FILES = [
  'XMTs Surf lines, Subsea Units and Upcomming awards 04.04.25.xlsx',
  'Xmts 2026-34 global.xlsx',
  'Surflines 2026-34 global.xlsx',
  'Subsea units 2026-34 global.xlsx',
  // Manifolds is identical to Surflines - skip
]

const PDF_FILES = [
  'OFS Contract Updates 2025-2026.pdf',
  'Subsea Market Report 1Q 2024.pdf',
  'Subsea Market Report _ 2Q 2024.pdf',
  'Subsea Market Report 3Q 2024.pdf',
  'Subsea Market Report 4Q 2024.pdf',
  'Subsea Market Report 1Q 2025.pdf',
  'Subsea Market Report _ 2Q 2025.pdf',
]

const CHUNK_SIZE = 500

// --- Helpers ---
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

function fuzzyCol(columns: string[], ...patterns: string[]): string | undefined {
  for (const p of patterns) {
    const lower = p.toLowerCase()
    const found = columns.find(c => c.toLowerCase().includes(lower))
    if (found) return found
  }
  return undefined
}

function getCol(row: Record<string, unknown>, columns: string[], ...patterns: string[]): unknown {
  const col = fuzzyCol(columns, ...patterns)
  return col ? row[col] : undefined
}

type DetectedType = 'xmt' | 'surf' | 'subsea' | 'awards'

function detectSheetType(columns: string[]): DetectedType | null {
  const lower = columns.map(c => c.toLowerCase())
  if (lower.some(c => c.includes('xmts awarded'))) return 'awards'
  if (lower.some(c => c.includes('subsea unit category')) || lower.some(c => /subsea\s*units?\s*(\(|$)/i.test(c))) return 'subsea'
  if (lower.some(c => c.includes('surf line group')) || lower.some(c => c.includes('surf line purpose')) || lower.some(c => c.includes('km surf lines')) || lower.some(c => c.includes('surf line design category'))) return 'surf'
  if (lower.some(c => c.includes('xmt purpose')) || lower.some(c => c.includes('xmt state')) || lower.some(c => /xmts?\s*(installed|\(#|$)/i.test(c))) return 'xmt'
  return null
}

function mapCommon(row: Record<string, unknown>, columns: string[], batchId: string) {
  return {
    import_batch_id: batchId,
    year: int(getCol(row, columns, 'Year')),
    continent: str(getCol(row, columns, 'Continent')),
    country: str(getCol(row, columns, 'Country')),
    development_project: str(getCol(row, columns, 'Development Project')),
    asset: str(getCol(row, columns, 'Asset')),
    operator: str(getCol(row, columns, 'Operator')),
    surf_contractor: str(getCol(row, columns, 'SURF Installation Contractor')),
    facility_category: str(getCol(row, columns, 'Facility Category')),
    field_type: str(getCol(row, columns, 'Field Type Category')),
    water_depth_category: str(getCol(row, columns, 'Water Depth Category')),
    distance_group: str(getCol(row, columns, 'Distance To Tie In Group')),
  }
}

function mapXmt(row: Record<string, unknown>, columns: string[], batchId: string) {
  return {
    ...mapCommon(row, columns, batchId),
    contract_award_year: int(getCol(row, columns, 'XMT Contract Award Year')),
    contract_type: str(getCol(row, columns, 'XMT Contract Type')),
    purpose: str(getCol(row, columns, 'XMT Purpose')) || '',
    state: str(getCol(row, columns, 'XMT State')) || '',
    xmt_count: int(getCol(row, columns, 'XMTs installed', 'XMTs (# Installed)', 'XMTs')),
  }
}

function mapSurf(row: Record<string, unknown>, columns: string[], batchId: string) {
  return {
    ...mapCommon(row, columns, batchId),
    design_category: str(getCol(row, columns, 'SURF Line Design Category')) || '',
    line_group: str(getCol(row, columns, 'SURF Line Group')) || '',
    km_surf_lines: num(getCol(row, columns, 'KM Surf Lines')),
  }
}

function mapSubsea(row: Record<string, unknown>, columns: string[], batchId: string) {
  return {
    ...mapCommon(row, columns, batchId),
    unit_category: str(getCol(row, columns, 'Subsea Unit Category')) || '',
    unit_count: int(getCol(row, columns, 'Subsea units (# Installed)', 'Subsea Units', 'Subsea units')),
  }
}

function mapAward(row: Record<string, unknown>, columns: string[], batchId: string) {
  return {
    ...mapCommon(row, columns, batchId),
    field_size_category: str(getCol(row, columns, 'Field Size Category')),
    xmts_awarded: int(getCol(row, columns, 'XMTs Awarded')),
  }
}

function dedup(rows: Record<string, unknown>[], conflictColumns: string[]): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>()
  for (const row of rows) {
    const key = conflictColumns.map(col => String(row[col] ?? '')).join('|:|')
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

async function upsertChunked(table: string, rows: Record<string, unknown>[], onConflict: string) {
  let imported = 0, skipped = 0
  const conflictColumns = onConflict.split(',').map(c => c.trim())
  
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = dedup(rows.slice(i, i + CHUNK_SIZE), conflictColumns)
    const { data, error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict, ignoreDuplicates: false })
      .select('id')
    
    if (error) {
      console.error(`  ⚠️  Upsert error in ${table}: ${error.message}`)
      skipped += chunk.length
    } else {
      imported += data?.length ?? chunk.length
    }
  }
  return { imported, skipped }
}

async function processExcel(fileName: string) {
  const filePath = path.join(DOWNLOADS, fileName)
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  ${fileName} not found, skipping`)
    return
  }

  console.log(`\n📊 Processing: ${fileName}`)
  
  // Create batch
  const { data: batch } = await supabase.from('import_batches').insert({
    file_name: fileName,
    file_type: 'excel_rystad',
    status: 'processing',
  }).select('id').single()
  const batchId = batch!.id

  const buffer = fs.readFileSync(filePath)
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  
  const allXmt: Record<string, unknown>[] = []
  const allSurf: Record<string, unknown>[] = []
  const allSubsea: Record<string, unknown>[] = []
  const allAwards: Record<string, unknown>[] = []

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]) as Record<string, unknown>[]
    if (rows.length === 0) continue
    
    const columns = Object.keys(rows[0])
    let detected = detectSheetType(columns)
    
    // Fallback: sheet name for awards
    if (!detected && /awards?/i.test(sheetName)) detected = 'awards'
    
    if (!detected) {
      console.log(`  ⏭️  Sheet "${sheetName}" — unrecognized, skipping`)
      continue
    }

    console.log(`  📋 Sheet "${sheetName}" → ${detected.toUpperCase()} (${rows.length} rows)`)
    
    for (const r of rows) {
      switch (detected) {
        case 'xmt': { const m = mapXmt(r, columns, batchId); if (m.development_project) allXmt.push(m); break }
        case 'surf': { const m = mapSurf(r, columns, batchId); if (m.development_project) allSurf.push(m); break }
        case 'subsea': { const m = mapSubsea(r, columns, batchId); if (m.development_project) allSubsea.push(m); break }
        case 'awards': { const m = mapAward(r, columns, batchId); if (m.development_project) allAwards.push(m); break }
      }
    }
  }

  let totalImported = 0, totalSkipped = 0, totalRows = 0

  if (allXmt.length > 0) {
    totalRows += allXmt.length
    const r = await upsertChunked('xmt_data', allXmt, 'year,development_project,asset,purpose,state')
    totalImported += r.imported; totalSkipped += r.skipped
    console.log(`  XMT: ${r.imported} imported, ${r.skipped} skipped`)
  }
  if (allSurf.length > 0) {
    totalRows += allSurf.length
    const r = await upsertChunked('surf_data', allSurf, 'year,development_project,asset,design_category,line_group')
    totalImported += r.imported; totalSkipped += r.skipped
    console.log(`  SURF: ${r.imported} imported, ${r.skipped} skipped`)
  }
  if (allSubsea.length > 0) {
    totalRows += allSubsea.length
    const r = await upsertChunked('subsea_unit_data', allSubsea, 'year,development_project,asset,unit_category')
    totalImported += r.imported; totalSkipped += r.skipped
    console.log(`  Subsea: ${r.imported} imported, ${r.skipped} skipped`)
  }
  if (allAwards.length > 0) {
    totalRows += allAwards.length
    const r = await upsertChunked('upcoming_awards', allAwards, 'year,development_project,asset')
    totalImported += r.imported; totalSkipped += r.skipped
    console.log(`  Awards: ${r.imported} imported, ${r.skipped} skipped`)
  }

  // Build projects summary
  const projectMap = new Map<string, Record<string, unknown>>()
  const tagged = [
    ...allXmt.map(r => ({ ...r, _type: 'xmt' })),
    ...allSurf.map(r => ({ ...r, _type: 'surf' })),
    ...allSubsea.map(r => ({ ...r, _type: 'subsea' })),
    ...allAwards.map(r => ({ ...r, _type: 'award' })),
  ]

  for (const row of tagged as any[]) {
    const key = `${row.development_project}|${row.asset}|${row.country}`
    if (!projectMap.has(key)) {
      projectMap.set(key, {
        development_project: row.development_project,
        asset: row.asset,
        country: row.country,
        continent: row.continent ?? null,
        operator: row.operator,
        surf_contractor: row.surf_contractor,
        facility_category: row.facility_category,
        field_type: row.field_type,
        water_depth_category: row.water_depth_category,
        field_size_category: (row as any).field_size_category ?? null,
        xmt_count: 0,
        surf_km: 0,
        subsea_unit_count: 0,
        first_year: row.year,
        last_year: row.year,
      })
    }
    const project = projectMap.get(key)!
    const year = row.year as number | null
    if (year) {
      if (!project.first_year || year < (project.first_year as number)) project.first_year = year
      if (!project.last_year || year > (project.last_year as number)) project.last_year = year
    }
    if (row._type === 'xmt') project.xmt_count = ((project.xmt_count as number) || 0) + ((row.xmt_count as number) || 0)
    if (row._type === 'surf') project.surf_km = ((project.surf_km as number) || 0) + (((row as any).km_surf_lines as number) || 0)
    if (row._type === 'subsea') project.subsea_unit_count = ((project.subsea_unit_count as number) || 0) + (((row as any).unit_count as number) || 0)
  }

  const projects = Array.from(projectMap.values())
  if (projects.length > 0) {
    await upsertChunked('projects', projects, 'development_project,asset,country')
    console.log(`  Projects: ${projects.length} upserted`)
  }

  // Contracts from awards
  const contractRows = allAwards
    .map(row => ({
      date: `${row.year}-01-01`,
      supplier: (row.surf_contractor as string) || 'TBD',
      operator: (row.operator as string) || 'Unknown',
      project_name: (row.development_project as string) || 'Unknown',
      description: `${row.xmts_awarded || 0} XMTs awarded - ${row.facility_category || 'N/A'}`,
      contract_type: 'Subsea',
      region: row.country as string,
      country: row.country as string,
      source: 'rystad_forecast',
      pipeline_phase: 'feed',
      external_id: `rystad-award-${row.year}-${row.development_project}-${row.asset}`,
    }))
    .filter(r => r.project_name !== 'Unknown')

  if (contractRows.length > 0) {
    await upsertChunked('contracts', contractRows, 'external_id')
    console.log(`  Contracts: ${contractRows.length} upserted`)
  }

  await supabase.from('import_batches').update({
    status: 'completed',
    records_total: totalRows,
    records_imported: totalImported,
    records_skipped: totalSkipped,
    completed_at: new Date().toISOString(),
  }).eq('id', batchId)

  console.log(`  ✅ Total: ${totalImported}/${totalRows} imported`)
}

// --- PDF Processing ---
function hashStr(s: string): string {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

function mapSegment(segment: string): string {
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

function normalizeMetricKey(metric: string): string {
  return metric.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function normalizeForecastMetric(metric: string): string {
  const normalized = normalizeMetricKey(metric)
  if (!normalized) return normalized
  if (normalized.includes('subsea') && (normalized.includes('spend') || normalized.includes('capex')) && (normalized.includes('usd') || normalized.includes('bn'))) return 'subsea_spend_usd_bn'
  if (normalized.includes('xmt') && (normalized.includes('install') || normalized.includes('unit') || normalized.includes('count') || normalized.includes('tree'))) return 'xmt_installations'
  if (normalized.includes('surf') && (normalized.includes('km') || normalized.includes('install'))) return 'surf_km'
  if ((normalized.includes('growth') || normalized.includes('yoy')) && normalized.includes('subsea')) return 'subsea_capex_growth_yoy_pct'
  if (normalized.includes('brent')) return 'brent_avg_usd_per_bbl'
  if (normalized.includes('pipeline') && normalized.includes('km')) return 'pipeline_km'
  return normalized
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
  const n = toNumber(value)
  if (n === null) return null
  const year = Math.round(n)
  return year >= 1900 && year <= 2200 ? year : null
}

function extractFirstJsonObject(content: string): string | null {
  const start = content.indexOf('{')
  if (start < 0) return null
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < content.length; i++) {
    const c = content[i]
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
    if (c === '"') { inStr = true; continue }
    if (c === '{') depth++
    if (c === '}') { depth--; if (depth === 0) return content.slice(start, i + 1) }
  }
  return null
}

function parseJsonObj(content: string): Record<string, unknown> {
  const stripped = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
  const candidate = stripped.startsWith('{') ? stripped : extractFirstJsonObject(stripped)
  if (!candidate) return {}
  try { const p = JSON.parse(candidate); return typeof p === 'object' && p ? p as Record<string, unknown> : {} } catch { return {} }
}

async function processPdfContracts(fileName: string, buffer: Buffer) {
  console.log(`\n📄 Processing contracts: ${fileName}`)
  
  const { data: batch } = await supabase.from('import_batches').insert({
    file_name: fileName, file_type: 'pdf_contract_awards', status: 'processing',
  }).select('id').single()

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const base64 = buffer.toString('base64')

  const response = await openai.chat.completions.create({
    model: 'gpt-5.2',
    messages: [{
      role: 'user',
      content: [
        { type: 'file', file: { file_data: `data:application/pdf;base64,${base64}`, filename: fileName } } as any,
        { type: 'text', text: `Extract ALL contract rows from this PDF table. Return a JSON array with: supplier, operator, value, scope, region, segment, duration. Extract EVERY row from ALL pages. Return ONLY the JSON array.` },
      ],
    }],
    temperature: 0,
    max_completion_tokens: 16000,
  })

  const content = response.choices[0]?.message?.content || '[]'
  const jsonMatch = content.match(/\[[\s\S]*\]/)
  const rows: any[] = jsonMatch ? JSON.parse(jsonMatch[0]) : []

  const contractRows = rows.map(row => ({
    date: new Date().toISOString().split('T')[0],
    supplier: row.supplier || 'Unknown',
    operator: row.operator || 'Unknown',
    project_name: row.region || 'Unknown',
    description: [row.scope, row.duration ? `Varighet: ${row.duration}` : ''].filter(Boolean).join(' | ') || '',
    contract_type: mapSegment(row.segment),
    region: row.region,
    source: 'rystad_awards',
    pipeline_phase: 'awarded',
    external_id: `rystad-pdf-${hashStr(row.supplier + row.operator + (row.scope || '').substring(0, 100))}`,
    estimated_value_usd: parseValue(row.value),
  }))

  if (contractRows.length > 0) {
    const r = await upsertChunked('contracts', contractRows, 'external_id')
    console.log(`  ✅ ${r.imported} contracts imported`)
  }

  await supabase.from('import_batches').update({
    status: 'completed', records_total: rows.length, records_imported: contractRows.length, completed_at: new Date().toISOString(),
  }).eq('id', batch!.id)
}

async function processMarketReport(fileName: string, buffer: Buffer) {
  console.log(`\n📄 Processing market report: ${fileName}`)
  
  const { data: batch } = await supabase.from('import_batches').insert({
    file_name: fileName, file_type: 'pdf_market_report', status: 'processing',
  }).select('id').single()

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const base64 = buffer.toString('base64')

  const response = await openai.chat.completions.create({
    model: 'gpt-5.2',
    messages: [{
      role: 'user',
      content: [
        { type: 'file', file: { file_data: `data:application/pdf;base64,${base64}`, filename: fileName } } as any,
        { type: 'text', text: `Analyze this Subsea Market Report and return ONE valid JSON object with: report_period, report_title, summary, highlights (array), key_figures (object), forecasts (array of {year, metric, value, unit}). Extract as many yearly forecast datapoints as possible. No markdown outside JSON.` },
      ],
    }],
    temperature: 0,
    max_completion_tokens: 16000,
  })

  const content = response.choices[0]?.message?.content || '{}'
  const parsed = parseJsonObj(content)

  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : 'No summary'
  const reportPeriod = typeof parsed.report_period === 'string' ? parsed.report_period.trim() : null
  const reportTitle = typeof parsed.report_title === 'string' ? parsed.report_title.trim() : null
  const highlights = Array.isArray(parsed.highlights) ? parsed.highlights.filter((h: any) => typeof h === 'string' && h.length > 10).slice(0, 6) : []
  const keyFigures = parsed.key_figures && typeof parsed.key_figures === 'object' ? parsed.key_figures as Record<string, unknown> : {}

  const heading = reportPeriod || reportTitle || fileName
  const sections = [
    `## ${heading}`,
    reportTitle && reportTitle !== heading ? `### Report\n${reportTitle}` : '',
    highlights.length > 0 ? `### Highlights\n${highlights.map((h: string) => `- ${h}`).join('\n')}` : '',
    summary ? `### Executive Summary\n${summary}` : '',
    `### Key Figures\n\`\`\`json\n${JSON.stringify(keyFigures, null, 2)}\n\`\`\``,
  ]
  const aiSummary = sections.filter(Boolean).join('\n\n')

  // Get system user
  const { data: users } = await supabase.from('users').select('id').order('created_at').limit(1)
  let userId = users?.[0]?.id
  if (!userId) {
    const { data: authUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 })
    userId = authUsers?.users?.[0]?.id
    if (userId) {
      await supabase.from('users').upsert({ id: userId, email: 'system@csub.com', role: 'admin' }, { onConflict: 'id' })
    }
  }

  // Upload to storage
  const storagePath = `reports/${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  await supabase.storage.from('imports').upload(storagePath, buffer, { upsert: true, contentType: 'application/pdf' })

  // Upsert document
  const existing = await supabase.from('documents').select('id').eq('file_name', fileName).limit(1)
  if (existing.data && existing.data.length > 0) {
    await supabase.from('documents').update({ ai_summary: aiSummary, file_path: `imports/${storagePath}`, file_size_bytes: buffer.length }).eq('id', existing.data[0].id)
  } else if (userId) {
    await supabase.from('documents').insert({ uploaded_by: userId, file_name: fileName, file_path: `imports/${storagePath}`, file_type: 'application/pdf', file_size_bytes: buffer.length, ai_summary: aiSummary })
  }

  // Process forecasts
  const rawForecasts = Array.isArray(parsed.forecasts) ? parsed.forecasts : []
  const forecasts = rawForecasts
    .map((e: any) => {
      const year = toYear(e?.year)
      const value = toNumber(e?.value)
      const metric = typeof e?.metric === 'string' ? normalizeForecastMetric(e.metric) : ''
      if (!year || value === null || !metric) return null
      return { year, metric, value, unit: typeof e?.unit === 'string' ? e.unit : '', source: 'rystad_report' }
    })
    .filter(Boolean) as any[]

  // Dedup forecasts
  const fMap = new Map<string, any>()
  for (const f of forecasts) fMap.set(`${f.year}:${f.metric}`, f)
  const dedupedForecasts = Array.from(fMap.values())

  let fImported = 0
  for (const f of dedupedForecasts) {
    const { error } = await supabase.from('forecasts').upsert(f, { onConflict: 'year,metric', ignoreDuplicates: false })
    if (!error) fImported++
  }

  await supabase.from('import_batches').update({
    status: 'completed', records_total: dedupedForecasts.length + 1, records_imported: fImported + 1, completed_at: new Date().toISOString(),
  }).eq('id', batch!.id)

  console.log(`  ✅ Document saved, ${fImported} forecasts imported`)
}

async function main() {
  console.log('🚀 CSUB Dashboard - Full Import\n================================\n')

  // Excel files
  console.log('📊 EXCEL FILES\n' + '─'.repeat(40))
  for (const file of EXCEL_FILES) {
    try {
      await processExcel(file)
    } catch (err) {
      console.error(`❌ Failed: ${file}`, err)
    }
  }

  // PDF files
  console.log('\n\n📄 PDF FILES\n' + '─'.repeat(40))
  for (const file of PDF_FILES) {
    try {
      const filePath = path.join(DOWNLOADS, file)
      if (!fs.existsSync(filePath)) { console.log(`⚠️  ${file} not found`); continue }
      const buffer = fs.readFileSync(filePath)
      
      const name = file.toLowerCase()
      const isMarketReport = name.includes('market report') || name.includes('subsea market') || (name.includes('report') && /[1-4]q|q[1-4]/i.test(name))
      
      if (isMarketReport) {
        await processMarketReport(file, buffer)
      } else {
        await processPdfContracts(file, buffer)
      }
    } catch (err) {
      console.error(`❌ Failed: ${file}`, err)
    }
  }

  // Verify
  console.log('\n\n📈 VERIFICATION\n' + '─'.repeat(40))
  for (const table of ['xmt_data', 'surf_data', 'subsea_unit_data', 'upcoming_awards', 'projects', 'contracts', 'documents', 'forecasts']) {
    const { count } = await supabase.from(table).select('*', { count: 'exact', head: true })
    console.log(`  ${table}: ${count} rows`)
  }

  console.log('\n✅ Import complete!')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
