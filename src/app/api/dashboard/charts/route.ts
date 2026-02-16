import { NextResponse } from 'next/server'
import { requireAllowedApiUser } from '@/lib/auth/require-user'

export async function GET() {
  try {
    const auth = await requireAllowedApiUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const [projectsRes, contractsRes] = await Promise.all([
      supabase.from('projects').select('country, continent, water_depth_category, first_year, last_year, xmt_count, surf_km, facility_category').limit(10000),
      supabase.from('contracts').select('region, country, contract_type, award_date').limit(10000),
    ])

    if (projectsRes.error) throw projectsRes.error
    if (contractsRes.error) throw contractsRes.error

    const projects = projectsRes.data || []
    const contracts = contractsRes.data || []

    // By country
    const countryMap = new Map<string, number>()
    projects.forEach(p => { if (p.country) countryMap.set(p.country, (countryMap.get(p.country) || 0) + 1) })
    contracts.forEach(c => { if (c.country) countryMap.set(c.country, (countryMap.get(c.country) || 0) + 1) })
    const byCountry = Array.from(countryMap.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)

    // By phase/facility_category
    const phaseMap = new Map<string, number>()
    projects.forEach(p => {
      const phase = p.facility_category || 'Unknown'
      phaseMap.set(phase, (phaseMap.get(phase) || 0) + 1)
    })
    const byPhase = Array.from(phaseMap.entries())
      .map(([phase, count]) => ({ phase, count }))
      .sort((a, b) => b.count - a.count)

    // By water depth
    const depthMap = new Map<string, number>()
    projects.forEach(p => {
      const d = p.water_depth_category || 'Unknown'
      depthMap.set(d, (depthMap.get(d) || 0) + 1)
    })
    const byDepth = Array.from(depthMap.entries())
      .map(([depth, count]) => ({ depth, count }))
      .sort((a, b) => b.count - a.count)

    // Trend by year
    const yearMap = new Map<number, number>()
    projects.forEach(p => {
      const y = p.first_year || p.last_year
      if (y) yearMap.set(y, (yearMap.get(y) || 0) + 1)
    })
    const byYear = Array.from(yearMap.entries())
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year - b.year)

    return NextResponse.json({ byCountry, byPhase, byDepth, byYear })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
