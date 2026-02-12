import Dashboard, { type DashboardData } from '@/components/Dashboard'
import { createClient } from '@/lib/supabase/server'

type ProjectRow = {
  id: string
  development_project: string | null
  asset: string | null
  country: string | null
  continent: string | null
  operator: string | null
  surf_contractor: string | null
  facility_category: string | null
  water_depth_category: string | null
  first_year: number | null
  xmt_count: number | null
  surf_km: number | null
  subsea_unit_count: number | null
}

type UpcomingAwardRow = {
  id: string
  year: number | null
  country: string | null
  development_project: string | null
  operator: string | null
  surf_contractor: string | null
  water_depth_category: string | null
}

export const dynamic = 'force-dynamic'

function buildDashboardData(projects: ProjectRow[], upcomingAwards: UpcomingAwardRow[]): DashboardData {
  const facilityMap: Record<string, number> = {}
  const yearMap: Record<number, number> = {}
  const continentMap: Record<string, number> = {}
  const contractorMap: Record<string, Set<string>> = {}
  const operatorMap: Record<string, Set<string>> = {}

  let totalXmts = 0
  let totalSurfKm = 0

  for (const row of projects) {
    const facility = row.facility_category || 'Ukjent'
    const continent = row.continent || 'Ukjent'
    const contractor = row.surf_contractor || 'Ukjent'
    const operator = row.operator || 'Ukjent'
    const projectName = row.development_project || 'Ukjent'
    const year = row.first_year

    facilityMap[facility] = (facilityMap[facility] || 0) + 1
    continentMap[continent] = (continentMap[continent] || 0) + 1

    if (year !== null) {
      yearMap[year] = (yearMap[year] || 0) + (row.xmt_count ?? 0)
    }

    if (!contractorMap[contractor]) contractorMap[contractor] = new Set<string>()
    contractorMap[contractor].add(projectName)

    if (!operatorMap[operator]) operatorMap[operator] = new Set<string>()
    operatorMap[operator].add(projectName)

    totalXmts += row.xmt_count ?? 0
    totalSurfKm += row.surf_km ?? 0
  }

  return {
    kpis: {
      totalProjects: projects.length,
      upcomingCount: upcomingAwards.length,
      totalXmts,
      totalSurfKm: Math.round(totalSurfKm * 10) / 10,
    },
    charts: {
      facilityDistribution: Object.entries(facilityMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      yearlyTrend: Object.entries(yearMap)
        .map(([year, xmts]) => ({ year: Number(year), xmts }))
        .sort((a, b) => a.year - b.year),
      continentDistribution: Object.entries(continentMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    },
    companies: {
      contractors: Object.entries(contractorMap)
        .map(([name, projectSet]) => ({ name, projectCount: projectSet.size }))
        .sort((a, b) => b.projectCount - a.projectCount),
      operators: Object.entries(operatorMap)
        .map(([name, projectSet]) => ({ name, projectCount: projectSet.size }))
        .sort((a, b) => b.projectCount - a.projectCount),
    },
    upcomingAwards,
    projects,
  }
}

export default async function Home() {
  const supabase = await createClient()

  const [projectsRes, upcomingRes] = await Promise.all([
    supabase
      .from('projects')
      .select('id, development_project, asset, country, continent, operator, surf_contractor, facility_category, water_depth_category, first_year, xmt_count, surf_km, subsea_unit_count')
      .order('xmt_count', { ascending: false })
      .limit(500),
    supabase
      .from('upcoming_awards')
      .select('id, year, country, development_project, operator, surf_contractor, water_depth_category')
      .order('year', { ascending: false })
      .limit(200),
  ])

  const projects = (projectsRes.data ?? []) as ProjectRow[]
  const upcomingAwards = (upcomingRes.data ?? []) as UpcomingAwardRow[]
  const data = buildDashboardData(projects, upcomingAwards)

  return <Dashboard data={data} />
}
