import { useMemo } from 'react'
import { Network } from 'lucide-react'
import { usePorts, useVlans } from '@/lib/queries'
import { useTenantScope } from '@/lib/tenant-scope'

interface Props {
  rackId: string
}

export function VlansTab({ rackId }: Props) {
  const scope = useTenantScope()
  const allPorts = usePorts().data ?? []
  const vlans = useVlans().data ?? []

  // Find all device IDs in this rack
  const rackDeviceIds = new Set(
    scope.devices.filter((d) => d.rackId === rackId).map((d) => d.id),
  )
  // For each VLAN, count how many ports in this rack use it
  const vlanUsage = useMemo(() => {
    const map = new Map<string, { vlan: typeof vlans[number]; portCount: number; ports: typeof allPorts }>()
    for (const v of vlans) {
      const ports = allPorts.filter(
        (p) => p.vlanId === v.id && rackDeviceIds.has(p.deviceId),
      )
      if (ports.length > 0) {
        map.set(v.id, { vlan: v, portCount: ports.length, ports })
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => a.vlan.vid - b.vlan.vid,
    )
  }, [vlans, allPorts, rackDeviceIds])

  if (vlanUsage.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40">
        <Network className="mx-auto mb-2 size-6 opacity-50" />
        No VLANs in use on this rack.
        <p className="mt-1 text-xs">
          Assign a VLAN to a port in the right sidebar to see it here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        {vlanUsage.length} VLAN{vlanUsage.length === 1 ? '' : 's'} in use on
        this rack.
      </p>
      {vlanUsage.map(({ vlan, portCount, ports }) => (
        <div
          key={vlan.id}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center gap-2">
            <Network className="size-3.5 text-brand-500" />
            <span className="font-mono text-sm font-semibold">VLAN {vlan.vid}</span>
            <span className="font-medium">{vlan.name}</span>
            {vlan.description && (
              <span className="truncate text-xs text-slate-500">
                · {vlan.description}
              </span>
            )}
            <span className="ml-auto rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-medium text-brand-800 dark:bg-brand-900/40 dark:text-brand-200">
              {portCount} port{portCount === 1 ? '' : 's'}
            </span>
          </div>
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {ports.slice(0, 24).map((p) => {
              const dev = scope.devices.find((d) => d.id === p.deviceId)
              return (
                <li
                  key={p.id}
                  className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  title={`${dev?.name ?? '?'} · ${p.label}`}
                >
                  {p.label}
                </li>
              )
            })}
            {ports.length > 24 && (
              <li className="text-[10px] text-slate-400">
                +{ports.length - 24} more
              </li>
            )}
          </ul>
        </div>
      ))}
    </div>
  )
}