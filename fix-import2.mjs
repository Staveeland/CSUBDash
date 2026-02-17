import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'
import { readFileSync } from 'fs'

const supabase = createClient(
  'https://hkthubrjspnwuafzjuyb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrdGh1YnJqc3Bud3VhZnpqdXliIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDg4NzA5NiwiZXhwIjoyMDg2NDYzMDk2fQ.vW2LnzMKOcIfcbfvs9ipmxee4rZhNPacnev9UKTvKDg'
)

const SURF_BATCH = readFileSync('/tmp/surf_batch_id', 'utf8').trim()
const AWARD_BATCH = readFileSync('/tmp/award_batch_id', 'utf8').trim()
const wb = XLSX.readFile('/Users/petterstaveland/Downloads/XMTs Surf lines, Subsea Units and Upcomming awards 04.04.25.xlsx')
const str = v => v != null ? String(v).trim() : ''
const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n }
const int = v => { const n = parseInt(v); return isNaN(n) ? null : n }

// SURF
const surfRows = XLSX.utils.sheet_to_json(wb.Sheets['Surf lines'])
console.log(`Importing ${surfRows.length} SURF rows (batch ${SURF_BATCH})...`)
const surfMapped = surfRows.map(r => ({
  import_batch_id: SURF_BATCH, year: int(r['Year']), continent: str(r['Continent']),
  country: str(r['Country']), development_project: str(r['Development Project']),
  asset: str(r['Asset']), operator: str(r['Operator']),
  surf_contractor: str(r['SURF Installation Contractor']),
  facility_category: str(r['Facility Category']), field_type: str(r['Field Type Category']),
  water_depth_category: str(r['Water Depth Category']),
  distance_group: str(r['Distance To Tie In Group']),
  design_category: str(r['SURF Line Design Category']),
  line_group: str(r['SURF Line Group']), km_surf_lines: num(r['KM Surf Lines']),
}))
for (let i = 0; i < surfMapped.length; i += 500) {
  const { error } = await supabase.from('surf_data').insert(surfMapped.slice(i, i + 500))
  if (error) { console.error('SURF error at', i, error.message); break }
  console.log(`  SURF: ${Math.min(i + 500, surfMapped.length)} / ${surfMapped.length}`)
}

// AWARDS  
const awardRows = XLSX.utils.sheet_to_json(wb.Sheets['Upcomming awards 04.04.25'])
console.log(`\nImporting ${awardRows.length} awards (batch ${AWARD_BATCH})...`)
const awardMapped = awardRows.map(r => ({
  import_batch_id: AWARD_BATCH, year: int(r['Year']), country: str(r['Country']),
  development_project: str(r['Development Project']), asset: str(r['Asset']),
  operator: str(r['Operator']), surf_contractor: str(r['SURF Installation Contractor']),
  facility_category: str(r['Facility Category']),
  field_size_category: str(r['Field Size Category']),
  field_type: str(r['Field Type Category']),
  water_depth_category: str(r['Water Depth Category']),
  xmts_awarded: int(r['XMTs Awarded']) || 0,
}))
for (let i = 0; i < awardMapped.length; i += 500) {
  const { error } = await supabase.from('upcoming_awards').insert(awardMapped.slice(i, i + 500))
  if (error) { console.error('Awards error at', i, error.message); break }
  console.log(`  Awards: ${Math.min(i + 500, awardMapped.length)} / ${awardMapped.length}`)
}

console.log('\n🎉 DONE!')
