import { Suspense } from 'react'
import { fetchKPIs, fetchCharts, fetchCompanies, fetchProjects, fetchUpcomingAwards, type DashboardFilters } from '@/lib/data'
import StatCards from '@/components/dashboard/StatCards'
import MarketCharts from '@/components/dashboard/MarketCharts'
import CompaniesGrid from '@/components/dashboard/CompaniesGrid'
import ProjectsTable from '@/components/dashboard/ProjectsTable'
import ContractsTable from '@/components/dashboard/ContractsTable'
import ActiveFilters from '@/components/dashboard/ActiveFilters'
import DashboardShell from '@/components/dashboard/DashboardShell'

function SectionSkeleton({ height = 'h-48' }: { height?: string }) {
  return <div className={`${height} bg-slate-800/50 rounded-xl animate-pulse`} />
}

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function Home({ searchParams }: Props) {
  const params = await searchParams
  const filters: DashboardFilters = {
    region: typeof params.region === 'string' ? params.region : undefined,
    phase: typeof params.phase === 'string' ? params.phase : undefined,
    operator: typeof params.operator === 'string' ? params.operator : undefined,
    contractor: typeof params.contractor === 'string' ? params.contractor : undefined,
    search: typeof params.search === 'string' ? params.search : undefined,
    country: typeof params.country === 'string' ? params.country : undefined,
  }

  const [kpis, charts, companies, projects, awards] = await Promise.all([
    fetchKPIs(filters),
    fetchCharts(filters),
    fetchCompanies(filters),
    fetchProjects(filters),
    fetchUpcomingAwards(filters),
  ])

  return (
    <DashboardShell projects={projects} awards={awards}>
      <Suspense fallback={<SectionSkeleton />}>
        <ActiveFilters />
      </Suspense>

      <StatCards kpis={kpis} />

      <MarketCharts charts={charts} />

      <Suspense fallback={<SectionSkeleton height="h-32" />}>
        <CompaniesGrid companies={companies} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton height="h-64" />}>
        <ContractsTable awards={awards} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton height="h-96" />}>
        <ProjectsTable
          projects={projects}
          totalCount={projects.length}
        />
      </Suspense>
    </DashboardShell>
  )
}
