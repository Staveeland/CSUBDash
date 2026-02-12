'use client'

type ErrorPageProps = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-6">
      <div className="max-w-xl w-full bg-slate-900 border border-slate-700 rounded-xl p-6 space-y-4">
        <h1 className="text-lg font-semibold">Kunne ikke laste dashboard</h1>
        <p className="text-sm text-slate-400">
          Noe gikk galt ved henting av data. Prøv igjen, eller kontakt administrator hvis feilen vedvarer.
        </p>
        <div className="text-xs text-slate-500 bg-slate-950/70 border border-slate-800 rounded-md p-3 break-all">
          {error.message}
        </div>
        <button
          onClick={reset}
          className="px-3 py-1.5 rounded-md border border-slate-600 text-sm text-slate-200 hover:bg-slate-800"
        >
          Prøv igjen
        </button>
      </div>
    </div>
  )
}
