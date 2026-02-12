export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6 space-y-6">
      <div className="h-14 bg-slate-900 border border-slate-800 rounded-lg animate-pulse" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-slate-800/80 border border-slate-700/50 rounded-xl animate-pulse" />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-64 bg-slate-800/80 border border-slate-700/50 rounded-xl animate-pulse" />
        ))}
      </div>

      <div className="h-72 bg-slate-800/80 border border-slate-700/50 rounded-xl animate-pulse" />
      <div className="h-96 bg-slate-800/80 border border-slate-700/50 rounded-xl animate-pulse" />
    </div>
  )
}
