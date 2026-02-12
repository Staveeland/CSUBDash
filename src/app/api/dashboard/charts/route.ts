import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createAdminClient()

  // Use projects table (has data) for all chart aggregations
  const { data: projects } = await supabase.from('projects').select('facility_category, continent, first_year, xmt_count')

  const rows = projects ?? []

  // Facility category distribution
  const facilityMap: Record<string, number> = {}
  rows.forEach(r => {
    const k = r.facility_category || 'Ukjent'
    facilityMap[k] = (facilityMap[k] || 0) + 1
  })
  const facilityDistribution = Object.entries(facilityMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  // Yearly trend (XMTs per year)
  const yearMap: Record<number, number> = {}
  rows.forEach(r => {
    if (r.first_year) {
      yearMap[r.first_year] = (yearMap[r.first_year] || 0) + (r.xmt_count ?? 0)
    }
  })
  const yearlyTrend = Object.entries(yearMap)
    .map(([year, xmts]) => ({ year: Number(year), xmts }))
    .sort((a, b) => a.year - b.year)

  // Continental distribution
  const continentMap: Record<string, number> = {}
  rows.forEach(r => {
    const k = r.continent || 'Ukjent'
    continentMap[k] = (continentMap[k] || 0) + 1
  })
  const continentDistribution = Object.entries(continentMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  return NextResponse.json({ facilityDistribution, yearlyTrend, continentDistribution })
}
