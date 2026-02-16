/**
 * Import awards (with fixed schema) + all PDFs
 */
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const DOWNLOADS = path.join(process.env.HOME!, 'Downloads')
const CHUNK_SIZE = 500

function str(v: unknown): string | null { if (v === null || v === undefined || v === '') return null; return String(v).trim() }
function int(v: unknown): number | null { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isNaN(n) ? null : Math.round(n) }

function fuzzyCol(columns: string[], ...patterns: string[]): string | undefined {
  for (const p of patterns) { const l = p.toLowerCase(); const f = columns.find(c => c.toLowerCase().includes(l)); if (f) return f }
  return undefined
}
function getCol(row: Record<string, unknown>, columns: string[], ...patterns: string[]): unknown {
  const col = fuzzyCol(columns, ...patterns); return col ? row[col] : undefined
}

function dedup(rows: Record<string, unknown>[], conflictColumns: string[]): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>()
  for (const row of rows) {
    const key = conflictColumns.map(col => String(row[col] ?? '')).join('|:|')
    if (!map.has(key)) map.set(key, { ...row })
    else {
      const existing = map.get(key)!
      for (const [k, v] of Object.entries(row)) {
        if (conflictColumns.includes(k)) continue
        if (typeof v === 'number' && typeof existing[k] === 'number') (existing[k] as number) += v
        else if (v !== null && v !== undefined) existing[k] = v
      }
    }
  }
  return Array.from(map.values())
}

async function upsertChunked(table: string, rows: Record<string, unknown>[], onConflict: string) {
  let imported = 0, skipped = 0
  const cc = onConflict.split(',').map(c => c.trim())
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = dedup(rows.slice(i, i + CHUNK_SIZE), cc)
    const { data, error } = await supabase.from(table).upsert(chunk, { onConflict, ignoreDuplicates: false }).select('id')
    if (error) { console.error(`  ⚠️  ${table}: ${error.message}`); skipped += chunk.length } else imported += data?.length ?? chunk.length
  }
  return { imported, skipped }
}

// ====== AWARDS (fixed schema - no continent/distance_group) ======
async function importAwards() {
  console.log('\n📊 Re-importing awards from old Excel...')
  const filePath = path.join(DOWNLOADS, 'XMTs Surf lines, Subsea Units and Upcomming awards 04.04.25.xlsx')
  const buffer = fs.readFileSync(filePath)
  const wb = XLSX.read(buffer, { type: 'buffer' })

  // Find awards sheet
  const sheetName = wb.SheetNames.find(n => /awards?/i.test(n))
  if (!sheetName) { console.log('No awards sheet found'); return }

  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]) as Record<string, unknown>[]
  const columns = Object.keys(rows[0])
  console.log(`  Sheet "${sheetName}" — ${rows.length} rows, columns: ${columns.join(', ')}`)

  // Map awards with ONLY columns that exist in the table
  const mapped = rows.map(r => ({
    year: int(getCol(r, columns, 'Year')),
    country: str(getCol(r, columns, 'Country')),
    development_project: str(getCol(r, columns, 'Development Project')),
    asset: str(getCol(r, columns, 'Asset')),
    operator: str(getCol(r, columns, 'Operator')),
    surf_contractor: str(getCol(r, columns, 'SURF Installation Contractor')),
    facility_category: str(getCol(r, columns, 'Facility Category')),
    field_size_category: str(getCol(r, columns, 'Field Size Category')),
    field_type: str(getCol(r, columns, 'Field Type Category')),
    water_depth_category: str(getCol(r, columns, 'Water Depth Category')),
    xmts_awarded: int(getCol(r, columns, 'XMTs Awarded')),
  })).filter(r => r.development_project)

  const r = await upsertChunked('upcoming_awards', mapped, 'year,development_project,asset')
  console.log(`  ✅ Awards: ${r.imported} imported, ${r.skipped} skipped`)
}

