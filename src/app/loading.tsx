export default function Loading() {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar skeleton */}
      <aside className="w-56 bg-slate-900 border-r border-slate-800 shrink-0">
        <div className="p-4">
          <div className="h-6 w-16 bg-slate-800 rounded animate-pulse mb-1" />
          <div className="h-3 w-24 bg-slate-800 rounded animate-pulse mb-6" />
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 bg-slate-800 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header skeleton */}
        <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-4 shrink-0">
          <div className="h-6 w-6 bg-slate-800 rounded animate-pulse" />
          <div className="h-4 w-48 bg-slate-800 rounded animate-pulse" />
          <div className="flex-1" />
          <div className="h-8 w-72 bg-slate-800 rounded-lg animate-pulse" />
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
                <div className="h-3 w-24 bg-slate-700 rounded animate-pulse mb-3" />
                <div className="h-7 w-16 bg-slate-700 rounded animate-pulse" />
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50 h-[250px] animate-pulse" />
            ))}
          </div>

          {/* Companies */}
          <div className="h-4 w-48 bg-slate-700 rounded animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-slate-800/80 rounded-lg p-4 border-l-4 border-slate-700 animate-pulse h-16" />
            ))}
          </div>

          {/* Table */}
          <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 h-96 animate-pulse" />
        </main>
      </div>
    </div>
  )
}
