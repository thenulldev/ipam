import { Link } from '@tanstack/react-router'
import { ArrowRight, Building2 } from 'lucide-react'
import { useState } from 'react'
import { useEditorStore } from '@/store/editor-store'
import type { Cable, Device, Port, Rack, RackId } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Props {
  rackId: RackId
  cables: Cable[]
  ports: Port[]
  devices: Device[]
  racks: Rack[]
}

interface External {
  cable: Cable
  thisPort: Port
  thisDevice: Device
  otherPort: Port
  otherDevice: Device
  otherRack: Rack
}

function findExternal(
  rackId: RackId,
  cables: Cable[],
  ports: Port[],
  devices: Device[],
  racks: Rack[],
): External[] {
  const out: External[] = []
  for (const c of cables) {
    const pa = ports.find((p) => p.id === c.portA)
    const pb = ports.find((p) => p.id === c.portB)
    if (!pa || !pb) continue
    const da = devices.find((d) => d.id === pa.deviceId)
    const db = devices.find((d) => d.id === pb.deviceId)
    if (!da || !db) continue
    if (da.rackId === rackId && db.rackId !== rackId) {
      const otherRack = racks.find((r) => r.id === db.rackId)
      if (otherRack) {
        out.push({
          cable: c,
          thisPort: pa,
          thisDevice: da,
          otherPort: pb,
          otherDevice: db,
          otherRack,
        })
      }
    } else if (db.rackId === rackId && da.rackId !== rackId) {
      const otherRack = racks.find((r) => r.id === da.rackId)
      if (otherRack) {
        out.push({
          cable: c,
          thisPort: pb,
          thisDevice: db,
          otherPort: pa,
          otherDevice: da,
          otherRack,
        })
      }
    }
  }
  return out
}

function groupBy<T, K extends string | number>(
  arr: T[],
  fn: (t: T) => K,
): Map<K, T[]> {
  const m = new Map<K, T[]>()
  for (const x of arr) {
    const k = fn(x)
    const arr = m.get(k) ?? []
    arr.push(x)
    m.set(k, arr)
  }
  return m
}

export function OutboundConnections({
  rackId,
  cables,
  ports,
  devices,
  racks,
}: Props) {
  const highlight = useEditorStore((s) => s.highlightConnection)
  const [expanded, setExpanded] = useState<Set<RackId>>(new Set())

  const externals = findExternal(rackId, cables, ports, devices, racks)
  const grouped = groupBy(externals, (e) => e.otherRack.id)

  if (externals.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40">
        <ArrowRight className="mx-auto mb-1 size-4 opacity-50" />
        No outbound connections from this rack.
        <p className="mt-1 text-xs">
          Cables that leave this rack will appear here grouped by destination.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        {externals.length} cable{externals.length === 1 ? '' : 's'} leave
        this rack, going to {grouped.size} other rack
        {grouped.size === 1 ? '' : 's'}.
      </p>
      {Array.from(grouped.entries()).map(([otherRackId, group]) => {
        const otherRack = group[0]!.otherRack
        const isExpanded = expanded.has(otherRackId)
        const toggle = () => {
          setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(otherRackId)) next.delete(otherRackId)
            else next.add(otherRackId)
            return next
          })
        }
        return (
          <div
            key={otherRackId}
            className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          >
            <button
              onClick={toggle}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Building2 className="size-3.5 text-slate-400" />
              <span className="font-medium">
                {otherRack.name}
              </span>
              <span className="font-mono text-xs text-slate-500">
                ({otherRack.uHeight}U)
              </span>
              <span className="ml-auto rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                {group.length} cable{group.length === 1 ? '' : 's'}
              </span>
              <Link
                to="/racks/$rackId"
                params={{ rackId: otherRackId }}
                onClick={(e) => e.stopPropagation()}
                className="rounded px-1.5 py-0.5 text-[10px] text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/40"
              >
                Open →
              </Link>
            </button>
            {isExpanded && (
              <ul className="divide-y divide-slate-200 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {group.map((e) => (
                  <li
                    key={e.cable.id}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50',
                    )}
                  >
                    <span
                      className="size-2.5 rounded"
                      style={{
                        background: (e.cable as any).color || '#0ea5e9',
                      }}
                    />
                    <span className="font-medium">
                      {e.cable.label ?? e.cable.id}
                    </span>
                    <span className="text-slate-500">
                      {e.cable.kind}
                      {e.cable.lengthM ? ` · ${e.cable.lengthM}m` : ''}
                    </span>
                    <span className="ml-auto flex items-center gap-1 font-mono">
                      <button
                        onClick={() => highlight(e.thisPort.id, e.cable.id)}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
                      >
                        {e.thisPort.label}
                      </button>
                      <ArrowRight className="size-3 text-slate-400" />
                      <button
                        onClick={() => highlight(e.otherPort.id, e.cable.id)}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
                      >
                        {e.otherPort.label}
                      </button>
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500">{e.otherDevice.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
