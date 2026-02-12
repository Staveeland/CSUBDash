'use client'

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import { useState } from 'react'
import type { UpcomingAward } from '@/lib/data'

const columnHelper = createColumnHelper<UpcomingAward>()

const columns = [
  columnHelper.accessor('year', {
    header: 'År',
    cell: info => <span className="text-slate-300">{info.getValue()}</span>,
    size: 60,
  }),
  columnHelper.accessor('country', {
    header: 'Land',
    cell: info => <span className="text-slate-300">{info.getValue() ?? ''}</span>,
    size: 100,
  }),
  columnHelper.accessor('development_project', {
    header: 'Prosjekt',
    cell: info => <span className="text-slate-200">{info.getValue()}</span>,
    size: 200,
    enablePinning: true,
  }),
  columnHelper.accessor('operator', {
    header: 'Operatør',
    cell: info => <span className="text-slate-300">{info.getValue() ?? ''}</span>,
    size: 150,
    enablePinning: true,
  }),
  columnHelper.accessor('surf_contractor', {
    header: 'Kontraktør',
    cell: info => <span className="text-slate-300">{info.getValue() ?? ''}</span>,
    size: 150,
  }),
  columnHelper.accessor('water_depth_category', {
    header: 'Vanndybde',
    cell: info => <span className="text-slate-300">{info.getValue() ?? ''}</span>,
    size: 100,
  }),
]

interface Props {
  awards: UpcomingAward[]
  onWatch?: (awardId: string) => void
  watchedIds?: Set<string>
}

export default function ContractsTable({ awards, onWatch, watchedIds }: Props) {
  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data: awards,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: 'onChange',
  })

  if (awards.length === 0) return null

  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-200 mb-3">Upcoming Awards</h2>
      <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="border-b border-slate-700 text-slate-400 text-xs">
                {onWatch && <th className="p-2 w-10"></th>}
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    className="text-left p-3 relative select-none cursor-pointer hover:text-slate-200"
                    style={{ width: header.getSize() }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? ''}
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
            {table.getRowModel().rows.slice(0, 50).map(row => (
              <tr key={row.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                {onWatch && (
                  <td className="p-2">
                    <button
                      onClick={() => onWatch(row.original.id)}
                      className={`text-sm ${watchedIds?.has(row.original.id) ? 'text-yellow-400' : 'text-slate-600 hover:text-yellow-400'}`}
                    >
                      {watchedIds?.has(row.original.id) ? '★' : '☆'}
                    </button>
                  </td>
                )}
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="p-3" style={{ width: cell.column.getSize() }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
