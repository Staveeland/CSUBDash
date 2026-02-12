'use client'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-950">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold text-slate-200 mb-2">Noe gikk galt</h1>
        <p className="text-slate-400 text-sm mb-6">
          {error.message || 'En uventet feil oppstod. Prøv igjen.'}
        </p>
        <button
          onClick={reset}
          className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition"
        >
          Prøv igjen
        </button>
      </div>
    </div>
  )
}
