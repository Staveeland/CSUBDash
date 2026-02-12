'use client'

import { useState, useCallback } from 'react'

interface WatchlistItem {
  id: string
  entity_type: string
  entity_id: string
  notes: string | null
  created_at: string
}

interface Props {
  initialItems: WatchlistItem[]
  userIdentifier: string
}

export default function WatchlistSection({ initialItems, userIdentifier }: Props) {
  const [items, setItems] = useState(initialItems)

  const removeItem = useCallback(async (id: string) => {
    const res = await fetch(`/api/watchlist?id=${id}&user=${userIdentifier}`, { method: 'DELETE' })
    if (res.ok) {
      setItems(prev => prev.filter(i => i.id !== id))
    }
  }, [userIdentifier])

  if (items.length === 0) return null

  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-200 mb-3">⭐ Watchlist</h2>
      <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 p-4">
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="flex items-center justify-between text-sm py-1 border-b border-slate-700/30 last:border-0">
              <div>
                <span className="text-xs text-slate-500 mr-2">{item.entity_type === 'project' ? '📁' : '📄'}</span>
                <span className="text-slate-300">{item.entity_id}</span>
              </div>
              <button
                onClick={() => removeItem(item.id)}
                className="text-slate-500 hover:text-red-400 text-xs"
              >
                Fjern
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
