'use client'

import { useMemo, useState, useCallback } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table'
import type { ProjectRow } from '@/lib/data'

const columnHelper = createColumnHelper<ProjectRow>()

const columns = [
  columnHelper.accessor('development_project', {
    header: 'Prosjekt',
    cell: info => <span className="text-slate-200 truncate block max-w-[200px]">{info.getValue()}</span>,
    size: 220,
    enablePinning: true,
  }),
  columnHelper.accessor('operator', {
    header: 'Operatør',
    cell: info => info.getValue() ?? '',
    size: 150,
    enablePinning: true,
  }),
  columnHelper.accessor('country', {
    header: 'Land',
    cell: info => info.getValue() ?? '',
    size: 100,
  }),
  columnHelper.accessor('surf_contractor', {
    header: 'Kontraktør',
    cell: info => info.getValue() ?? '',
    size: 150,
  }),
  columnHelper.accessor('water_depth_category', {
    header: 'Vanndybde',
    cell: info => <span className="text-slate-400 text-xs">{info.getValue() ?? ''}</span>,
    size: 100,
  }),
  columnHelper.accessor('xmt_count', {
    header: 'XMTs',
    cell: info => <span className="text-green-400 font-mono">{info.getValue() ?? 0}</span>,
    size: 80,
    meta: { align: 'right' },
  }),
  columnHelper.accessor('surf_km', {
    header: 'SURF km',
    cell: info => <span className="text-blue-400 font-mono">{info.getValue() ?? 0}</span>,
    size: 80,
    meta: { align: 'right' },
  }),
]

interface Props {
  projects: ProjectRow[]
  title?: string
  totalCount?: number
  onWatch?: (projectId: string) => void
  watchedIds?: Set<string>
}

export default function ProjectsTable({ projects, title = 'Prosjekter', totalCount, onWatch, watchedIds }: Props) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  const table = useReactTable({
    data: projects,
    columns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    columnResizeMode: 'onChange',
  })

  const filteredCount = table.getFilteredRowModel().rows.length

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-slate-200">
          {title} {totalCount && filteredCount !== totalCount ? `(${filteredCount} av ${totalCount})` : ''}
        </h2>
        <input
          type="text"
          placeholder="Filtrer i tabell..."
          value={globalFilter}
          onChange={e => setGlobalFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-200 placeholder:text-slate-500 w-48 focus:outline-none focus:border-green-500"
        />
      </div>
      <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-x-auto">
        <table className="w-full text-sm" style={{ width: table.getCenterTotalSize() }}>
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="border-b border-slate-700 text-slate-400 text-xs">
                {onWatch && <th className="p-2 w-10"></th>}
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    className="text-left p-3 relative select-none"
                    style={{ width: header.getSize() }}
                  >
                    <div
                      className={`flex items-center gap-1 ${header.column.getCanSort() ? 'cursor-pointer hover:text-slate-200' : ''}`}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? ''}
                    </div>
                    <div
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-green-500/50"
                    />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.slice(0, 200).map(row => (
              <tr key={row.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                {onWatch && (
                  <td className="p-2">
                    <button
                      onClick={() => onWatch(row.original.id)}
                      className={`text-sm ${watchedIds?.has(row.original.id) ? 'text-yellow-400' : 'text-slate-600 hover:text-yellow-400'}`}
                      title={watchedIds?.has(row.original.id) ? 'Fjern fra watchlist' : 'Legg til watchlist'}
                    >
                      {watchedIds?.has(row.original.id) ? '★' : '☆'}
                    </button>
                  </td>
                )}
                {row.getVisibleCells().map(cell => (
                  <td
                    key={cell.id}
                    className={`p-3 ${(cell.column.columnDef.meta as Record<string, string>)?.align === 'right' ? 'text-right' : ''}`}
                    style={{ width: cell.column.getSize() }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {table.getFilteredRowModel().rows.length > 200 && (
          <div className="p-3 text-center text-slate-500 text-xs">
            Viser 200 av {table.getFilteredRowModel().rows.length} prosjekter
          </div>
        )}
      </div>
    </section>
  )
}
