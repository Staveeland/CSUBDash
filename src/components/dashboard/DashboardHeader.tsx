'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useRef } from 'react'
import type { ProjectRow, UpcomingAward } from '@/lib/data'

interface Props {
  sidebarOpen: boolean
  onToggleSidebar: () => void
  projects: ProjectRow[]
  awards: UpcomingAward[]
}

export default function DashboardHeader({ sidebarOpen, onToggleSidebar, projects, awards }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const search = searchParams.get('search') || ''

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearch = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set('search', value)
      } else {
        params.delete('search')
      }
      router.push(`/?${params.toString()}`)
    }, 300)
  }, [router, searchParams])

  const exportData = useCallback(async (format: 'csv' | 'xlsx') => {
    const headers = ['Prosjekt', 'Land', 'Operatør', 'Kontraktør', 'Vanndybde', 'XMTs', 'SURF km']
    const rows = projects.map(p => [
      p.development_project,
      p.country ?? '',
      p.operator ?? '',
      p.surf_contractor ?? '',
      p.water_depth_category ?? '',
      String(p.xmt_count ?? 0),
      String(p.surf_km ?? 0),
    ])

    if (format === 'csv') {
      const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n')
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
      downloadBlob(blob, 'csub-export.csv')
    } else {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      const wsProjects = XLSX.utils.aoa_to_sheet([headers, ...rows])
      XLSX.utils.book_append_sheet(wb, wsProjects, 'Projects')

      if (awards.length > 0) {
        const aHeaders = ['År', 'Land', 'Prosjekt', 'Operatør', 'Kontraktør', 'Vanndybde', 'XMTs Awarded']
        const aRows = awards.map(a => [
          a.year ?? '',
          a.country ?? '',
          a.development_project ?? '',
          a.operator ?? '',
          a.surf_contractor ?? '',
          a.water_depth_category ?? '',
          a.xmts_awarded ?? 0,
        ])
        const wsAwards = XLSX.utils.aoa_to_sheet([aHeaders, ...aRows])
        XLSX.utils.book_append_sheet(wb, wsAwards, 'Upcoming Awards')
      }

      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      downloadBlob(new Blob([buf]), 'csub-export.xlsx')
    }
  }, [projects, awards])

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-4 shrink-0">
      <button onClick={onToggleSidebar} className="text-slate-400 hover:text-slate-200">☰</button>
      <h1 className="text-sm font-semibold text-slate-200">CSUB Sales Intelligence Platform</h1>
      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <button
          onClick={() => exportData('csv')}
          className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded"
          title="Eksporter CSV"
        >
          📄 CSV
        </button>
        <button
          onClick={() => exportData('xlsx')}
          className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded"
          title="Eksporter Excel"
        >
          📊 Excel
        </button>
      </div>

      <input
        type="text"
        placeholder="Søk prosjekter, selskaper..."
        defaultValue={search}
        onChange={e => handleSearch(e.target.value)}
        className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 w-72 focus:outline-none focus:border-green-500"
      />
    </header>
  )
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
