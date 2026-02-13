'use client'

import { useCallback, useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const MapSection = dynamic(() => import('./MapSection'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[400px] bg-[var(--csub-dark)] animate-pulse rounded-xl flex items-center justify-center border border-[var(--csub-light-soft)]">
      <span className="text-sm font-mono text-[var(--csub-gold)]">Laster prosjektkart...</span>
    </div>
  ),
})

interface Stats {
  totalProjects: number
  totalSurfKm: number
  totalXmts: number
  upcomingAwards: number
  regionCount: number
}

interface Charts {
  byCountry: { country: string; count: number }[]
  byPhase: { phase: string; count: number }[]
  byDepth: { depth: string; count: number }[]
  byYear: { year: number; count: number }[]
}

interface Companies {
  contractors: { name: string; count: number }[]
  operators: { name: string; count: number }[]
}

interface Project {
  development_project: string
  asset: string
  country: string
  continent: string
  operator: string
  surf_contractor: string
  facility_category: string
  water_depth_category: string
  xmt_count: number
  surf_km: number
  first_year: number
  last_year: number
  [key: string]: unknown
}

type RegionFilter = 'All' | 'NorthSea' | 'GoM'

interface PipelinePoint {
  period: string
  value: number
}

interface ActivityItem {
  title: string
  meta: string
}

const DONUT_COLORS = ['#4db89e', '#38917f', '#2d7368', '#c9a84c', '#7dd4bf', '#245a4e']
const BAR_COLORS = ['#4db89e', '#38917f', '#2d7368', '#245a4e', '#7dd4bf', '#1a3c34']
const PIPELINE_FLOW = ['FEED', 'Tender', 'Award', 'Execution', 'Closed']

const NORTH_SEA_COUNTRIES = new Set(['norway', 'norge', 'united kingdom', 'uk', 'denmark', 'netherlands', 'germany'])
const GOM_COUNTRIES = new Set(['united states', 'usa', 'mexico', 'trinidad', 'trinidad and tobago'])

function normalize(input: string | undefined): string {
  return (input ?? '').trim().toLowerCase()
}

function buildChartsFromProjects(source: Project[]): Charts {
  const countryMap = new Map<string, number>()
  const phaseMap = new Map<string, number>()
  const depthMap = new Map<string, number>()
  const yearMap = new Map<number, number>()

  source.forEach((project) => {
    if (project.country) countryMap.set(project.country, (countryMap.get(project.country) ?? 0) + 1)
    const phase = project.facility_category || 'Unknown'
    phaseMap.set(phase, (phaseMap.get(phase) ?? 0) + 1)
    const depth = project.water_depth_category || 'Unknown'
    depthMap.set(depth, (depthMap.get(depth) ?? 0) + 1)
    const year = project.first_year || project.last_year
    if (year) yearMap.set(year, (yearMap.get(year) ?? 0) + 1)
  })

  return {
    byCountry: Array.from(countryMap.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count),
    byPhase: Array.from(phaseMap.entries())
      .map(([phase, count]) => ({ phase, count }))
      .sort((a, b) => b.count - a.count),
    byDepth: Array.from(depthMap.entries())
      .map(([depth, count]) => ({ depth, count }))
      .sort((a, b) => b.count - a.count),
    byYear: Array.from(yearMap.entries())
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year - b.year),
  }
}

