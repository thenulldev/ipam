import { Link } from '@tanstack/react-router'
import { Cable, ClipboardList, GitBranch, LayoutDashboard, MapPinned, Network, Server, Wrench } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/ipam', label: 'IPAM', icon: Network },
  { to: '/racks', label: 'Racks', icon: Server },
  { to: '/patches', label: 'Patches', icon: Cable },
  { to: '/floorplan', label: 'Floorplan', icon: MapPinned },
  { to: '/topology', label: 'Topology', icon: GitBranch },
  { to: '/templates', label: 'Templates', icon: ClipboardList },
  { to: '/settings', label: 'Settings', icon: Wrench },
] as const

export function Sidebar() {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-4 dark:border-slate-800">
        <div className="grid size-8 place-items-center rounded-md bg-brand-600 text-white">
          <Network className="size-5" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">IPAM</span>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">
            Racks · Patches
          </span>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {navItems.map((item) => (
          <SidebarLink key={item.to} {...item} />
        ))}
      </nav>
      <div className="border-t border-slate-200 p-3 text-[11px] text-slate-500 dark:border-slate-800">
        v0.1.0 · scaffold
      </div>
    </aside>
  )
}

function SidebarLink({
  to,
  label,
  icon: Icon,
}: (typeof navItems)[number]) {
  return (
    <Link
      to={to}
      className={cn(
        'group flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
        '[&.active]:bg-brand-50 [&.active]:text-brand-700 dark:[&.active]:bg-brand-900/30 dark:[&.active]:text-brand-300',
      )}
      activeProps={{}}
      activeOptions={{ exact: to === '/' }}
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </Link>
  )
}
