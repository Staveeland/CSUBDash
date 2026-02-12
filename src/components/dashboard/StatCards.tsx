import type { KPIs } from '@/lib/data'

export default function StatCards({ kpis }: { kpis: KPIs }) {
  const cards = [
    { label: 'Totalt antall prosjekter', value: kpis.totalProjects.toLocaleString(), color: 'text-green-400' },
    { label: 'Upcoming Awards', value: kpis.upcomingCount.toLocaleString(), color: 'text-blue-400' },
    { label: 'Total XMTs', value: kpis.totalXmts.toLocaleString(), color: 'text-amber-400' },
    { label: 'Total SURF km', value: kpis.totalSurfKm.toLocaleString(), color: 'text-purple-400' },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((kpi, i) => (
        <div key={i} className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
          <div className="text-slate-400 text-xs mb-2">{kpi.label}</div>
          <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
        </div>
      ))}
    </div>
  )
}