// ====== PDF Processing ======
function hashStr(s: string): string { let h = 0; for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0 }; return Math.abs(h).toString(36) }
function mapSegment(seg: string): string { if (!seg) return 'Other'; const s = seg.toLowerCase(); if (s.includes('epci')) return 'EPCI'; if (s.includes('subsea') || s.includes('sps')) return 'SPS'; if (s.includes('surf')) return 'SURF'; return 'Other' }
function parseValue(v: string): number | null { if (!v) return null; const c = v.replace(/[^0-9.]/g, ''); const n = parseFloat(c); if (Number.isNaN(n)) return null; const l = v.toLowerCase(); if (l.includes('b')) return Math.round(n * 1e9); if (l.includes('m')) return Math.round(n * 1e6); if (l.includes('k')) return Math.round(n * 1e3); return Math.round(n) }
function normalizeMetricKey(m: string): string { return m.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') }
function normalizeForecastMetric(m: string): string {
  const n = normalizeMetricKey(m); if (!n) return n
  if (n.includes('subsea') && (n.includes('spend') || n.includes('capex')) && (n.includes('usd') || n.includes('bn'))) return 'subsea_spend_usd_bn'
  if (n.includes('xmt') && (n.includes('install') || n.includes('unit') || n.includes('count') || n.includes('tree'))) return 'xmt_installations'
  if (n.includes('surf') && (n.includes('km') || n.includes('install'))) return 'surf_km'
  if ((n.includes('growth') || n.includes('yoy')) && n.includes('subsea')) return 'subsea_capex_growth_yoy_pct'
  if (n.includes('brent')) return 'brent_avg_usd_per_bbl'
  return n
}
function toNumber(v: unknown): number | null { if (typeof v === 'number' && Number.isFinite(v)) return v; if (typeof v === 'string') { const c = v.replace(/,/g, '').trim(); return c ? (Number.isFinite(Number(c)) ? Number(c) : null) : null }; return null }
function toYear(v: unknown): number | null { const n = toNumber(v); if (n === null) return null; const y = Math.round(n); return y >= 1900 && y <= 2200 ? y : null }
function extractFirstJson(c: string): string | null { const s = c.indexOf('{'); if (s < 0) return null; let d = 0, ins = false, esc = false; for (let i = s; i < c.length; i++) { const ch = c[i]; if (ins) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') ins = false; continue }; if (ch === '"') { ins = true; continue }; if (ch === '{') d++; if (ch === '}') { d--; if (d === 0) return c.slice(s, i + 1) } }; return null }
function parseJsonObj(c: string): Record<string, unknown> { const s = c.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim(); const cand = s.startsWith('{') ? s : extractFirstJson(s); if (!cand) return {}; try { const p = JSON.parse(cand); return typeof p === 'object' && p ? p as Record<string, unknown> : {} } catch { return {} } }

async function processPdfContracts(fileName: string) {
  console.log(`\n📄 Contracts: ${fileName}`)
  const buffer = fs.readFileSync(path.join(DOWNLOADS, fileName))
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const resp = await openai.chat.completions.create({
    model: 'gpt-5.2',
    messages: [{ role: 'user', content: [
      { type: 'file', file: { file_data: `data:application/pdf;base64,${buffer.toString('base64')}`, filename: fileName } } as any,
      { type: 'text', text: 'Extract ALL contract rows from this PDF. Return JSON array with: supplier, operator, value, scope, region, segment, duration. ONLY the JSON array.' },
    ]}],
    temperature: 0, max_completion_tokens: 16000,
  })

  const content = resp.choices[0]?.message?.content || '[]'
  const match = content.match(/\[[\s\S]*\]/)
  const rows: any[] = match ? JSON.parse(match[0]) : []

  const contracts = rows.map(r => ({
    date: new Date().toISOString().split('T')[0],
    supplier: r.supplier || 'Unknown', operator: r.operator || 'Unknown',
    project_name: r.region || 'Unknown',
    description: [r.scope, r.duration ? `Varighet: ${r.duration}` : ''].filter(Boolean).join(' | '),
    contract_type: mapSegment(r.segment), region: r.region,
    source: 'rystad_awards', pipeline_phase: 'awarded',
    external_id: `rystad-pdf-${hashStr(r.supplier + r.operator + (r.scope || '').substring(0, 100))}`,
    estimated_value_usd: parseValue(r.value),
  }))

  if (contracts.length > 0) {
    const r = await upsertChunked('contracts', contracts, 'external_id')
    console.log(`  ✅ ${r.imported} contracts imported`)
  } else console.log('  ⚠️  No contracts extracted')
}

async function processMarketReport(fileName: string) {
  console.log(`\n📄 Report: ${fileName}`)
  const buffer = fs.readFileSync(path.join(DOWNLOADS, fileName))
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const resp = await openai.chat.completions.create({
    model: 'gpt-5.2',
    messages: [{ role: 'user', content: [
      { type: 'file', file: { file_data: `data:application/pdf;base64,${buffer.toString('base64')}`, filename: fileName } } as any,
      { type: 'text', text: 'Analyze this Subsea Market Report. Return ONE JSON object: {report_period, report_title, summary, highlights:[], key_figures:{}, forecasts:[{year,metric,value,unit}]}. Extract all yearly forecasts. No markdown.' },
    ]}],
    temperature: 0, max_completion_tokens: 16000,
  })

  const content = resp.choices[0]?.message?.content || '{}'
  const parsed = parseJsonObj(content)
  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : 'No summary'
  const period = typeof parsed.report_period === 'string' ? parsed.report_period.trim() : null
  const title = typeof parsed.report_title === 'string' ? parsed.report_title.trim() : null
  const highlights = Array.isArray(parsed.highlights) ? parsed.highlights.filter((h: any) => typeof h === 'string' && h.length > 10).slice(0, 6) as string[] : []
  const keyFigures = parsed.key_figures && typeof parsed.key_figures === 'object' ? parsed.key_figures as Record<string, unknown> : {}

  const heading = period || title || fileName
  const aiSummary = [
    `## ${heading}`,
    title && title !== heading ? `### Report\n${title}` : '',
    highlights.length > 0 ? `### Highlights\n${highlights.map(h => `- ${h}`).join('\n')}` : '',
    summary ? `### Executive Summary\n${summary}` : '',
    `### Key Figures\n\`\`\`json\n${JSON.stringify(keyFigures, null, 2)}\n\`\`\``,
  ].filter(Boolean).join('\n\n')

  // Get/create system user
  const { data: users } = await supabase.from('users').select('id').order('created_at').limit(1)
  let userId = users?.[0]?.id
  if (!userId) {
    const { data: authUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 })
    userId = authUsers?.users?.[0]?.id
    if (userId) await supabase.from('users').upsert({ id: userId, email: 'system@csub.com', role: 'admin' }, { onConflict: 'id' })
  }

  // Upload to storage
  const storagePath = `reports/${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  await supabase.storage.from('imports').upload(storagePath, buffer, { upsert: true, contentType: 'application/pdf' })

  // Upsert document
  const existing = await supabase.from('documents').select('id').eq('file_name', fileName).limit(1)
  if (existing.data?.length) {
    await supabase.from('documents').update({ ai_summary: aiSummary, file_path: `imports/${storagePath}`, file_size_bytes: buffer.length }).eq('id', existing.data[0].id)
  } else if (userId) {
    await supabase.from('documents').insert({ uploaded_by: userId, file_name: fileName, file_path: `imports/${storagePath}`, file_type: 'application/pdf', file_size_bytes: buffer.length, ai_summary: aiSummary })
  }

  // Forecasts
  const rawForecasts = Array.isArray(parsed.forecasts) ? parsed.forecasts : []
  const forecasts = rawForecasts
    .map((e: any) => { const y = toYear(e?.year), v = toNumber(e?.value), m = typeof e?.metric === 'string' ? normalizeForecastMetric(e.metric) : ''; if (!y || v === null || !m) return null; return { year: y, metric: m, value: v, unit: typeof e?.unit === 'string' ? e.unit : '', source: 'rystad_report' } })
    .filter(Boolean) as any[]
  
  const fMap = new Map<string, any>()
  for (const f of forecasts) fMap.set(`${f.year}:${f.metric}`, f)
  const deduped = Array.from(fMap.values())

  let fImported = 0
  for (const f of deduped) { const { error } = await supabase.from('forecasts').upsert(f, { onConflict: 'year,metric', ignoreDuplicates: false }); if (!error) fImported++ }

  console.log(`  ✅ Document saved, ${fImported}/${deduped.length} forecasts imported`)
}

const PDF_FILES = [
  'OFS Contract Updates 2025-2026.pdf',
  'Subsea Market Report 1Q 2024.pdf',
  'Subsea Market Report _ 2Q 2024.pdf',
  'Subsea Market Report 3Q 2024.pdf',
  'Subsea Market Report 4Q 2024.pdf',
  'Subsea Market Report 1Q 2025.pdf',
  'Subsea Market Report _ 2Q 2025.pdf',
]

async function main() {
  // Fix awards
  await importAwards()

  // PDFs
  console.log('\n📄 PDF FILES\n' + '─'.repeat(40))
  for (const file of PDF_FILES) {
    try {
      if (!fs.existsSync(path.join(DOWNLOADS, file))) { console.log(`⚠️ ${file} not found`); continue }
      const name = file.toLowerCase()
      const isReport = name.includes('market report') || (name.includes('report') && /[1-4]q|q[1-4]/i.test(name))
      if (isReport) await processMarketReport(file)
      else await processPdfContracts(file)
    } catch (err) { console.error(`❌ ${file}:`, err) }
  }

  // Verify
  console.log('\n\n📈 VERIFICATION\n' + '─'.repeat(40))
  for (const t of ['xmt_data', 'surf_data', 'subsea_unit_data', 'upcoming_awards', 'projects', 'contracts', 'documents', 'forecasts']) {
    const { count } = await supabase.from(t).select('*', { count: 'exact', head: true })
    console.log(`  ${t}: ${count} rows`)
  }
  console.log('\n✅ Done!')
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
