import type { ChartData } from '@/lib/data'

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

export default function MarketCharts({ charts }: { charts: ChartData }) {
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
