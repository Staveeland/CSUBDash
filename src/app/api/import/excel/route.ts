import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createAdminClient } from '@/lib/supabase/admin'

const CHUNK_SIZE = 500

async function upsertChunked(supabase: ReturnType<typeof createAdminClient>, table: string, rows: Record<string, unknown>[], onConflict: string) {
  let imported = 0, updated = 0, skipped = 0
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE)
    const { data, error } = await supabase.from(table).upsert(chunk, { onConflict, ignoreDuplicates: false }).select('id')
    if (error) {
      console.error(`Error upserting to ${table}:`, error.message)
      skipped += chunk.length
    } else {
      imported += data?.length ?? chunk.length
    }
  }
  return { imported, updated, skipped }
}

function findSheet(workbook: XLSX.WorkBook, ...prefixes: string[]): string | undefined {
  return workbook.SheetNames.find(name =>
    prefixes.some(p => name.toLowerCase().startsWith(p.toLowerCase()))
  )
}

function parseSheet(workbook: XLSX.WorkBook, sheetName: string): Record<string, unknown>[] {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return []
  return XLSX.utils.sheet_to_json(sheet, { defval: null })
}

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  return String(v).trim()
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function int(v: unknown): number | null {
  const n = num(v)
  return n !== null ? Math.round(n) : null
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer, { type: 'buffer' })

    const supabase = createAdminClient()

    // Create import batch
    const { data: batch } = await supabase.from('import_batches').insert({
      file_name: file.name,
      file_type: 'excel_rystad',
      status: 'processing',
    }).select().single()

    const batchId = batch!.id
    const stats = { total: 0, imported: 0, updated: 0, skipped: 0 }

    // 1. XMTs sheet
    const xmtRows = parseSheet(workbook, 'XMTs').map(r => ({
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
    })).filter(r => r.development_project)

    stats.total += xmtRows.length
    const xmtResult = await upsertChunked(supabase, 'xmt_data', xmtRows, 'year,development_project,asset,purpose,state')
    stats.imported += xmtResult.imported
    stats.skipped += xmtResult.skipped

    // 2. Surf lines sheet
    const surfRows = parseSheet(workbook, 'Surf lines').map(r => ({
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
    })).filter(r => r.development_project)

    stats.total += surfRows.length
    const surfResult = await upsertChunked(supabase, 'surf_data', surfRows, 'year,development_project,asset,design_category,line_group')
    stats.imported += surfResult.imported
    stats.skipped += surfResult.skipped

    // 3. Subsea units sheet
    const subseaRows = parseSheet(workbook, 'Subsea units').map(r => ({
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
    })).filter(r => r.development_project)

    stats.total += subseaRows.length
    const subseaResult = await upsertChunked(supabase, 'subsea_unit_data', subseaRows, 'year,development_project,asset,unit_category')
    stats.imported += subseaResult.imported
    stats.skipped += subseaResult.skipped

    // 4. Upcoming awards sheet (fuzzy match — sheet name includes date suffix)
    const awardsSheetName = findSheet(workbook, 'Upcomming awards', 'Upcoming awards') || 'Upcomming awards'
    const awardRows = parseSheet(workbook, awardsSheetName).map(r => ({
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
    })).filter(r => r.development_project)

    stats.total += awardRows.length
    const awardResult = await upsertChunked(supabase, 'upcoming_awards', awardRows, 'year,development_project,asset')
    stats.imported += awardResult.imported
    stats.skipped += awardResult.skipped

    // 5. Aggregate into projects table
    const projectMap = new Map<string, Record<string, unknown>>()
    const allRows = [
      ...xmtRows.map(r => ({ ...r, _type: 'xmt' })),
      ...surfRows.map(r => ({ ...r, _type: 'surf' })),
      ...subseaRows.map(r => ({ ...r, _type: 'subsea' })),
      ...awardRows.map(r => ({ ...r, _type: 'award' })),
    ]

    for (const r of allRows) {
      const key = `${r.development_project}|${r.asset}|${r.country}`
      if (!projectMap.has(key)) {
        projectMap.set(key, {
          development_project: r.development_project,
          asset: r.asset,
          country: r.country,
          continent: (r as Record<string, unknown>).continent ?? null,
          operator: r.operator,
          surf_contractor: r.surf_contractor,
          facility_category: r.facility_category,
          field_type: r.field_type,
          water_depth_category: r.water_depth_category,
          field_size_category: (r as Record<string, unknown>).field_size_category ?? null,
          xmt_count: 0,
          surf_km: 0,
          subsea_unit_count: 0,
          first_year: r.year,
          last_year: r.year,
        })
      }
      const p = projectMap.get(key)!
      if (r.year) {
        if (!p.first_year || r.year < (p.first_year as number)) p.first_year = r.year
        if (!p.last_year || r.year > (p.last_year as number)) p.last_year = r.year
      }
      if (r._type === 'xmt') p.xmt_count = ((p.xmt_count as number) || 0) + ((r as Record<string, unknown>).xmt_count as number || 0)
      if (r._type === 'surf') p.surf_km = ((p.surf_km as number) || 0) + ((r as Record<string, unknown>).km_surf_lines as number || 0)
      if (r._type === 'subsea') p.subsea_unit_count = ((p.subsea_unit_count as number) || 0) + ((r as Record<string, unknown>).unit_count as number || 0)
    }

    const projects = Array.from(projectMap.values())
    if (projects.length > 0) {
      await upsertChunked(supabase, 'projects', projects, 'development_project,asset,country')
    }

    // 6. Create contracts from upcoming awards
    const contractRows = awardRows.map(r => ({
      date: `${r.year}-01-01`,
      supplier: r.surf_contractor || 'TBD',
      operator: r.operator || 'Unknown',
      project_name: r.development_project || 'Unknown',
      description: `${r.xmts_awarded || 0} XMTs awarded - ${r.facility_category || 'N/A'}`,
      contract_type: 'Subsea' as const,
      region: r.country,
      country: r.country,
      source: 'rystad_forecast' as const,
      pipeline_phase: 'feed' as const,
      external_id: `rystad-award-${r.year}-${r.development_project}-${r.asset}`,
    })).filter(r => r.project_name !== 'Unknown')

    if (contractRows.length > 0) {
      await upsertChunked(supabase, 'contracts', contractRows, 'external_id')
    }

    // Update batch
    await supabase.from('import_batches').update({
      status: 'completed',
      records_total: stats.total,
      records_imported: stats.imported,
      records_skipped: stats.skipped,
      completed_at: new Date().toISOString(),
    }).eq('id', batchId)

    return NextResponse.json({
      success: true,
      batch_id: batchId,
      sheets_found: workbook.SheetNames,
      stats,
      projects_created: projects.length,
    })
  } catch (error) {
    console.error('Excel import error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
