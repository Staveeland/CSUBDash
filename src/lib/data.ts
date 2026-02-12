import { createAdminClient } from '@/lib/supabase/admin'

export interface DashboardFilters {
  region?: string
  phase?: string
  operator?: string
  contractor?: string
  search?: string
  country?: string
}

export interface KPIs {
  totalProjects: number
  upcomingCount: number
  totalXmts: number
  totalSurfKm: number
}

export interface ChartData {
  facilityDistribution: { name: string; count: number }[]
  yearlyTrend: { year: number; xmts: number }[]
  continentDistribution: { name: string; count: number }[]
}

export interface CompanyData {
  contractors: { name: string; projectCount: number }[]
  operators: { name: string; projectCount: number }[]
}

export interface ProjectRow {
  id: string
  development_project: string
  country: string | null
  continent: string | null
  operator: string | null
  surf_contractor: string | null
  water_depth_category: string | null
  facility_category: string | null
  xmt_count: number | null
  surf_km: number | null
  first_year: number | null
  last_year: number | null
}

export interface UpcomingAward {
  id: string
  year: number | null
  country: string | null
  development_project: string | null
  operator: string | null
  surf_contractor: string | null
  water_depth_category: string | null
  facility_category: string | null
  xmts_awarded: number | null
}

export async function fetchKPIs(filters: DashboardFilters): Promise<KPIs> {
  const supabase = createAdminClient()

  let projectQuery = supabase.from('projects').select('xmt_count, surf_km')
  if (filters.operator) projectQuery = projectQuery.eq('operator', filters.operator)
  if (filters.contractor) projectQuery = projectQuery.eq('surf_contractor', filters.contractor)
  if (filters.country) projectQuery = projectQuery.eq('country', filters.country)
  if (filters.region) projectQuery = projectQuery.eq('continent', filters.region)

  const [projectsRes, upcomingRes] = await Promise.all([
    projectQuery,
    supabase.from('upcoming_awards').select('*', { count: 'exact', head: true }),
  ])

  const rows = projectsRes.data ?? []
  const totalProjects = rows.length
  const totalXmts = rows.reduce((sum, r) => sum + (r.xmt_count ?? 0), 0)
  const totalSurfKm = rows.reduce((sum, r) => sum + (r.surf_km ?? 0), 0)

  return {
    totalProjects,
    upcomingCount: upcomingRes.count ?? 0,
    totalXmts,
    totalSurfKm: Math.round(totalSurfKm * 10) / 10,
  }
}

export async function fetchCharts(filters: DashboardFilters): Promise<ChartData> {
  const supabase = createAdminClient()

  let query = supabase.from('projects').select('facility_category, continent, country, first_year, xmt_count')
  if (filters.operator) query = query.eq('operator', filters.operator)
  if (filters.contractor) query = query.eq('surf_contractor', filters.contractor)
  if (filters.country) query = query.eq('country', filters.country)
  if (filters.region) query = query.eq('continent', filters.region)

  const { data: projects } = await query
  const rows = projects ?? []

  const facilityMap: Record<string, number> = {}
  const yearMap: Record<number, number> = {}
  const continentMap: Record<string, number> = {}

  rows.forEach(r => {
    const fk = r.facility_category || 'Ukjent'
    facilityMap[fk] = (facilityMap[fk] || 0) + 1

    if (r.first_year) {
      yearMap[r.first_year] = (yearMap[r.first_year] || 0) + (r.xmt_count ?? 0)
    }

    const ck = r.continent || 'Ukjent'
    continentMap[ck] = (continentMap[ck] || 0) + 1
  })

  return {
    facilityDistribution: Object.entries(facilityMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    yearlyTrend: Object.entries(yearMap).map(([year, xmts]) => ({ year: Number(year), xmts })).sort((a, b) => a.year - b.year),
    continentDistribution: Object.entries(continentMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  }
}

export async function fetchCompanies(filters: DashboardFilters): Promise<CompanyData> {
  const supabase = createAdminClient()

  let query = supabase.from('projects').select('surf_contractor, operator, development_project')
  if (filters.country) query = query.eq('country', filters.country)
  if (filters.region) query = query.eq('continent', filters.region)

  const { data: projects } = await query
  const rows = projects ?? []

  const contractorMap: Record<string, Set<string>> = {}
  const operatorMap: Record<string, Set<string>> = {}

  rows.forEach(r => {
    const ck = r.surf_contractor || 'Ukjent'
    if (!contractorMap[ck]) contractorMap[ck] = new Set()
    contractorMap[ck].add(r.development_project)

    const ok = r.operator || 'Ukjent'
    if (!operatorMap[ok]) operatorMap[ok] = new Set()
    operatorMap[ok].add(r.development_project)
  })

  return {
    contractors: Object.entries(contractorMap).map(([name, projects]) => ({ name, projectCount: projects.size })).sort((a, b) => b.projectCount - a.projectCount),
    operators: Object.entries(operatorMap).map(([name, projects]) => ({ name, projectCount: projects.size })).sort((a, b) => b.projectCount - a.projectCount),
  }
}

export async function fetchProjects(filters: DashboardFilters): Promise<ProjectRow[]> {
  const supabase = createAdminClient()

  let query = supabase
    .from('projects')
    .select('id, development_project, country, continent, operator, surf_contractor, water_depth_category, facility_category, xmt_count, surf_km, first_year, last_year')
    .order('xmt_count', { ascending: false })
    .limit(500)

  if (filters.search) query = query.or(`development_project.ilike.%${filters.search}%,operator.ilike.%${filters.search}%,country.ilike.%${filters.search}%`)
  if (filters.contractor) query = query.eq('surf_contractor', filters.contractor)
  if (filters.operator) query = query.eq('operator', filters.operator)
  if (filters.country) query = query.eq('country', filters.country)
  if (filters.region) query = query.eq('continent', filters.region)

  const { data } = await query
  return (data ?? []) as ProjectRow[]
}

export async function fetchUpcomingAwards(filters: DashboardFilters): Promise<UpcomingAward[]> {
  const supabase = createAdminClient()

  let query = supabase
    .from('upcoming_awards')
    .select('id, year, country, development_project, operator, surf_contractor, water_depth_category, facility_category, xmts_awarded')
    .order('year', { ascending: true })
    .limit(100)

  if (filters.operator) query = query.eq('operator', filters.operator)
  if (filters.contractor) query = query.eq('surf_contractor', filters.contractor)
  if (filters.country) query = query.eq('country', filters.country)

  const { data } = await query
  return (data ?? []) as UpcomingAward[]
}

export async function fetchWatchlist(userIdentifier: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('watchlist')
    .select('*')
    .eq('user_identifier', userIdentifier)
    .order('created_at', { ascending: false })
  return data ?? []
}
