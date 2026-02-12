'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export default function ActiveFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const filters = [
    { key: 'contractor', label: 'Kontraktør', color: 'bg-green-600/20 text-green-400' },
    { key: 'operator', label: 'Operatør', color: 'bg-blue-600/20 text-blue-400' },
    { key: 'region', label: 'Region', color: 'bg-purple-600/20 text-purple-400' },
    { key: 'country', label: 'Land', color: 'bg-amber-600/20 text-amber-400' },
    { key: 'search', label: 'Søk', color: 'bg-slate-600/20 text-slate-400' },
  ]

  const activeFilters = filters.filter(f => searchParams.get(f.key))
  if (activeFilters.length === 0) return null

  const clearAll = () => router.push('/')

  const clearOne = (key: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete(key)
    router.push(`/?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2 text-sm flex-wrap">
      <span className="text-slate-400">Filter:</span>
      {activeFilters.map(f => (
        <span key={f.key} className={`${f.color} px-2 py-0.5 rounded text-xs flex items-center gap-1`}>
          {f.label}: {searchParams.get(f.key)}
          <button onClick={() => clearOne(f.key)} className="hover:text-white ml-1">✕</button>
        </span>
      ))}
      <button onClick={clearAll} className="text-slate-500 hover:text-slate-300 text-xs ml-2">✕ Fjern alle</button>
    </div>
  )
}
