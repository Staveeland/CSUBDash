'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { CompanyData } from '@/lib/data'

export default function CompaniesGrid({ companies }: { companies: CompanyData }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeContractor = searchParams.get('contractor') || ''
  const activeOperator = searchParams.get('operator') || ''

  function toggleParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (params.get(key) === value) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    router.push(`/?${params.toString()}`)
  }

  return (
    <>
      <section>
        <h2 className="text-lg font-semibold text-slate-200 mb-3">Installasjonsselskaper (SURF-kontraktører)</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {companies.contractors.slice(0, 12).map((c, i) => (
            <button
              key={i}
              onClick={() => toggleParam('contractor', c.name)}
              className={`bg-slate-800/80 rounded-lg p-4 border-l-4 border-green-600 text-left hover:bg-slate-700/80 transition ${
                activeContractor === c.name ? 'ring-1 ring-green-500' : ''
              }`}
            >
              <div className="text-sm font-medium text-slate-200 truncate">{c.name}</div>
              <div className="text-xs text-slate-400 mt-1">{c.projectCount} prosjekter</div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-200 mb-3">Operatørselskaper</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {companies.operators.slice(0, 12).map((c, i) => (
            <button
              key={i}
              onClick={() => toggleParam('operator', c.name)}
              className={`bg-slate-800/80 rounded-lg p-3 border-l-4 border-green-300 text-left hover:bg-slate-700/80 transition ${
                activeOperator === c.name ? 'ring-1 ring-green-400' : ''
              }`}
            >
              <div className="text-sm font-medium text-slate-200 truncate">{c.name}</div>
              <div className="text-xs text-slate-400 mt-1">{c.projectCount} prosjekter</div>
            </button>
          ))}
        </div>
      </section>
    </>
  )
}
