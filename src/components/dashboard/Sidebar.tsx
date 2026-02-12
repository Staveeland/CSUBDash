import Link from 'next/link'

const NAV = [
  { label: 'Dashboard', icon: '📊', href: '/', active: true },
  { label: 'Kontrakter', icon: '📄', href: '/' },
  { label: 'Selskaper', icon: '🏢', href: '/' },
  { label: 'Import', icon: '📥', href: '/admin/import' },
  { label: 'Innstillinger', icon: '⚙️', href: '/' },
]

export default function Sidebar({ open }: { open: boolean }) {
  return (
    <aside className={`${open ? 'w-56' : 'w-0'} bg-slate-900 border-r border-slate-800 transition-all duration-200 overflow-hidden shrink-0`}>
      <div className="p-4">
        <div className="text-green-500 font-bold text-lg mb-1">CSUB</div>
        <div className="text-slate-500 text-xs mb-6">Sales Intelligence</div>
        <nav className="space-y-1">
          {NAV.map(n => (
            <Link
              key={n.label}
              href={n.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                n.active ? 'bg-slate-800 text-green-400' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-300'
              }`}
            >
              <span>{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </aside>
  )
}