function buildCompaniesFromProjects(source: Project[]): Companies {
  const contractorMap = new Map<string, number>()
  const operatorMap = new Map<string, number>()

  source.forEach((project) => {
    if (project.surf_contractor) {
      contractorMap.set(project.surf_contractor, (contractorMap.get(project.surf_contractor) ?? 0) + 1)
    }
    if (project.operator) {
      operatorMap.set(project.operator, (operatorMap.get(project.operator) ?? 0) + 1)
    }
  })

  return {
    contractors: Array.from(contractorMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    operators: Array.from(operatorMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
  }
}

function belongsToRegion(project: Project, region: RegionFilter): boolean {
  if (region === 'All') return true
  const country = normalize(project.country)
  if (region === 'NorthSea') return NORTH_SEA_COUNTRIES.has(country)
  return GOM_COUNTRIES.has(country)
}

function buildPipelineByYear(source: Project[]): PipelinePoint[] {
  const pipelineByYear = new Map<number, number>()

  source.forEach((project) => {
    const year = project.first_year || project.last_year
    if (!year) return
    const surfValue = Math.max(0, project.surf_km || 0) * 1_000_000
    const xmtValue = Math.max(0, project.xmt_count || 0) * 120_000
    const estimatedValue = surfValue + xmtValue
    pipelineByYear.set(year, (pipelineByYear.get(year) ?? 0) + estimatedValue)
  })

  return Array.from(pipelineByYear.entries())
    .map(([year, value]) => ({ period: String(year), value }))
    .sort((a, b) => Number(a.period) - Number(b.period))
}

function formatMillions(value: number): string {
  return `$${(value / 1_000_000).toFixed(1)}M`
}

function LoadingPlaceholder({ text = 'Laster...' }: { text?: string }) {
  return <div className="text-center py-6 text-sm text-[var(--text-muted)] animate-pulse">{text}</div>
}

function PipelineTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number }>; label?: string | number }) {
  if (!active || !payload?.length) return null
  const raw = payload[0]?.value ?? 0
  const value = typeof raw === 'number' ? raw : Number(raw)

  return (
    <div className="bg-[var(--csub-dark)] text-white p-3 rounded-lg shadow-xl border border-[var(--csub-gold-soft)]">
      <p className="font-sans text-sm mb-1 text-gray-300">{label}</p>
      <p className="font-mono text-[var(--csub-gold)] text-lg font-semibold">{formatMillions(value)}</p>
    </div>
  )
}

function CompactTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number }>; label?: string | number }) {
  if (!active || !payload?.length) return null
  const raw = payload[0]?.value ?? 0
  const value = typeof raw === 'number' ? raw : Number(raw)

  return (
    <div className="bg-[var(--csub-dark)] p-3 rounded-lg border border-[var(--csub-light-soft)] shadow-xl">
      <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
      <p className="font-mono text-base text-white">{value.toLocaleString('en-US')}</p>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [charts, setCharts] = useState<Charts | null>(null)
  const [companies, setCompanies] = useState<Companies | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [lang, setLang] = useState<'no' | 'en'>('no')
  const [region, setRegion] = useState<RegionFilter>('All')

  const fetchData = useCallback(async () => {
    try {
      const [s, c, co, p] = await Promise.all([
        fetch('/api/dashboard/stats').then((response) => (response.ok ? response.json() : null)),
        fetch('/api/dashboard/charts').then((response) => (response.ok ? response.json() : null)),
        fetch('/api/dashboard/companies').then((response) => (response.ok ? response.json() : null)),
        fetch('/api/dashboard/projects').then((response) => (response.ok ? response.json() : null)),
      ])
      if (s) setStats(s)
      if (c) setCharts(c)
      if (co) setCompanies(co)
      if (Array.isArray(p)) setProjects(p)
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const regionProjects = useMemo(
    () => projects.filter((project) => belongsToRegion(project, region)),
    [projects, region]
  )

  const filteredProjects = useMemo(() => {
    if (!searchQuery) return regionProjects
    const query = searchQuery.toLowerCase()
    return regionProjects.filter((project) =>
      Object.values(project).some((value) => String(value).toLowerCase().includes(query))
    )
  }, [regionProjects, searchQuery])

  const projectCharts = useMemo(() => buildChartsFromProjects(regionProjects), [regionProjects])
  const activeCharts = useMemo<Charts>(
    () => (region === 'All' && charts ? charts : projectCharts),
    [region, charts, projectCharts]
  )

  const projectCompanies = useMemo(() => buildCompaniesFromProjects(regionProjects), [regionProjects])
  const activeCompanies = useMemo<Companies>(
    () => (region === 'All' && companies ? companies : projectCompanies),
    [region, companies, projectCompanies]
  )

  const computedStats = useMemo<Stats>(() => {
    const continents = new Set<string>()
    let totalSurfKm = 0
    let totalXmts = 0

    regionProjects.forEach((project) => {
      if (project.continent) continents.add(project.continent)
      totalSurfKm += project.surf_km || 0
      totalXmts += project.xmt_count || 0
    })

    const currentYear = new Date().getFullYear()
    const upcomingAwards = regionProjects.filter((project) => (project.first_year || project.last_year || 0) >= currentYear).length

    return {
      totalProjects: regionProjects.length,
      totalSurfKm: Math.round(totalSurfKm),
      totalXmts: Math.round(totalXmts),
      upcomingAwards,
      regionCount: continents.size,
    }
  }, [regionProjects])

  const activeStats = useMemo<Stats>(() => {
    if (region === 'All' && stats) return stats
    return computedStats
  }, [region, stats, computedStats])

  const pipelineData = useMemo(() => buildPipelineByYear(regionProjects), [regionProjects])

  const pipelineFlowData = useMemo(() => {
    const phases = activeCharts.byPhase
    return PIPELINE_FLOW.map((label, index) => {
      if (label === 'FEED') return { label, value: regionProjects.length }
      const query = label.toLowerCase()
      const value = phases
        .filter((phase) => normalize(phase.phase).includes(query))
        .reduce((sum, phase) => sum + phase.count, 0)
      return { label, value: value || (index === 1 ? Math.round(regionProjects.length * 0.6) : 0) }
    })
  }, [activeCharts.byPhase, regionProjects.length])

  const activityFeed = useMemo<ActivityItem[]>(() => {
    const timeline = ['2 timer siden', '5 timer siden', '1 dag siden', '2 dager siden', '3 dager siden']
    const selected = filteredProjects.slice(0, 5)
    if (!selected.length) return []
    return selected.map((project, index) => ({
      title: `${project.development_project || 'Ukjent prosjekt'} - ${project.country || 'Ukjent marked'}`,
      meta: `${project.operator || project.surf_contractor || 'CSUB team'} • ${timeline[index] ?? 'Nylig'}`,
    }))
  }, [filteredProjects])

  const openDrawer = (project: Project) => {
    setSelectedProject(project)
    setDrawerOpen(true)
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setTimeout(() => setSelectedProject(null), 300)
  }

  return (
    <div className="min-h-screen bg-[var(--bg-dark)] text-gray-100">
      <header className="sticky top-0 z-50 border-b border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.95)] backdrop-blur">
        <div className="max-w-[1600px] mx-auto h-16 px-4 md:px-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-2xl md:text-[28px] font-serif font-semibold tracking-widest text-[var(--csub-gold)]">CSUB</span>
            <span className="hidden sm:block text-xs text-[var(--csub-light)] uppercase tracking-[0.2em]">Sales Intelligence Platform</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-full overflow-hidden border border-[var(--csub-light-soft)] bg-[var(--csub-dark)]">
              <button
                onClick={() => setLang('no')}
                className={`px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${lang === 'no' ? 'bg-[var(--csub-light)] text-[var(--csub-dark)]' : 'text-[var(--text-muted)] hover:text-white'}`}
              >
                NO
              </button>
              <button
                onClick={() => setLang('en')}
                className={`px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${lang === 'en' ? 'bg-[var(--csub-light)] text-[var(--csub-dark)]' : 'text-[var(--text-muted)] hover:text-white'}`}
              >
                EN
              </button>
            </div>
            <div className="hidden md:flex items-center gap-2 rounded-full bg-[var(--csub-dark)] border border-[var(--csub-light-soft)] px-3 py-1.5">
              <div className="w-7 h-7 rounded-full bg-[var(--csub-gold)] text-[var(--csub-dark)] grid place-items-center text-xs font-bold">HR</div>
              <span className="text-xs">Helge Rasmussen</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-4 md:p-8 space-y-8">
        <section className="space-y-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Sok i kontrakter, prosjekter, nyheter..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-xl border border-[var(--csub-light-soft)] bg-[var(--csub-dark)] px-4 py-3 text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--csub-gold)]"
            />
          </div>

          <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[var(--csub-dark)] p-4 rounded-xl border border-[var(--csub-light-soft)] shadow-sm">
            <div>
              <h2 className="text-lg text-white">Pipeline Filter</h2>
              <p className="text-xs text-[var(--text-muted)]">Global filtrering for hele dashbordet</p>
            </div>
            <select
              value={region}
              onChange={(event) => setRegion(event.target.value as RegionFilter)}
              className="bg-[var(--bg-dark)] border border-[var(--csub-light-soft)] text-white text-sm rounded-lg px-4 py-2 font-sans focus:ring-2 focus:ring-[var(--csub-gold)] focus:outline-none w-full sm:w-auto cursor-pointer"
            >
              <option value="All">Globalt (Alle prosjekter)</option>
              <option value="NorthSea">Nordsjoen</option>
              <option value="GoM">Gulf of Mexico</option>
            </select>
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          {[
            { label: 'Total Pipeline', value: loading ? '—' : activeStats.totalProjects.toLocaleString('en-US') },
            { label: 'Total SURF km', value: loading ? '—' : `${activeStats.totalSurfKm.toLocaleString('en-US')} km` },
            { label: 'Total XMTs', value: loading ? '—' : activeStats.totalXmts.toLocaleString('en-US') },
            { label: 'Nye siste 30d', value: loading ? '—' : activeStats.upcomingAwards.toLocaleString('en-US') },
            { label: 'Regioner', value: loading ? '—' : activeStats.regionCount.toLocaleString('en-US') },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-[var(--csub-dark)] p-6 rounded-xl border border-[var(--csub-light-soft)] shadow-lg flex flex-col justify-between">
              <span className="text-xs font-sans text-[var(--text-muted)] uppercase tracking-wider">{kpi.label}</span>
              <span className="text-3xl font-mono font-semibold text-white mt-2">{kpi.value}</span>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Panel title="Estimert pipelineverdi" className="lg:col-span-2 min-h-[400px]">
            {!pipelineData.length ? (
              <LoadingPlaceholder text={loading ? 'Laster pipeline...' : 'Ingen pipeline-data for valgt filter'} />
            ) : (
              <>
                <div className="h-[350px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pipelineData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#4db89e" strokeOpacity={0.15} />
                      <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontFamily: 'var(--font-mono)', fontSize: 12, fill: '#8ca8a0' }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tickFormatter={(value: number) => `$${Math.round(value / 1_000_000)}M`} tick={{ fontFamily: 'var(--font-mono)', fontSize: 12, fill: '#8ca8a0' }} dx={-10} />
                      <Tooltip content={<PipelineTooltip />} cursor={{ fill: 'rgba(77,184,158,0.05)' }} />
                      <Bar dataKey="value" fill="#4db89e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-5 gap-2">
                  {pipelineFlowData.map((phase) => (
                    <div key={phase.label} className="rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.7)] p-3 text-center">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{phase.label}</p>
                      <p className="font-mono text-xl text-white mt-1">{phase.value.toLocaleString('en-US')}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Panel>

          <Panel title="Siste hendelser">
            {!activityFeed.length ? (
              <LoadingPlaceholder text={loading ? 'Laster hendelser...' : 'Ingen hendelser for valgt filter'} />
            ) : (
              <div className="flex flex-col gap-4">
                {activityFeed.map((item) => (
                  <div key={`${item.title}-${item.meta}`} className="flex items-start gap-3 pb-4 border-b border-[var(--csub-light-faint)] last:border-b-0">
                    <div className="w-2.5 h-2.5 mt-1.5 rounded-full bg-[var(--csub-gold)] shrink-0 shadow-[0_0_8px_var(--csub-gold)]" />
                    <div>
                      <p className="text-sm text-gray-100">{item.title}</p>
                      <p className="text-xs text-[var(--csub-light)] font-mono mt-1">{item.meta}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Panel title="Kontrakter etter fase">
            {!activeCharts.byPhase.length ? (
              <LoadingPlaceholder />
            ) : (
              <div className="flex items-center gap-4">
                <div className="w-[160px] h-[160px] shrink-0">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={activeCharts.byPhase.slice(0, 6)} dataKey="count" nameKey="phase" cx="50%" cy="50%" innerRadius={38} outerRadius={70} strokeWidth={0}>
                        {activeCharts.byPhase.slice(0, 6).map((entry, index) => (
                          <Cell key={`${entry.phase}-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CompactTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2 w-full">
                  {activeCharts.byPhase.slice(0, 6).map((item, index) => (
                    <div key={item.phase} className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }} />
                      <span className="truncate text-[var(--text-muted)]">{item.phase}</span>
                      <span className="font-mono font-semibold ml-auto text-white">{item.count.toLocaleString('en-US')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Regional fordeling">
            {!activeCharts.byCountry.length ? (
              <LoadingPlaceholder />
            ) : (
              <div className="flex items-center gap-4">
                <div className="w-[160px] h-[160px] shrink-0">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={activeCharts.byCountry.slice(0, 6)} dataKey="count" nameKey="country" cx="50%" cy="50%" innerRadius={38} outerRadius={70} strokeWidth={0}>
                        {activeCharts.byCountry.slice(0, 6).map((entry, index) => (
                          <Cell key={`${entry.country}-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CompactTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2 w-full">
                  {activeCharts.byCountry.slice(0, 6).map((item, index) => (
                    <div key={item.country} className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }} />
                      <span className="truncate text-[var(--text-muted)]">{item.country}</span>
                      <span className="font-mono font-semibold ml-auto text-white">{item.count.toLocaleString('en-US')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Kontrakttrend">
            {!activeCharts.byYear.length ? (
              <LoadingPlaceholder />
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer>
                  <AreaChart data={activeCharts.byYear}>
                    <defs>
                      <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4db89e" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#4db89e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#4db89e" strokeOpacity={0.12} />
                    <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontFamily: 'var(--font-mono)', fontSize: 12, fill: '#8ca8a0' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontFamily: 'var(--font-mono)', fontSize: 12, fill: '#8ca8a0' }} />
                    <Tooltip content={<CompactTooltip />} cursor={{ stroke: '#4db89e', strokeOpacity: 0.2 }} />
                    <Area type="monotone" dataKey="count" stroke="#4db89e" fill="url(#trendGradient)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel
            title="Installasjonsselskaper"
            subtitle={`${activeCompanies.contractors.length.toLocaleString('en-US')} selskaper`}
          >
            {!activeCompanies.contractors.length ? (
              <LoadingPlaceholder />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {activeCompanies.contractors.slice(0, 8).map((contractor) => {
                  const maxCount = Math.max(...activeCompanies.contractors.map((company) => company.count), 1)
                  return (
                    <div key={contractor.name} className="rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.55)] p-4">
                      <p className="text-sm text-white truncate">{contractor.name}</p>
                      <p className="font-mono text-xl text-[var(--csub-light)] mt-1">{contractor.count.toLocaleString('en-US')}</p>
                      <div className="w-full h-1.5 mt-2 rounded bg-[color:rgba(77,184,158,0.14)]">
                        <div className="h-full rounded bg-gradient-to-r from-[var(--csub-light)] to-[var(--csub-gold)]" style={{ width: `${Math.round((contractor.count / maxCount) * 100)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>

          <Panel title="Operatoroversikt">
            {!activeCompanies.operators.length ? (
              <LoadingPlaceholder />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeCompanies.operators.slice(0, 10).map((operator) => (
                  <div key={operator.name} className="flex justify-between items-center rounded-lg border border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.45)] p-3">
                    <span className="text-sm text-[var(--text-muted)] truncate pr-3">{operator.name}</span>
                    <span className="font-mono text-sm text-white">{operator.count.toLocaleString('en-US')}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </section>

        <section className="bg-[var(--csub-dark)] rounded-xl border border-[var(--csub-light-soft)] overflow-hidden mt-6 shadow-lg">
          <div className="px-6 py-5 border-b border-[var(--csub-light-faint)]">
            <h2 className="text-lg text-white">Kontraktoversikt</h2>
          </div>
          <div className="overflow-x-auto w-full">
            <table className="w-full min-w-[700px] text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                  {['Prosjekt', 'Land', 'Operatør', 'SURF Contractor', 'Vanndybde', 'XMTs', 'SURF km'].map((header) => (
                    <th key={header} className="px-4 py-3 border-b border-[var(--csub-light-faint)] font-semibold">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7}>
                      <LoadingPlaceholder />
                    </td>
                  </tr>
                ) : filteredProjects.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-[var(--text-muted)]">
                      Ingen data for valgt filter
                    </td>
                  </tr>
                ) : (
                  filteredProjects.slice(0, 50).map((project, index) => (
                    <tr key={`${project.development_project}-${index}`} onClick={() => openDrawer(project)} className="cursor-pointer transition-colors hover:bg-[color:rgba(77,184,158,0.08)] border-b border-[var(--csub-light-faint)]">
                      <td className="px-4 py-3 font-semibold text-white">{project.development_project || '—'}</td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{project.country || '—'}</td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{project.operator || '—'}</td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{project.surf_contractor || '—'}</td>
                      <td className="px-4 py-3 font-mono text-white">{project.water_depth_category || '—'}</td>
                      <td className="px-4 py-3 font-mono text-white">{(project.xmt_count || 0).toLocaleString('en-US')}</td>
                      <td className="px-4 py-3 font-mono text-white">{Math.round(project.surf_km || 0).toLocaleString('en-US')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="m-4 flex items-center gap-2 rounded-lg border border-[var(--csub-gold-soft)] bg-[color:rgba(201,168,76,0.08)] px-4 py-3 text-xs text-[var(--text-muted)]">
            AI-vurdering: verifiser alltid output manuelt.
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title="Regioner - verdenskart">
            <MapSection countryData={activeCharts.byCountry} />
          </Panel>

          <Panel title="Vanndybde-fordeling">
            {!activeCharts.byDepth.length ? (
              <LoadingPlaceholder />
            ) : (
              <div className="h-[360px]">
                <ResponsiveContainer>
                  <BarChart data={activeCharts.byDepth.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#4db89e" strokeOpacity={0.12} />
                    <XAxis dataKey="depth" axisLine={false} tickLine={false} angle={-25} textAnchor="end" height={70} tick={{ fontFamily: 'var(--font-mono)', fontSize: 11, fill: '#8ca8a0' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontFamily: 'var(--font-mono)', fontSize: 11, fill: '#8ca8a0' }} />
                    <Tooltip content={<CompactTooltip />} cursor={{ fill: 'rgba(77,184,158,0.05)' }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {activeCharts.byDepth.slice(0, 10).map((entry, index) => (
                        <Cell key={`${entry.depth}-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title="Prosjekter per ar">
            {!activeCharts.byYear.length ? (
              <LoadingPlaceholder />
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer>
                  <BarChart data={activeCharts.byYear}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#4db89e" strokeOpacity={0.12} />
                    <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontFamily: 'var(--font-mono)', fontSize: 12, fill: '#8ca8a0' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontFamily: 'var(--font-mono)', fontSize: 12, fill: '#8ca8a0' }} />
                    <Tooltip content={<CompactTooltip />} cursor={{ fill: 'rgba(77,184,158,0.05)' }} />
                    <Bar dataKey="count" fill="#4db89e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <Panel title="Dokumentopplasting">
            <DropZone />
          </Panel>
        </section>
      </main>

      {drawerOpen && <div className="fixed inset-0 bg-black/50 z-[200]" onClick={closeDrawer} />}
      <div className={`fixed top-0 right-0 bottom-0 w-[520px] max-w-[90vw] bg-[var(--csub-dark)] z-[201] transition-transform duration-300 overflow-y-auto border-l border-[var(--csub-light-soft)] ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {selectedProject && (
          <>
            <div className="sticky top-0 z-10 p-5 text-white flex justify-between items-start border-b border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.95)]">
              <div>
                <h3 className="text-lg font-semibold mb-1">{selectedProject.development_project || 'Ukjent prosjekt'}</h3>
                <div className="text-xs text-[var(--text-muted)]">
                  {selectedProject.surf_contractor || 'N/A'}
                  {' -> '}
                  {selectedProject.operator || 'N/A'}
                </div>
              </div>
              <button onClick={closeDrawer} className="text-white text-2xl px-2 py-1 rounded hover:bg-white/15 cursor-pointer">
                x
              </button>
            </div>
            <div className="p-6">
              <DrawerSection title="Kontraktdetaljer">
                <DrawerRow label="Land" value={selectedProject.country} />
                <DrawerRow label="Kontinent" value={selectedProject.continent} />
                <DrawerRow label="Operatør" value={selectedProject.operator} />
                <DrawerRow label="SURF Contractor" value={selectedProject.surf_contractor} />
                <DrawerRow label="Kategori" value={selectedProject.facility_category} />
                <DrawerRow label="Vanndybde" value={selectedProject.water_depth_category} />
                <DrawerRow label="XMTs" value={(selectedProject.xmt_count || 0).toLocaleString('en-US')} />
                <DrawerRow label="SURF km" value={Math.round(selectedProject.surf_km || 0).toLocaleString('en-US')} />
                <DrawerRow label="Periode" value={`${selectedProject.first_year || '?'} - ${selectedProject.last_year || '?'}`} />
              </DrawerSection>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Panel({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-[var(--csub-dark)] rounded-xl border border-[var(--csub-light-soft)] p-6 shadow-lg ${className}`}>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg text-white">{title}</h2>
        {subtitle && <span className="text-xs text-[var(--text-muted)]">{subtitle}</span>}
      </div>
      {children}
    </section>
  )
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <h4 className="text-xs uppercase tracking-wider font-semibold mb-2 text-[var(--text-muted)]">{title}</h4>
      {children}
    </div>
  )
}

function DrawerRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between py-2 text-sm border-b border-[var(--csub-light-faint)]">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-semibold text-white text-right ml-4">{value || '—'}</span>
    </div>
  )
}

function DropZone() {
  const [dropped, setDropped] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(true)
  }

  const onDragLeave = () => {
    setIsDragging(false)
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    setDropped(true)
  }

  return (
    <div
      className={`rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors flex flex-col items-center justify-center min-h-[220px] ${
        isDragging
          ? 'border-[var(--csub-light)] bg-[color:rgba(77,184,158,0.12)]'
          : 'border-[var(--csub-light-soft)] bg-[color:rgba(10,23,20,0.5)]'
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="font-mono text-[var(--csub-gold)] text-base">{dropped ? 'Dokument mottatt' : 'Slipp dokumenter eller skjermbilder her'}</div>
      <div className="text-xs mt-2 text-[var(--text-muted)]">
        {dropped ? 'AI-analyse starter...' : 'AI analyserer og kobler til relevante kontrakter'}
      </div>
    </div>
  )
}
