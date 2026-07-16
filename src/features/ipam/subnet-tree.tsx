import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { IpAddress, Prefix, PrefixRole, Vrf } from '@/lib/types'
import { cn } from '@/lib/utils'

const roleColor: Record<PrefixRole, string> = {
  lan: 'bg-emerald-50 border-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-800',
  wan: 'bg-rose-50 border-rose-300 dark:bg-rose-950/30 dark:border-rose-800',
  mgmt: 'bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-800',
  transit: 'bg-purple-50 border-purple-300 dark:bg-purple-950/30 dark:border-purple-800',
  loopback: 'bg-sky-50 border-sky-300 dark:bg-sky-950/30 dark:border-sky-800',
  p2p: 'bg-indigo-50 border-indigo-300 dark:bg-indigo-950/30 dark:border-indigo-800',
  reserved: 'bg-slate-50 border-slate-300 dark:bg-slate-800/40 dark:border-slate-700',
  'dhcp-pool': 'bg-pink-50 border-pink-300 dark:bg-pink-950/30 dark:border-pink-800',
  infra: 'bg-teal-50 border-teal-300 dark:bg-teal-950/30 dark:border-teal-800',
}

const roleBadge: Record<PrefixRole, string> = {
  lan: 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-200',
  wan: 'bg-rose-200 text-rose-900 dark:bg-rose-900/60 dark:text-rose-200',
  mgmt: 'bg-amber-200 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200',
  transit: 'bg-purple-200 text-purple-900 dark:bg-purple-900/60 dark:text-purple-200',
  loopback: 'bg-sky-200 text-sky-900 dark:bg-sky-900/60 dark:text-sky-200',
  p2p: 'bg-indigo-200 text-indigo-900 dark:bg-indigo-900/60 dark:text-indigo-200',
  reserved: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  'dhcp-pool': 'bg-pink-200 text-pink-900 dark:bg-pink-900/60 dark:text-pink-200',
  infra: 'bg-teal-200 text-teal-900 dark:bg-teal-900/60 dark:text-teal-200',
}

interface Props {
  prefixes: Prefix[]
  addresses: IpAddress[]
  vrfs: Vrf[]
  selected: Prefix['id'] | null
  onSelect: (id: Prefix['id']) => void
}

export function SubnetTree({ prefixes, addresses, vrfs, selected, onSelect }: Props) {
  const vrfById = new Map(vrfs.map((v) => [v.id, v]))

  // Group prefixes by VRF (null VRF = global/default)
  const byVrf = new Map<string | null, Prefix[]>()
  for (const p of prefixes) {
    const k = (p.vrfId as string | undefined) ?? null
    const arr = byVrf.get(k) ?? []
    arr.push(p)
    byVrf.set(k, arr)
  }

  const vrfKeys = Array.from(byVrf.keys())

  return (
    <div className="space-y-4">
      {vrfKeys.map((k) => {
        const vrf = k ? vrfById.get(k as any) : null
        const pfxs = byVrf.get(k) ?? []
        return (
          <div key={k ?? 'global'}>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                VRF
              </span>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                {vrf?.name ?? 'default'}
              </span>
            </div>
            <ul className="space-y-1">
              {pfxs
                .filter((p) => !p.parentId)
                .map((p) => (
                  <SubnetNode
                    key={p.id}
                    prefix={p}
                    all={pfxs}
                    addresses={addresses}
                    selected={selected}
                    onSelect={onSelect}
                    depth={0}
                  />
                ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

function SubnetNode({
  prefix,
  all,
  addresses,
  selected,
  onSelect,
  depth,
}: {
  prefix: Prefix
  all: Prefix[]
  addresses: IpAddress[]
  selected: Prefix['id'] | null
  onSelect: (id: Prefix['id']) => void
  depth: number
}) {
  const [open, setOpen] = useState(true)
  const children = all.filter((p) => p.parentId === prefix.id)
  const hasChildren = children.length > 0
  const isActive = selected === prefix.id
  const addrs = addresses.filter((a) => a.prefixId === prefix.id)
  const assigned = addrs.filter((a) => a.status === 'assigned').length
  const total = addrs.length || parseTotalFromCidr(prefix.cidr)
  const pct = total > 0 ? Math.min(100, Math.round((assigned / total) * 100)) : 0

  return (
    <li>
      <div
        className={cn(
          'group rounded-md border bg-white dark:bg-slate-900',
          roleColor[prefix.role],
          isActive && 'ring-2 ring-brand-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-950',
        )}
      >
        <button
          onClick={() => onSelect(prefix.id)}
          className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
        >
          {hasChildren && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation()
                setOpen((v) => !v)
              }}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
            >
              {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            </span>
          )}
          {!hasChildren && <span className="w-4" />}
          <span className="font-mono text-sm font-semibold">{prefix.cidr}</span>
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase',
              roleBadge[prefix.role],
            )}
          >
            {prefix.role}
          </span>
          {prefix.description && (
            <span className="ml-2 truncate text-xs text-slate-500">
              {prefix.description}
            </span>
          )}
          <span className="ml-auto flex items-center gap-2 font-mono text-[10px] text-slate-500">
            {assigned}/{total}
            <span className="block h-1 w-12 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <span
                className={cn(
                  'block h-full',
                  pct > 80 ? 'bg-rose-500' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500',
                )}
                style={{ width: `${pct}%` }}
              />
            </span>
          </span>
        </button>
      </div>
      {hasChildren && open && (
        <ul className="mt-1 space-y-1" style={{ paddingLeft: 16 + depth * 8 }}>
          {children.map((c) => (
            <SubnetNode
              key={c.id}
              prefix={c}
              all={all}
              addresses={addresses}
              selected={selected}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

// Helper for total addresses from a CIDR (best-effort for IPv4).
function parseTotalFromCidr(cidr: string): number {
  const [_, prefixStr] = cidr.split('/')
  if (!prefixStr) return 0
  const prefix = Number(prefixStr)
  if (Number.isNaN(prefix) || prefix < 0 || prefix > 32) return 0
  return Math.max(0, Math.pow(2, 32 - prefix) - 2)
}