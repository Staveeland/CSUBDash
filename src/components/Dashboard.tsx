'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  BarChart, Bar,
} from 'recharts'

// Dynamic import for Leaflet (no SSR)
const MapSection = dynamic(() => import('./MapSection'), { ssr: false })

// ── Types ──────────────────────────────────────────
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

// ── Colors ─────────────────────────────────────────
const GREENS = ['#0e2620','#1a3c34','#245a4e','#2d7368','#38917f','#4db89e','#7dd4bf','#b5e8d9']
const DONUT_COLORS = ['#1a3c34','#38917f','#7dd4bf','#c9a84c','#e8d48b','#b5e8d9','#245a4e','#2d7368']

// ── Helpers ────────────────────────────────────────
function LoadingPlaceholder({ text = 'Laster...' }: { text?: string }) {
  return <div className="text-center py-5 text-[var(--text-secondary)] text-sm" style={{ animation: 'pulse-loading 1.5s ease-in-out infinite' }}>{text}</div>
}

// ── Main Component ─────────────────────────────────
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

  const fetchData = useCallback(async () => {
    try {
      const [s, c, co, p] = await Promise.all([
        fetch('/api/dashboard/stats').then(r => r.ok ? r.json() : null),
        fetch('/api/dashboard/charts').then(r => r.ok ? r.json() : null),
        fetch('/api/dashboard/companies').then(r => r.ok ? r.json() : null),
        fetch('/api/dashboard/projects').then(r => r.ok ? r.json() : null),
      ])
      if (s) setStats(s)
      if (c) setCharts(c)
      if (co) setCompanies(co)
      if (Array.isArray(p)) setProjects(p)
    } catch (e) {
      console.error('Failed to load dashboard data:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredProjects = useMemo(() =>
    searchQuery
      ? projects.filter(p => Object.values(p).some(v => String(v).toLowerCase().includes(searchQuery.toLowerCase())))
      : projects,
    [projects, searchQuery]
  )

  const openDrawer = (p: Project) => { setSelectedProject(p); setDrawerOpen(true) }
  const closeDrawer = () => { setDrawerOpen(false); setTimeout(() => setSelectedProject(null), 300) }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* ── HEADER ── */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-8 h-16" style={{ background: 'linear-gradient(135deg, #0e2620, #1a3c34)', boxShadow: '0 2px 12px rgba(0,0,0,.2)' }}>
        <div className="flex items-center gap-5">
          <span className="text-[28px] font-bold tracking-widest" style={{ fontFamily: 'Source Serif 4, serif', color: '#c9a84c' }}>CSUB</span>
          <span className="text-[13px] font-light tracking-wide pl-4" style={{ color: '#7dd4bf', borderLeft: '1px solid #245a4e' }}>Sales Intelligence Platform</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex rounded-full overflow-hidden" style={{ background: '#245a4e' }}>
            <button onClick={() => setLang('no')} className={`px-3.5 py-1 text-xs font-semibold border-none cursor-pointer transition-colors ${lang === 'no' ? 'text-white' : ''}`} style={lang === 'no' ? { background: '#38917f' } : { background: 'transparent', color: '#7dd4bf' }}>NO</button>
            <button onClick={() => setLang('en')} className={`px-3.5 py-1 text-xs font-semibold border-none cursor-pointer transition-colors ${lang === 'en' ? 'text-white' : ''}`} style={lang === 'en' ? { background: '#38917f' } : { background: 'transparent', color: '#7dd4bf' }}>EN</button>
          </div>
          <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full text-[13px] text-white" style={{ background: '#245a4e' }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs" style={{ background: '#c9a84c', color: '#0e2620' }}>HR</div>
            <span>Helge Rasmussen</span>
          </div>
        </div>
      </header>

      {/* ── SEARCH ── */}
      <div className="pt-5 px-8">
        <div className="relative max-w-[800px]">
          <span className="absolute left-[18px] top-1/2 -translate-y-1/2 text-[18px]" style={{ color: '#2d7368' }}>🔍</span>
          <input
            type="text"
            placeholder="Søk i kontrakter, prosjekter, nyheter..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full py-3.5 pl-[52px] pr-20 rounded-full text-[15px] bg-white transition-all"
            style={{ border: '2px solid var(--border)', fontFamily: 'Source Sans 3, sans-serif', boxShadow: 'var(--shadow)' }}
          />
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide" style={{ background: 'linear-gradient(135deg, #2d7368, #4db89e)' }}>✨ AI-søk</span>
        </div>
      </div>

      <main className="px-8 pt-5 pb-10">
        {/* ── KPI CARDS ── */}
        <div className="grid grid-cols-5 gap-4 mb-5 max-[1024px]:grid-cols-3 max-[768px]:grid-cols-1">
          {[
            { label: 'Aktive kontrakter', value: stats?.totalProjects },
            { label: 'Total SURF km', value: stats?.totalSurfKm ? `${stats.totalSurfKm} km` : undefined },
            { label: 'Nye siste 30d', value: stats?.upcomingAwards },
            { label: 'Totale XMTs', value: stats?.totalXmts },
            { label: 'Regioner', value: stats?.regionCount },
          ].map((kpi, i) => (
            <div key={i} className="relative overflow-hidden rounded-xl bg-white transition-all hover:-translate-y-0.5 cursor-default" style={{ boxShadow: 'var(--shadow)', padding: '20px 24px', animation: `fadeInUp .5s ease forwards`, animationDelay: `${i * 0.05}s` }}>
              <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: 'linear-gradient(90deg, #2d7368, #4db89e)' }} />
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5 whitespace-nowrap" style={{ color: 'var(--text-secondary)', letterSpacing: '0.8px' }}>{kpi.label}</div>
              <div className="mono text-[32px] font-medium" style={{ color: '#1a3c34' }}>{loading ? '—' : (kpi.value ?? '—')}</div>
            </div>
          ))}
        </div>

        {/* ── PIPELINE ── */}
        <Card title="Salgspipeline" icon="📊" className="mb-5">
          <div className="flex items-center my-3">
            {['FEED','Bud på bud','Tildeling','CSUB direkte kontakt','CSUB Contract Award'].map((label, i) => (
              <div key={label} className="contents">
                {i > 0 && <div className="w-8 text-center text-lg shrink-0 flex items-center justify-center" style={{ color: '#4db89e' }}>→</div>}
                <div className={`flex-1 text-center transition-colors hover:bg-green-200/40 cursor-default ${i === 0 ? 'rounded-l-lg' : ''} ${i === 4 ? 'rounded-r-lg' : ''}`} style={{ background: i % 2 === 0 ? '#f0faf6' : '#e0f5ef', padding: '16px 12px' }}>
                  <div className="mono text-[28px] font-medium" style={{ color: '#1a3c34' }}>
                    {loading ? '...' : (i === 0 ? filteredProjects.length : '—')}
                  </div>
                  <div className="text-[11px] font-semibold uppercase mt-1" style={{ color: 'var(--text-secondary)', letterSpacing: '0.3px' }}>{label}</div>
                  <div className="h-1 rounded-sm mt-2" style={{ background: '#b5e8d9' }}>
                    <div className="h-full rounded-sm transition-all duration-700" style={{ background: 'linear-gradient(90deg, #2d7368, #4db89e)', width: i === 0 ? '100%' : '0%' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* ── VISUAL OVERVIEW ── */}
        <div className="grid grid-cols-3 gap-5 mb-5 max-[1024px]:grid-cols-2 max-[768px]:grid-cols-1">
          {/* Phase donut */}
          <Card title="Kontrakter etter fase" icon="🎯">
            {!charts ? <LoadingPlaceholder /> : (
              <div className="flex items-center gap-4">
                <div className="w-[140px] h-[140px] shrink-0">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={charts.byPhase.slice(0, 6)} dataKey="count" nameKey="phase" cx="50%" cy="50%" innerRadius={35} outerRadius={60} strokeWidth={0}>
                        {charts.byPhase.slice(0, 6).map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-1.5">
                  {charts.byPhase.slice(0, 6).map((item, i) => (
                    <div key={item.phase} className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="truncate max-w-[100px]">{item.phase}</span>
                      <span className="mono font-semibold ml-auto pl-2">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Regional donut */}
          <Card title="Regional fordeling" icon="🌍">
            {!charts ? <LoadingPlaceholder /> : (
              <div className="flex items-center gap-4">
                <div className="w-[140px] h-[140px] shrink-0">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={charts.byCountry.slice(0, 6)} dataKey="count" nameKey="country" cx="50%" cy="50%" innerRadius={35} outerRadius={60} strokeWidth={0}>
                        {charts.byCountry.slice(0, 6).map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-1.5">
                  {charts.byCountry.slice(0, 6).map((item, i) => (
                    <div key={item.country} className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="truncate max-w-[100px]">{item.country}</span>
                      <span className="mono font-semibold ml-auto pl-2">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Trend chart */}
          <Card title="Kontrakttrend" icon="📈">
            {!charts ? <LoadingPlaceholder /> : (
              <div className="h-[160px]">
                <ResponsiveContainer>
                  <AreaChart data={charts.byYear}>
                    <defs>
                      <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4db89e" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#4db89e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e5e3" />
                    <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#5a6b65' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#5a6b65' }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="count" stroke="#2d7368" fill="url(#trendGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>

        {/* ── COMPANY SECTIONS ── */}
        {/* Installasjonsselskaper */}
        <div className="bg-white rounded-xl mb-5" style={{ boxShadow: 'var(--shadow)', border: '2px solid #b5e8d9', borderTop: '4px solid #2d7368', padding: '24px' }}>
          <div className="flex items-center gap-2.5 mb-4">
            <span className="text-[22px]">🔧</span>
            <h3 className="text-[16px]" style={{ color: '#1a3c34', fontFamily: 'Source Serif 4, serif' }}>Installasjonsselskaper</h3>
            <span className="text-xs italic" style={{ color: 'var(--text-secondary)' }}>— CSUB sine kunder</span>
            <span className="ml-auto text-[10px] px-2.5 py-0.5 rounded-xl font-semibold uppercase tracking-wide" style={{ background: '#e0f5ef', color: '#245a4e' }}>
              {companies?.contractors?.length || 0} selskaper
            </span>
          </div>
          {!companies ? <LoadingPlaceholder /> : (
            <div className="grid grid-cols-4 gap-3 max-[1024px]:grid-cols-2 max-[768px]:grid-cols-1">
              {companies.contractors.slice(0, 8).map(c => {
                const maxCount = Math.max(...companies.contractors.map(x => x.count), 1)
                return (
                  <div key={c.name} className="rounded-lg flex flex-col items-center text-center transition-all hover:-translate-y-0.5 cursor-default" style={{ background: 'linear-gradient(135deg, #f0faf6, #fff)', border: '2px solid #b5e8d9', boxShadow: 'var(--shadow)', padding: '16px' }}>
                    <div className="text-sm font-bold" style={{ color: '#1a3c34' }}>{c.name}</div>
                    <div className="mono text-[22px] font-semibold" style={{ color: '#245a4e' }}>{c.count}</div>
                    <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>kontrakter</div>
                    <div className="w-full h-1 rounded-sm mt-2" style={{ background: '#e0f5ef' }}>
                      <div className="h-full rounded-sm" style={{ background: 'linear-gradient(90deg, #2d7368, #4db89e)', width: `${(c.count / maxCount * 100).toFixed(0)}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* FEED + Operators row */}
        <div className="grid grid-cols-2 gap-5 mb-5 max-[768px]:grid-cols-1">
          <div className="bg-white rounded-xl" style={{ boxShadow: 'var(--shadow)', padding: '24px' }}>
            <div className="flex items-center gap-2.5 mb-4">
              <span className="text-[18px]">📐</span>
              <h3 className="text-[15px]" style={{ color: '#1a3c34', fontFamily: 'Source Serif 4, serif' }}>FEED-selskaper</h3>
              <span className="text-xs italic" style={{ color: 'var(--text-secondary)' }}>— fremtidige kunder</span>
            </div>
            {!companies ? <LoadingPlaceholder /> : (
              <div className="grid grid-cols-2 gap-3 max-[768px]:grid-cols-1">
                {companies.contractors.slice(0, 4).map(c => (
                  <div key={c.name} className="rounded-lg flex flex-col items-center text-center transition-all hover:-translate-y-0.5 bg-white cursor-default" style={{ border: '1.5px solid var(--border)', padding: '12px' }}>
                    <div className="text-[13px] font-semibold" style={{ color: '#245a4e' }}>{c.name}</div>
                    <div className="mono text-[18px] font-semibold" style={{ color: '#2d7368' }}>{c.count}</div>
                    <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>kontrakter</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl" style={{ background: '#f0faf6', boxShadow: 'var(--shadow)', padding: '24px' }}>
            <div className="flex items-center gap-2.5 mb-4">
              <span className="text-[16px]">🏭</span>
              <h3 className="text-[14px]" style={{ color: 'var(--text-secondary)', fontFamily: 'Source Serif 4, serif' }}>Operatørselskaper</h3>
              <span className="text-xs italic" style={{ color: 'var(--text-secondary)' }}>— bakgrunnsinformasjon</span>
            </div>
            {!companies ? <LoadingPlaceholder /> : (
              <div className="grid grid-cols-3 gap-3 max-[768px]:grid-cols-1">
                {companies.operators.slice(0, 9).map(o => (
                  <div key={o.name} className="rounded-lg flex justify-between items-center cursor-default" style={{ background: '#f0faf6', border: '1px solid var(--border)', padding: '10px 12px' }}>
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{o.name}</span>
                    <span className="mono text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{o.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── PROJECT TABLE ── */}
        <Card title="Kontraktoversikt" icon="📋" className="mb-5">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {['Prosjekt','Land','Operatør','SURF Contractor','Vanndybde','XMTs','SURF km'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 text-[11px] uppercase tracking-wider font-bold whitespace-nowrap cursor-pointer hover:text-green-700" style={{ color: 'var(--text-secondary)', borderBottom: '2px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7}><LoadingPlaceholder /></td></tr>
                ) : filteredProjects.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-6" style={{ color: 'var(--text-secondary)' }}>Ingen data</td></tr>
                ) : (
                  filteredProjects.slice(0, 50).map((p, i) => (
                    <tr key={i} onClick={() => openDrawer(p)} className="cursor-pointer transition-colors hover:bg-green-50/60" style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-3 py-2.5 font-semibold">{p.development_project || '—'}</td>
                      <td className="px-3 py-2.5">{p.country || '—'}</td>
                      <td className="px-3 py-2.5">{p.operator || '—'}</td>
                      <td className="px-3 py-2.5">{p.surf_contractor || '—'}</td>
                      <td className="px-3 py-2.5 mono">{p.water_depth_category || '—'}</td>
                      <td className="px-3 py-2.5 mono">{p.xmt_count || 0}</td>
                      <td className="px-3 py-2.5 mono">{p.surf_km ? Math.round(p.surf_km) : 0}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 mt-3 px-4 py-2.5 rounded-lg text-xs" style={{ background: '#f0faf6', borderLeft: '3px solid #c9a84c', color: 'var(--text-secondary)' }}>
            <span>🤖</span> AI-vurdering, verifiser selv — relevansscorer er beregnet av maskinlæring og kan inneholde feil.
          </div>
        </Card>

        {/* ── MAP + DEPTH ── */}
        <div className="grid grid-cols-2 gap-5 mb-5 max-[768px]:grid-cols-1">
          <Card title="Regioner — verdenskart" icon="🌍">
            <MapSection countryData={charts?.byCountry || []} />
          </Card>

          <Card title="Vanndybde-fordeling" icon="🌊">
            {!charts ? <LoadingPlaceholder /> : (
              <div className="h-[200px]">
                <ResponsiveContainer>
                  <BarChart data={charts.byDepth.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e5e3" />
                    <XAxis dataKey="depth" tick={{ fontSize: 9, fill: '#5a6b65' }} angle={-45} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 10, fill: '#5a6b65' }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[4,4,0,0]}>
                      {charts.byDepth.slice(0, 10).map((_, i) => <Cell key={i} fill={GREENS[i % GREENS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>

        {/* ── YEAR CHART + DOCUMENT UPLOAD ── */}
        <div className="grid grid-cols-2 gap-5 mb-5 max-[768px]:grid-cols-1">
          <Card title="Prosjekter per år" icon="📅">
            {!charts ? <LoadingPlaceholder /> : (
              <div className="h-[200px]">
                <ResponsiveContainer>
                  <BarChart data={charts.byYear}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e5e3" />
                    <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#5a6b65' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#5a6b65' }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#2d7368" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card title="Dokumentopplasting" icon="📄">
            <DropZone />
          </Card>
        </div>

      </main>

      {/* ── DRAWER ── */}
      {drawerOpen && <div className="fixed inset-0 bg-black/40 z-[200] transition-opacity" onClick={closeDrawer} />}
      <div className={`fixed top-0 right-0 bottom-0 w-[520px] max-w-[90vw] bg-white z-[201] transition-transform duration-300 overflow-y-auto ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`} style={{ boxShadow: '-8px 0 32px rgba(0,0,0,.15)' }}>
        {selectedProject && (
          <>
            <div className="sticky top-0 z-10 p-5 text-white flex justify-between items-start" style={{ background: 'linear-gradient(135deg, #0e2620, #1a3c34)' }}>
              <div>
                <h3 className="text-lg font-semibold mb-1">{selectedProject.development_project}</h3>
                <div className="text-xs opacity-70">{selectedProject.surf_contractor} → {selectedProject.operator}</div>
              </div>
              <button onClick={closeDrawer} className="text-white text-2xl px-2 py-1 rounded hover:bg-white/15 cursor-pointer border-none bg-transparent">×</button>
            </div>
            <div className="p-6">
              <DrawerSection title="Kontraktdetaljer">
                <DrawerRow label="Land" value={selectedProject.country} />
                <DrawerRow label="Kontinent" value={selectedProject.continent} />
                <DrawerRow label="Operatør" value={selectedProject.operator} />
                <DrawerRow label="SURF Contractor" value={selectedProject.surf_contractor} />
                <DrawerRow label="Kategori" value={selectedProject.facility_category} />
                <DrawerRow label="Vanndybde" value={selectedProject.water_depth_category} />
                <DrawerRow label="XMTs" value={String(selectedProject.xmt_count || 0)} />
                <DrawerRow label="SURF km" value={String(selectedProject.surf_km ? Math.round(selectedProject.surf_km) : 0)} />
                <DrawerRow label="Periode" value={`${selectedProject.first_year || '?'} – ${selectedProject.last_year || '?'}`} />
              </DrawerSection>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────
function Card({ title, icon, children, className = '' }: { title: string; icon?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl transition-shadow hover:shadow-lg ${className}`} style={{ boxShadow: 'var(--shadow)', padding: '24px' }}>
      {title && (
        <div className="flex items-center justify-between mb-4 text-[13px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)', letterSpacing: '1px' }}>
          {title} {icon && <span className="text-[16px]">{icon}</span>}
        </div>
      )}
      {children}
    </div>
  )
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h4 className="text-[13px] uppercase tracking-wider font-bold mb-2.5" style={{ color: 'var(--text-secondary)', fontFamily: 'Source Sans 3, sans-serif' }}>{title}</h4>
      {children}
    </div>
  )
}

function DrawerRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between py-1.5 text-[13px]" style={{ borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span className="font-semibold">{value || '—'}</span>
    </div>
  )
}

function DropZone() {
  const [dropped, setDropped] = useState(false)

  return (
    <div
      className="rounded-xl p-10 text-center cursor-pointer transition-colors flex flex-col items-center justify-center"
      style={{ border: '2px dashed #7dd4bf', background: '#f0faf6', color: 'var(--text-secondary)', minHeight: '160px' }}
      onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = '#38917f'; (e.currentTarget as HTMLElement).style.background = '#e0f5ef' }}
      onDragLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#7dd4bf'; (e.currentTarget as HTMLElement).style.background = '#f0faf6' }}
      onDrop={e => { e.preventDefault(); setDropped(true) }}
    >
      <div className="text-[40px] mb-2">{dropped ? '✅' : '📎'}</div>
      <div className="text-sm font-semibold">{dropped ? 'Dokument mottatt!' : 'Slipp dokumenter eller skjermbilder her'}</div>
      <div className="text-xs mt-1">{dropped ? 'AI-analyse starter...' : 'AI analyserer og kobler til relevante kontrakter'}</div>
    </div>
  )
}
