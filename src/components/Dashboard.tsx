'use client'

import { Suspense, useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import * as XLSX from 'xlsx'

export interface DashboardData {
  kpis: { totalProjects: number; upcomingCount: number; totalXmts: number; totalSurfKm: number }
  charts: {
    facilityDistribution: { name: string; count: number }[]
    yearlyTrend: { year: number; xmts: number }[]
    continentDistribution: { name: string; count: number }[]
  }
  companies: {
    contractors: { name: string; projectCount: number }[]
    operators: { name: string; projectCount: number }[]
  }
  upcomingAwards: DashboardUpcomingAward[]
  projects: DashboardProject[]
}

interface DashboardUpcomingAward {
  id?: string
  year: number | null
  country: string | null
  development_project: string | null
  operator: string | null
  surf_contractor: string | null
  water_depth_category: string | null
}

interface DashboardProject {
  id?: string
  development_project: string | null
  asset?: string | null
  country: string | null
  continent?: string | null
  operator: string | null
  surf_contractor: string | null
  facility_category?: string | null
  water_depth_category: string | null
  xmt_count: number | null
  surf_km: number | null
  subsea_unit_count?: number | null
  first_year?: number | null
  last_year?: number | null
}

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

function DonutChart({ data, size = 180 }: { data: { name: string; count: number }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.count, 0)
  if (total === 0) return <div className="text-slate-500 text-sm">Ingen data</div>
  const r = size / 2 - 10
  const cx = size / 2
  const cy = size / 2

  const angles = data.map((d) => (d.count / total) * 2 * Math.PI)
  const angleEnds = angles.reduce<number[]>(
    (arr, angle, index) => [...arr, (index === 0 ? -Math.PI / 2 : arr[index - 1]) + angle],
    []
  )

  const slices = data.map((d, i) => {
    const startAngle = i === 0 ? -Math.PI / 2 : angleEnds[i - 1]
    const endAngle = angleEnds[i]
    const startX = cx + r * Math.cos(startAngle)
    const startY = cy + r * Math.sin(startAngle)
    const endX = cx + r * Math.cos(endAngle)
    const endY = cy + r * Math.sin(endAngle)
    const angle = angles[i]
    const large = angle > Math.PI ? 1 : 0
    return (
      <path
        key={`${d.name}-${i}`}
        d={`M ${cx} ${cy} L ${startX} ${startY} A ${r} ${r} 0 ${large} 1 ${endX} ${endY} Z`}
        fill={COLORS[i % COLORS.length]}
        stroke="#1e293b"
        strokeWidth="2"
      />
    )
  })

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size}>
        {slices}
        <circle cx={cx} cy={cy} r={r * 0.55} fill="#1e293b" />
      </svg>
      <div className="text-xs space-y-1">
        {data.slice(0, 6).map((d, i) => (
          <div key={`${d.name}-${i}`} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="text-slate-300 truncate max-w-[140px]">{d.name}</span>
            <span className="text-slate-500 ml-auto">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BarChart({ data }: { data: { year: number; xmts: number }[] }) {
  if (data.length === 0) return <div className="text-slate-500 text-sm">Ingen data</div>
  const max = Math.max(...data.map((d) => d.xmts), 1)
  const barW = Math.max(12, Math.min(30, 500 / data.length - 4))

  return (
    <div className="flex items-end gap-1 h-[160px] overflow-x-auto pb-6 relative">
      {data.map((d) => (
        <div key={d.year} className="flex flex-col items-center shrink-0" style={{ width: barW }}>
          <span className="text-[10px] text-slate-400 mb-1">{d.xmts}</span>
          <div
            className="rounded-t bg-green-500 w-full transition-all"
            style={{ height: `${Math.max(2, (d.xmts / max) * 130)}px` }}
          />
          <span className="text-[9px] text-slate-500 mt-1 -rotate-45 origin-top-left">{d.year}</span>
        </div>
      ))}
    </div>
  )
}

const NAV = [
  { label: 'Dashboard', icon: '📊', active: true },
  { label: 'Kontrakter', icon: '📄' },
  { label: 'Selskaper', icon: '🏢' },
  { label: 'Import', icon: '📥' },
  { label: 'Innstillinger', icon: '⚙️' },
]

function csvCell(value: unknown): string {
  const text = String(value ?? '')
  if (/[",\n;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function exportCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ].join('\n')

  downloadBlob(filename, new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
}

function exportXlsx(filename: string, sheetName: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })

  downloadBlob(
    filename,
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
  )
}

function getProjectKey(project: DashboardProject): string {
  if (project.id) return String(project.id)
  return [project.development_project || 'unknown', project.asset || 'unknown', project.country || 'unknown'].join('|')
}

function SectionFallback({ label }: { label: string }) {
  return (
    <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50 text-sm text-slate-500">
      Laster {label}...
    </div>
  )
}

function KpiSection({ kpis }: { kpis: DashboardData['kpis'] }) {
  const cards = [
    { label: 'Totalt antall prosjekter', value: kpis.totalProjects.toLocaleString(), valueClass: 'text-green-400' },
    { label: 'Upcoming Awards', value: kpis.upcomingCount.toLocaleString(), valueClass: 'text-blue-400' },
    { label: 'Total XMTs', value: kpis.totalXmts.toLocaleString(), valueClass: 'text-amber-400' },
    { label: 'Total SURF km', value: kpis.totalSurfKm.toLocaleString(), valueClass: 'text-purple-400' },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((kpi) => (
        <div key={kpi.label} className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
          <div className="text-slate-400 text-xs mb-2">{kpi.label}</div>
          <div className={`text-2xl font-bold ${kpi.valueClass}`}>{kpi.value}</div>
        </div>
      ))}
    </div>
  )
}

function ChartsSection({ charts }: { charts: DashboardData['charts'] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">Fasefordeling</h3>
        <DonutChart data={charts.facilityDistribution} />
      </div>
      <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">Årlig trend (XMTs)</h3>
        <BarChart data={charts.yearlyTrend} />
      </div>
      <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">Regional fordeling</h3>
        <DonutChart data={charts.continentDistribution} />
      </div>
    </div>
  )
}

function CompanySection({
  companies,
  filterContractor,
  filterOperator,
  onToggleContractor,
  onToggleOperator,
}: {
  companies: DashboardData['companies']
  filterContractor: string
  filterOperator: string
  onToggleContractor: (name: string) => void
  onToggleOperator: (name: string) => void
}) {
  return (
    <>
      <section>
        <h2 className="text-lg font-semibold text-slate-200 mb-3">Installasjonsselskaper (SURF-kontraktører)</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {companies.contractors.slice(0, 12).map((c) => (
            <button
              key={c.name}
              onClick={() => onToggleContractor(c.name)}
              className={`bg-slate-800/80 rounded-lg p-4 border-l-4 border-green-600 text-left hover:bg-slate-700/80 transition ${
                filterContractor === c.name ? 'ring-1 ring-green-500' : ''
              }`}
            >
              <div className="text-sm font-medium text-slate-200 truncate">{c.name}</div>
              <div className="text-xs text-slate-400 mt-1">{c.projectCount} prosjekter</div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-200 mb-3">Operatørselskaper</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {companies.operators.slice(0, 12).map((c) => (
            <button
              key={c.name}
              onClick={() => onToggleOperator(c.name)}
              className={`bg-slate-800/80 rounded-lg p-3 border-l-4 border-green-300 text-left hover:bg-slate-700/80 transition ${
                filterOperator === c.name ? 'ring-1 ring-green-400' : ''
              }`}
            >
              <div className="text-sm font-medium text-slate-200 truncate">{c.name}</div>
              <div className="text-xs text-slate-400 mt-1">{c.projectCount} prosjekter</div>
            </button>
          ))}
        </div>
      </section>
    </>
  )
}

function UpcomingAwardsSection({
  upcomingAwards,
  onExportCsv,
  onExportXlsx,
}: {
  upcomingAwards: DashboardUpcomingAward[]
  onExportCsv: () => void
  onExportXlsx: () => void
}) {
  if (upcomingAwards.length === 0) return null

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-lg font-semibold text-slate-200">Upcoming Awards</h2>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onExportCsv}
            className="text-xs px-2.5 py-1 rounded border border-slate-600 text-slate-300 hover:bg-slate-700/50"
          >
            Export CSV
          </button>
          <button
            onClick={onExportXlsx}
            className="text-xs px-2.5 py-1 rounded border border-slate-600 text-slate-300 hover:bg-slate-700/50"
          >
            Export Excel
          </button>
        </div>
      </div>
      <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400 text-xs">
              <th className="text-left p-3">År</th>
              <th className="text-left p-3">Land</th>
              <th className="text-left p-3">Prosjekt</th>
              <th className="text-left p-3">Operatør</th>
              <th className="text-left p-3">Kontraktør</th>
              <th className="text-left p-3">Vanndybde</th>
            </tr>
          </thead>
          <tbody>
            {upcomingAwards.slice(0, 20).map((award, index) => (
              <tr key={award.id || index} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                <td className="p-3 text-slate-300">{award.year ?? '-'}</td>
                <td className="p-3 text-slate-300">{award.country || '-'}</td>
                <td className="p-3 text-slate-200">{award.development_project || '-'}</td>
                <td className="p-3 text-slate-300">{award.operator || '-'}</td>
                <td className="p-3 text-slate-300">{award.surf_contractor || '-'}</td>
                <td className="p-3 text-slate-300">{award.water_depth_category || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ProjectsSection({
  projects,
  totalProjects,
  selectedProjectKey,
  onOpenDetails,
  onExportCsv,
  onExportXlsx,
}: {
  projects: DashboardProject[]
  totalProjects: number
  selectedProjectKey: string
  onOpenDetails: (project: DashboardProject) => void
  onExportCsv: () => void
  onExportXlsx: () => void
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-lg font-semibold text-slate-200">
          Prosjekter {projects.length !== totalProjects && `(${projects.length} av ${totalProjects})`}
        </h2>
        <span className="text-xs text-slate-500">Klikk rad for detaljer</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onExportCsv}
            className="text-xs px-2.5 py-1 rounded border border-slate-600 text-slate-300 hover:bg-slate-700/50"
          >
            Export CSV
          </button>
          <button
            onClick={onExportXlsx}
            className="text-xs px-2.5 py-1 rounded border border-slate-600 text-slate-300 hover:bg-slate-700/50"
          >
            Export Excel
          </button>
        </div>
      </div>
      <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400 text-xs">
              <th className="text-left p-3">Prosjekt</th>
              <th className="text-left p-3">Land</th>
              <th className="text-left p-3">Operatør</th>
              <th className="text-left p-3">Kontraktør</th>
              <th className="text-right p-3">XMTs</th>
              <th className="text-right p-3">SURF km</th>
            </tr>
          </thead>
          <tbody>
            {projects.slice(0, 100).map((project) => {
              const rowKey = getProjectKey(project)
              return (
                <tr
                  key={rowKey}
                  onClick={() => onOpenDetails(project)}
                  className={`border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer ${
                    rowKey === selectedProjectKey ? 'bg-slate-700/40' : ''
                  }`}
                >
                  <td className="p-3 text-slate-200 max-w-[240px] truncate">{project.development_project || '-'}</td>
                  <td className="p-3 text-slate-300">{project.country || '-'}</td>
                  <td className="p-3 text-slate-300">{project.operator || '-'}</td>
                  <td className="p-3 text-slate-300">{project.surf_contractor || '-'}</td>
                  <td className="p-3 text-right text-green-400 font-mono">{project.xmt_count ?? 0}</td>
                  <td className="p-3 text-right text-blue-400 font-mono">{project.surf_km ?? 0}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {projects.length > 100 && (
          <div className="p-3 text-center text-slate-500 text-xs">Viser 100 av {projects.length} prosjekter</div>
        )}
      </div>
    </section>
  )
}

export default function Dashboard({ data }: { data: DashboardData }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [searchInput, setSearchInput] = useState(searchParams.get('q') || '')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isPending, startTransition] = useTransition()

  const search = searchParams.get('q') || ''
  const filterContractor = searchParams.get('contractor') || ''
  const filterOperator = searchParams.get('operator') || ''
  const selectedProjectKey = searchParams.get('project') || ''

  const setQueryParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    let changed = false

    for (const [key, value] of Object.entries(updates)) {
      const current = params.get(key)
      if (!value) {
        if (current !== null) {
          params.delete(key)
          changed = true
        }
      } else if (current !== value) {
        params.set(key, value)
        changed = true
      }
    }

    if (!changed) return

    const nextQuery = params.toString()
    const nextPath = nextQuery ? `${pathname}?${nextQuery}` : pathname

    startTransition(() => {
      router.replace(nextPath, { scroll: false })
    })
  }, [pathname, router, searchParams])

  useEffect(() => {
    setSearchInput(search)
  }, [search])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (searchInput !== search) {
        setQueryParams({ q: searchInput, project: null })
      }
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [searchInput, search, setQueryParams])

  const filteredProjects = useMemo(() => {
    const needle = search.toLowerCase()

    return data.projects.filter((project) => {
      if (filterContractor && project.surf_contractor !== filterContractor) return false
      if (filterOperator && project.operator !== filterOperator) return false
      if (needle) {
        return (
          (project.development_project || '').toLowerCase().includes(needle) ||
          (project.operator || '').toLowerCase().includes(needle) ||
          (project.country || '').toLowerCase().includes(needle) ||
          (project.surf_contractor || '').toLowerCase().includes(needle)
        )
      }
      return true
    })
  }, [data.projects, search, filterContractor, filterOperator])

  const selectedProject = useMemo(() => {
    if (!selectedProjectKey) return null
    return data.projects.find((project) => getProjectKey(project) === selectedProjectKey) || null
  }, [data.projects, selectedProjectKey])

  const clearFilters = useCallback(() => {
    setQueryParams({ q: null, contractor: null, operator: null, project: null })
  }, [setQueryParams])

  const toggleContractor = useCallback((name: string) => {
    setQueryParams({ contractor: filterContractor === name ? null : name, project: null })
  }, [filterContractor, setQueryParams])

  const toggleOperator = useCallback((name: string) => {
    setQueryParams({ operator: filterOperator === name ? null : name, project: null })
  }, [filterOperator, setQueryParams])

  const openProjectDetails = useCallback((project: DashboardProject) => {
    setQueryParams({ project: getProjectKey(project) })
  }, [setQueryParams])

  const closeProjectDetails = useCallback(() => {
    setQueryParams({ project: null })
  }, [setQueryParams])

  const timestamp = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const upcomingExportRows = useMemo(() => (
    data.upcomingAwards.map((award) => ({
      year: award.year,
      country: award.country,
      development_project: award.development_project,
      operator: award.operator,
      surf_contractor: award.surf_contractor,
      water_depth_category: award.water_depth_category,
    }))
  ), [data.upcomingAwards])

  const projectExportRows = useMemo(() => (
    filteredProjects.map((project) => ({
      development_project: project.development_project,
      asset: project.asset || '',
      country: project.country,
      operator: project.operator,
      surf_contractor: project.surf_contractor,
      facility_category: project.facility_category || '',
      water_depth_category: project.water_depth_category,
      first_year: project.first_year ?? '',
      last_year: project.last_year ?? '',
      xmt_count: project.xmt_count ?? 0,
      surf_km: project.surf_km ?? 0,
      subsea_unit_count: project.subsea_unit_count ?? 0,
    }))
  ), [filteredProjects])

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className={`${sidebarOpen ? 'w-56' : 'w-0'} bg-slate-900 border-r border-slate-800 transition-all duration-200 overflow-hidden shrink-0`}>
        <div className="p-4">
          <div className="text-green-500 font-bold text-lg mb-1">CSUB</div>
          <div className="text-slate-500 text-xs mb-6">Sales Intelligence</div>
          <nav className="space-y-1">
            {NAV.map((item) => (
              <a
                key={item.label}
                href="#"
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                  item.active ? 'bg-slate-800 text-green-400' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-300'
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-4 shrink-0">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-slate-400 hover:text-slate-200">☰</button>
          <h1 className="text-sm font-semibold text-slate-200">CSUB Sales Intelligence Platform</h1>
          <div className="flex-1" />
          {isPending && <span className="text-[11px] text-slate-500">Oppdaterer...</span>}
          <input
            type="text"
            placeholder="Søk prosjekter, selskaper..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 w-72 focus:outline-none focus:border-green-500"
          />
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {(filterContractor || filterOperator) && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-400">Filter:</span>
              {filterContractor && (
                <span className="bg-green-600/20 text-green-400 px-2 py-0.5 rounded text-xs">Kontraktør: {filterContractor}</span>
              )}
              {filterOperator && (
                <span className="bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded text-xs">Operatør: {filterOperator}</span>
              )}
              <button onClick={clearFilters} className="text-slate-500 hover:text-slate-300 text-xs ml-2">✕ Fjern filter</button>
            </div>
          )}

          <Suspense fallback={<SectionFallback label="nøkkeltall" />}>
            <KpiSection kpis={data.kpis} />
          </Suspense>

          <Suspense fallback={<SectionFallback label="visualiseringer" />}>
            <ChartsSection charts={data.charts} />
          </Suspense>

          <Suspense fallback={<SectionFallback label="selskap" />}>
            <CompanySection
              companies={data.companies}
              filterContractor={filterContractor}
              filterOperator={filterOperator}
              onToggleContractor={toggleContractor}
              onToggleOperator={toggleOperator}
            />
          </Suspense>

          <Suspense fallback={<SectionFallback label="upcoming awards" />}>
            <UpcomingAwardsSection
              upcomingAwards={data.upcomingAwards}
              onExportCsv={() => exportCsv(`upcoming-awards-${timestamp}.csv`, upcomingExportRows)}
              onExportXlsx={() => exportXlsx(`upcoming-awards-${timestamp}.xlsx`, 'UpcomingAwards', upcomingExportRows)}
            />
          </Suspense>

          <Suspense fallback={<SectionFallback label="prosjektliste" />}>
            <ProjectsSection
              projects={filteredProjects}
              totalProjects={data.projects.length}
              selectedProjectKey={selectedProjectKey}
              onOpenDetails={openProjectDetails}
              onExportCsv={() => exportCsv(`projects-${timestamp}.csv`, projectExportRows)}
              onExportXlsx={() => exportXlsx(`projects-${timestamp}.xlsx`, 'Projects', projectExportRows)}
            />
          </Suspense>
        </main>
      </div>

      <div
        onClick={closeProjectDetails}
        className={`fixed inset-0 z-40 bg-slate-950/60 transition-opacity ${
          selectedProject ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      <aside
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-md bg-slate-900 border-l border-slate-700 transform transition-transform duration-300 ${
          selectedProject ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-14 border-b border-slate-700 px-4 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-100">Prosjektdetaljer</h3>
          <div className="ml-auto" />
          <button onClick={closeProjectDetails} className="text-slate-400 hover:text-slate-200 text-lg leading-none">✕</button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto h-[calc(100%-56px)]">
          {selectedProject ? (
            <>
              <div>
                <h4 className="text-base font-semibold text-slate-100 mb-1">{selectedProject.development_project || '-'}</h4>
                <p className="text-xs text-slate-400">{selectedProject.asset || 'Asset ikke oppgitt'}</p>
              </div>

              <div className="bg-slate-800/80 rounded-lg border border-slate-700/50 divide-y divide-slate-700/60">
                {[
                  { label: 'Land', value: selectedProject.country || '-' },
                  { label: 'Kontinent', value: selectedProject.continent || '-' },
                  { label: 'Operatør', value: selectedProject.operator || '-' },
                  { label: 'Kontraktør', value: selectedProject.surf_contractor || '-' },
                  { label: 'Fasilitetskategori', value: selectedProject.facility_category || '-' },
                  { label: 'Vanndybde', value: selectedProject.water_depth_category || '-' },
                  { label: 'Første år', value: selectedProject.first_year ?? '-' },
                  { label: 'Siste år', value: selectedProject.last_year ?? '-' },
                  { label: 'XMTs', value: selectedProject.xmt_count ?? 0 },
                  { label: 'SURF km', value: selectedProject.surf_km ?? 0 },
                  { label: 'Subsea units', value: selectedProject.subsea_unit_count ?? 0 },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-3 p-3 text-sm">
                    <span className="text-slate-400">{row.label}</span>
                    <span className="ml-auto text-slate-200 font-medium text-right">{row.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-500">Velg et prosjekt i tabellen for å se detaljer.</div>
          )}
        </div>
      </aside>
    </div>
  )
}
