'use client'

import { useState, useMemo } from 'react'

interface DashboardData {
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
  upcomingAwards: any[]
  projects: any[]
}

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

function DonutChart({ data, size = 180 }: { data: { name: string; count: number }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.count, 0)
  if (total === 0) return <div className="text-slate-500 text-sm">Ingen data</div>
  const r = size / 2 - 10
  const cx = size / 2, cy = size / 2
  let cumAngle = -Math.PI / 2
  const slices = data.map((d, i) => {
    const angle = (d.count / total) * 2 * Math.PI
    const startX = cx + r * Math.cos(cumAngle)
    const startY = cy + r * Math.sin(cumAngle)
    cumAngle += angle
    const endX = cx + r * Math.cos(cumAngle)
    const endY = cy + r * Math.sin(cumAngle)
    const large = angle > Math.PI ? 1 : 0
    return (
      <path
        key={i}
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
          <div key={i} className="flex items-center gap-2">
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
  const max = Math.max(...data.map(d => d.xmts), 1)
  const barW = Math.max(12, Math.min(30, 500 / data.length - 4))

  return (
    <div className="flex items-end gap-1 h-[160px] overflow-x-auto pb-6 relative">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center shrink-0" style={{ width: barW }}>
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

export default function Dashboard({ data }: { data: DashboardData }) {
  const [search, setSearch] = useState('')
  const [filterContractor, setFilterContractor] = useState('')
  const [filterOperator, setFilterOperator] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const filteredProjects = useMemo(() => {
    return data.projects.filter(p => {
      if (filterContractor && p.surf_contractor !== filterContractor) return false
      if (filterOperator && p.operator !== filterOperator) return false
      if (search) {
        const s = search.toLowerCase()
        return (
          (p.development_project || '').toLowerCase().includes(s) ||
          (p.operator || '').toLowerCase().includes(s) ||
          (p.country || '').toLowerCase().includes(s) ||
          (p.surf_contractor || '').toLowerCase().includes(s)
        )
      }
      return true
    })
  }, [data.projects, search, filterContractor, filterOperator])

  const clearFilters = () => { setFilterContractor(''); setFilterOperator(''); setSearch('') }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-56' : 'w-0'} bg-slate-900 border-r border-slate-800 transition-all duration-200 overflow-hidden shrink-0`}>
        <div className="p-4">
          <div className="text-green-500 font-bold text-lg mb-1">CSUB</div>
          <div className="text-slate-500 text-xs mb-6">Sales Intelligence</div>
          <nav className="space-y-1">
            {NAV.map(n => (
              <a
                key={n.label}
                href="#"
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                  n.active ? 'bg-slate-800 text-green-400' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-300'
                }`}
              >
                <span>{n.icon}</span>
                {n.label}
              </a>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-4 shrink-0">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-slate-400 hover:text-slate-200">☰</button>
          <h1 className="text-sm font-semibold text-slate-200">CSUB Sales Intelligence Platform</h1>
          <div className="flex-1" />
          <input
            type="text"
            placeholder="Søk prosjekter, selskaper..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 w-72 focus:outline-none focus:border-green-500"
          />
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Active filters */}
          {(filterContractor || filterOperator) && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-400">Filter:</span>
              {filterContractor && (
                <span className="bg-green-600/20 text-green-400 px-2 py-0.5 rounded text-xs">
                  Kontraktør: {filterContractor}
                </span>
              )}
              {filterOperator && (
                <span className="bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded text-xs">
                  Operatør: {filterOperator}
                </span>
              )}
              <button onClick={clearFilters} className="text-slate-500 hover:text-slate-300 text-xs ml-2">✕ Fjern filter</button>
            </div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Totalt antall prosjekter', value: data.kpis.totalProjects.toLocaleString(), color: 'green' },
              { label: 'Upcoming Awards', value: data.kpis.upcomingCount.toLocaleString(), color: 'blue' },
              { label: 'Total XMTs', value: data.kpis.totalXmts.toLocaleString(), color: 'amber' },
              { label: 'Total SURF km', value: data.kpis.totalSurfKm.toLocaleString(), color: 'purple' },
            ].map((kpi, i) => (
              <div key={i} className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
                <div className="text-slate-400 text-xs mb-2">{kpi.label}</div>
                <div className={`text-2xl font-bold text-${kpi.color}-400`}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Fasefordeling</h3>
              <DonutChart data={data.charts.facilityDistribution} />
            </div>
            <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Årlig trend (XMTs)</h3>
              <BarChart data={data.charts.yearlyTrend} />
            </div>
            <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Regional fordeling</h3>
              <DonutChart data={data.charts.continentDistribution} />
            </div>
          </div>

          {/* Installasjonsselskaper */}
          <section>
            <h2 className="text-lg font-semibold text-slate-200 mb-3">Installasjonsselskaper (SURF-kontraktører)</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {data.companies.contractors.slice(0, 12).map((c, i) => (
                <button
                  key={i}
                  onClick={() => setFilterContractor(filterContractor === c.name ? '' : c.name)}
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

          {/* Operatørselskaper */}
          <section>
            <h2 className="text-lg font-semibold text-slate-200 mb-3">Operatørselskaper</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {data.companies.operators.slice(0, 12).map((c, i) => (
                <button
                  key={i}
                  onClick={() => setFilterOperator(filterOperator === c.name ? '' : c.name)}
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

          {/* Upcoming Awards Table */}
          {data.upcomingAwards.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-slate-200 mb-3">Upcoming Awards</h2>
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
                    {data.upcomingAwards.slice(0, 20).map((a: any, i: number) => (
                      <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="p-3 text-slate-300">{a.year}</td>
                        <td className="p-3 text-slate-300">{a.country}</td>
                        <td className="p-3 text-slate-200">{a.development_project}</td>
                        <td className="p-3 text-slate-300">{a.operator}</td>
                        <td className="p-3 text-slate-300">{a.surf_contractor}</td>
                        <td className="p-3 text-slate-300">{a.water_depth_category}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Projects Table */}
          <section>
            <h2 className="text-lg font-semibold text-slate-200 mb-3">
              Prosjekter {filteredProjects.length !== data.projects.length && `(${filteredProjects.length} av ${data.projects.length})`}
            </h2>
            <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400 text-xs">
                    <th className="text-left p-3">Prosjekt</th>
                    <th className="text-left p-3">Land</th>
                    <th className="text-left p-3">Operatør</th>
                    <th className="text-left p-3">Kontraktør</th>
                    <th className="text-left p-3">Vanndybde</th>
                    <th className="text-right p-3">XMTs</th>
                    <th className="text-right p-3">SURF km</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.slice(0, 100).map((p: any, i: number) => (
                    <tr key={p.id || i} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="p-3 text-slate-200 max-w-[200px] truncate">{p.development_project}</td>
                      <td className="p-3 text-slate-300">{p.country}</td>
                      <td className="p-3 text-slate-300">{p.operator}</td>
                      <td className="p-3 text-slate-300">{p.surf_contractor}</td>
                      <td className="p-3 text-slate-400 text-xs">{p.water_depth_category}</td>
                      <td className="p-3 text-right text-green-400 font-mono">{p.xmt_count ?? 0}</td>
                      <td className="p-3 text-right text-blue-400 font-mono">{p.surf_km ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredProjects.length > 100 && (
                <div className="p-3 text-center text-slate-500 text-xs">
                  Viser 100 av {filteredProjects.length} prosjekter
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
