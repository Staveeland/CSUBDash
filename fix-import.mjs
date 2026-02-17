import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'

const supabase = createClient(
  'https://hkthubrjspnwuafzjuyb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrdGh1YnJqc3Bud3VhZnpqdXliIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDg4NzA5NiwiZXhwIjoyMDg2NDYzMDk2fQ.vW2LnzMKOcIfcbfvs9ipmxee4rZhNPacnev9UKTvKDg'
)

import { randomUUID } from 'crypto'
const BATCH_ID = randomUUID()
const FILE = '/Users/petterstaveland/Downloads/XMTs Surf lines, Subsea Units and Upcomming awards 04.04.25.xlsx'
const wb = XLSX.readFile(FILE)

const str = v => v != null ? String(v).trim() : ''
const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n }
const int = v => { const n = parseInt(v); return isNaN(n) ? null : n }

async function insertBatched(table, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    const { error } = await supabase.from(table).insert(batch)
    if (error) { console.error(`  ${table} batch ${i} error:`, error.message); return false }
    process.stdout.write(`  ${table}: ${i + batch.length} / ${rows.length}\r`)
  }
  console.log(`  ${table}: ${rows.length} / ${rows.length} ✅`)
  return true
}

// 1. SURF DATA
const surfRows = XLSX.utils.sheet_to_json(wb.Sheets['Surf lines'])
console.log(`\n1) Importing ${surfRows.length} SURF rows...`)
const surfMapped = surfRows.map(r => ({
  import_batch_id: BATCH_ID,
  year: int(r['Year']),
  continent: str(r['Continent']),
  country: str(r['Country']),
  development_project: str(r['Development Project']),
  asset: str(r['Asset']),
  operator: str(r['Operator']),
  surf_contractor: str(r['SURF Installation Contractor']),
  facility_category: str(r['Facility Category']),
  field_type: str(r['Field Type Category']),
  water_depth_category: str(r['Water Depth Category']),
  distance_group: str(r['Distance To Tie In Group']),
  design_category: str(r['SURF Line Design Category']),
  line_group: str(r['SURF Line Group']),
  km_surf_lines: num(r['KM Surf Lines']),
}))
await insertBatched('surf_data', surfMapped)

// 2. UPCOMING AWARDS
const awardRows = XLSX.utils.sheet_to_json(wb.Sheets['Upcomming awards 04.04.25'])
console.log(`\n2) Importing ${awardRows.length} upcoming awards...`)
const awardMapped = awardRows.map(r => ({
  import_batch_id: BATCH_ID,
  year: int(r['Year']),
  country: str(r['Country']),
  development_project: str(r['Development Project']),
  asset: str(r['Asset']),
  operator: str(r['Operator']),
  surf_contractor: str(r['SURF Installation Contractor']),
  facility_category: str(r['Facility Category']),
  field_size_category: str(r['Field Size Category']),
  field_type: str(r['Field Type Category']),
  water_depth_category: str(r['Water Depth Category']),
  xmts_awarded: int(r['XMTs Awarded']) || 0,
}))
await insertBatched('upcoming_awards', awardMapped)

// 3. UPDATE PROJECTS WITH SURF_KM
console.log('\n3) Updating projects surf_km...')
const surfAgg = new Map()
for (const r of surfMapped) {
  const key = r.development_project
  if (key) surfAgg.set(key, (surfAgg.get(key) || 0) + (r.km_surf_lines || 0))
}

let updated = 0
for (const [project, km] of surfAgg) {
  if (km <= 0) continue
  const { error } = await supabase.from('projects')
    .update({ surf_km: Math.round(km * 10) / 10 })
    .eq('development_project', project)
  if (!error) updated++
}
console.log(`  Updated surf_km for ${updated} projects ✅`)

console.log('\n🎉 ALL DONE!')
