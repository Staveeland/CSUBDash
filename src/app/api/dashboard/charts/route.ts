import { NextResponse } from 'next/server'
import { requireAllowedApiUser } from '@/lib/auth/require-user'
import { fetchAll } from '@/lib/supabase/fetch-all'

export async function GET() {
  try {
    const auth = await requireAllowedApiUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const [projectsRes, contractsRes, awardsRes, xmtRes] = await Promise.all([
      fetchAll(supabase, 'projects', 'country, continent, water_depth_category, first_year, last_year, xmt_count, surf_km, facility_category, development_project'),
      fetchAll(supabase, 'contracts', 'region, country, contract_type, award_date'),
      fetchAll(supabase, 'upcoming_awards', 'development_project, xmts_awarded, year'),
      fetchAll(supabase, 'xmt_data', 'development_project, contract_award_year, xmt_count, state'),
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

    // Pipeline flow (FEED → Tender → Award → Execution → Closed)
    const awards = awardsRes.data || []
    const xmts = xmtRes.data || []
    const currentYear = new Date().getFullYear()

    // Also fetch contracts for awarded count
    const contractsCount = contracts.length

    // FEED = all projects (everything starts in FEED/study phase)
    const feedCount = projects.length

    // Tender = upcoming awards (projects in tender/pre-award phase)
    const tenderProjects = new Set(awards.map(a => a.development_project).filter(Boolean))
    const tenderCount = tenderProjects.size

    // Award = contracts awarded (from contracts table) + upcoming awards with XMTs
    const awardedFromAwards = new Set(
      awards.filter(a => (a.xmts_awarded || 0) > 0).map(a => a.development_project).filter(Boolean)
    )
    const awardCount = contractsCount > 0 ? contractsCount : awardedFromAwards.size

    // Execution = XMT data where contract is awarded and year >= current (active installation)
    const execProjects = new Set(
      xmts.filter(x => x.contract_award_year && x.contract_award_year <= currentYear)
        .map(x => x.development_project).filter(Boolean)
    )
    const executionCount = execProjects.size

    // Closed = projects where last year < current year (completed)
    const closedProjects = new Set(
      projects.filter(p => p.last_year && p.last_year < currentYear)
        .map(p => (p as Record<string, unknown>).development_project as string).filter(Boolean)
    )
    const closedCount = closedProjects.size

    const pipelineFlow = [
      { label: 'FEED', value: feedCount },
      { label: 'Tender', value: tenderCount },
      { label: 'Award', value: awardCount },
      { label: 'Execution', value: executionCount },
      { label: 'Closed', value: closedCount },
    ]

    return NextResponse.json({ byCountry, byPhase, byDepth, byYear, pipelineFlow })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
