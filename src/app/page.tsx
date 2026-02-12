import { createAdminClient } from '@/lib/supabase/admin'
import Dashboard from '@/components/Dashboard'

export const dynamic = 'force-dynamic'

async function fetchData() {
  const supabase = createAdminClient()

  const [projectsRes, surfRes, contractsRes, upcomingRes] = await Promise.all([
    supabase.from('projects').select('*'),
    supabase.from('surf_data').select('continent, country, development_project, surf_contractor, operator, facility_category, km_surf_lines, year').limit(5000),
    supabase.from('contracts').select('*', { count: 'exact', head: true }),
    supabase.from('upcoming_awards').select('*').limit(2000),
  ])

  const projects = projectsRes.data ?? []
  const surfData = surfRes.data ?? []
  const upcomingAwards = upcomingRes.data ?? []

  // KPIs
  const totalProjects = projects.length
  const upcomingCount = upcomingAwards.length
  const totalXmts = projects.reduce((s, r) => s + (r.xmt_count ?? 0), 0)
  const totalSurfKm = Math.round(projects.reduce((s, r) => s + (r.surf_km ?? 0), 0) * 10) / 10

  // Charts - facility category
  const facilityMap: Record<string, number> = {}
  projects.forEach(r => {
    const k = r.facility_category || 'Ukjent'
    facilityMap[k] = (facilityMap[k] || 0) + 1
  })
  const facilityDistribution = Object.entries(facilityMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  // Charts - yearly trend
  const yearMap: Record<number, number> = {}
  projects.forEach(r => {
    if (r.first_year) yearMap[r.first_year] = (yearMap[r.first_year] || 0) + (r.xmt_count ?? 0)
  })
  const yearlyTrend = Object.entries(yearMap)
    .map(([year, xmts]) => ({ year: Number(year), xmts }))
    .sort((a, b) => a.year - b.year)

  // Charts - continent
  const continentMap: Record<string, number> = {}
  projects.forEach(r => {
    const k = r.continent || 'Ukjent'
    continentMap[k] = (continentMap[k] || 0) + 1
  })
  const continentDistribution = Object.entries(continentMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  // Companies
  const contractorMap: Record<string, Set<string>> = {}
  const operatorMap: Record<string, Set<string>> = {}
  projects.forEach(r => {
    const c = r.surf_contractor || 'Ukjent'
    if (!contractorMap[c]) contractorMap[c] = new Set()
    contractorMap[c].add(r.development_project)
    const o = r.operator || 'Ukjent'
    if (!operatorMap[o]) operatorMap[o] = new Set()
    operatorMap[o].add(r.development_project)
  })
  const contractors = Object.entries(contractorMap)
    .map(([name, p]) => ({ name, projectCount: p.size }))
    .sort((a, b) => b.projectCount - a.projectCount)
  const operators = Object.entries(operatorMap)
    .map(([name, p]) => ({ name, projectCount: p.size }))
    .sort((a, b) => b.projectCount - a.projectCount)

  return {
    kpis: { totalProjects, upcomingCount, totalXmts, totalSurfKm },
    charts: { facilityDistribution, yearlyTrend, continentDistribution },
    companies: { contractors, operators },
    upcomingAwards,
    projects: projects.map(p => ({
      id: p.id,
      development_project: p.development_project,
      country: p.country,
      operator: p.operator,
      surf_contractor: p.surf_contractor,
      water_depth_category: p.water_depth_category,
      xmt_count: p.xmt_count,
      surf_km: p.surf_km,
    })),
  }
}

export default async function Home() {
  const data = await fetchData()
  return <Dashboard data={data} />
}
