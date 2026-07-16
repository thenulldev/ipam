import { useMemo, useState } from 'react'
import {
  Cable,
  ChevronsRight,
  Database,
  Flame,
  GripVertical,
  Layers,
  Plug,
  Plus,
  Search,
  Server,
  ShieldCheck,
  Square,
  Triangle,
  Zap,
} from 'lucide-react'
import { useDeviceTemplates } from '@/lib/queries'
import { useTenantStore } from '@/store/tenant-store'
import type { DeviceKind, DeviceTemplate } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Props {
  onPick?: (template: DeviceTemplate) => void
  className?: string
}

// PatchDocs-style category → template-kind mapping
const CATEGORIES: Array<{
  label: string
  icon: typeof Server
  kinds: DeviceKind[]
}> = [
  { label: 'Cable Manager', icon: Cable, kinds: ['cable-manager'] },
  { label: 'Firewall', icon: ShieldCheck, kinds: ['firewall'] },
  { label: 'Gateway', icon: Triangle, kinds: ['gateway'] },
  { label: 'Miscellaneous', icon: Layers, kinds: ['kvm', 'console-server', 'blank'] },
  { label: 'Patch Panel', icon: Square, kinds: ['patch-panel'] },
  { label: 'Patchbox', icon: Cable, kinds: ['patchbox-cassette'] },
  { label: 'Rack Tray', icon: Layers, kinds: ['rack-tray'] },
  { label: 'Rack Tray Device', icon: Database, kinds: ['rack-tray'] },
  { label: 'Router', icon: ChevronsRight, kinds: ['router'] },
  { label: 'Server', icon: Server, kinds: ['server'] },
  { label: 'Switch', icon: Plug, kinds: ['switch'] },
  { label: 'UPS', icon: Zap, kinds: ['ups'] },
]

function TemplateIcon({ kind }: { kind: DeviceKind }) {
  switch (kind) {
    case 'switch':
      return <Plug className="size-3.5" />
    case 'router':
      return <ChevronsRight className="size-3.5" />
    case 'firewall':
      return <Flame className="size-3.5" />
    case 'server':
      return <Server className="size-3.5" />
    case 'patch-panel':
      return <Square className="size-3.5" />
    case 'pdu':
      return <Zap className="size-3.5" />
    case 'kvm':
      return <Database className="size-3.5" />
    case 'console-server':
      return <Database className="size-3.5" />
    case 'blank':
      return <Square className="size-3.5" />
    case 'patchbox-cassette':
      return <Cable className="size-3.5" />
    case 'rack-tray':
      return <Layers className="size-3.5" />
    case 'cable-manager':
      return <Cable className="size-3.5" />
    case 'gateway':
      return <Triangle className="size-3.5" />
    case 'ups':
      return <Zap className="size-3.5" />
  }
}

export function DeviceLibrary({ onPick, className }: Props) {
  const tenantId = useTenantStore((s) => s.currentTenantId)
  const templates = useDeviceTemplates(tenantId).data ?? []
  const [search, setSearch] = useState('')

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    const byKind = new Map<DeviceKind, DeviceTemplate[]>()
    for (const t of templates) {
      if (q && !`${t.name} ${t.vendor} ${t.model ?? ''}`.toLowerCase().includes(q)) continue
      const arr = byKind.get(t.kind) ?? []
      arr.push(t)
      byKind.set(t.kind, arr)
    }
    return CATEGORIES.map((cat) => ({
      ...cat,
      items: cat.kinds.flatMap((k) => byKind.get(k) ?? []),
    })).filter((c) => c.items.length > 0)
  }, [templates, search])

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="relative border-b border-slate-200 p-2 dark:border-slate-800">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {grouped.length === 0 ? (
          <p className="p-4 text-center text-xs text-slate-500">
            No matching templates.
          </p>
        ) : (
          grouped.map((cat) => {
            const Icon = cat.icon
            return (
              <div key={cat.label} className="mb-1">
                <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <Icon className="size-3" />
                  {cat.label}
                </div>
                <ul className="space-y-0.5">
                  {cat.items.map((t) => (
                    <li key={t.id}>
                      <button
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            'application/x-template-id',
                            t.id,
                          )
                          e.dataTransfer.effectAllowed = 'copy'
                        }}
                        onClick={() => onPick?.(t)}
                        className="group flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-xs hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                      >
                        <GripVertical className="size-3 shrink-0 text-slate-300 group-hover:text-slate-500" />
                        <TemplateIcon kind={t.kind} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{t.name}</div>
                          <div className="truncate text-[10px] text-slate-500">
                            {t.uHeight}U
                            {t.model ? ` · ${t.model}` : ''}
                          </div>
                        </div>
                        {onPick && (
                          <Plus className="size-3 shrink-0 opacity-0 group-hover:opacity-100" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}