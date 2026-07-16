import { useMemo } from 'react'
import {
  Activity,
  BarChart3,
  Cable,
  CircuitBoard,
  Layers,
  Network,
  Server,
} from 'lucide-react'
import { useCables, useDevices, usePorts, useRacks, useRooms, useVrfs } from '@/lib/queries'
import { useTenantScope } from '@/lib/tenant-scope'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const DEVICE_KIND_COLORS: Record<string, string> = {
  switch: '#3b82f6',
  router: '#a855f7',
  firewall: '#ef4444',
  server: '#10b981',
  'patch-panel': '#64748b',
  pdu: '#f59e0b',
  kvm: '#ec4899',
  'console-server': '#6366f1',
  blank: '#cbd5e1',
  'patchbox-cassette': '#06b6d4',
  'rack-tray': '#f97316',
  'cable-manager': '#eab308',
  gateway: '#14b8a6',
  ups: '#dc2626',
}

const PORT_KIND_COLORS: Record<string, string> = {
  'rj45-1g': '#3b82f6',
  'rj45-2.5g': '#0ea5e9',
  'rj45-5g': '#06b6d4',
  'rj45-10g': '#22d3ee',
  'sfp-1g': '#a855f7',
  'sfp-plus-10g': '#c084fc',
  'qsfp-40g': '#ec4899',
  'qsfp28-100g': '#f43f5e',
  'fiber-lc': '#10b981',
  'console-rj45': '#64748b',
  'console-usb': '#94a3b8',
  'usb-a': '#cbd5e1',
  'power-c13': '#f59e0b',
  'power-c19': '#d97706',
}

export function InventorySection() {
  const scope = useTenantScope()
  const allDevices = useDevices().data ?? []
  const allPorts = usePorts().data ?? []
  const allCables = useCables().data ?? []
  const allRacks = useRacks().data ?? []
  const allRooms = useRooms().data ?? []
  const allVrfs = useVrfs().data ?? []

  const deviceCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of allDevices) map.set(d.kind, (map.get(d.kind) ?? 0) + 1)
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
  }, [allDevices])

  const portCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of allPorts) map.set(p.kind, (map.get(p.kind) ?? 0) + 1)
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
  }, [allPorts])

  const roomCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of allRacks) {
      const room = allRooms.find((rm) => rm.id === r.roomId)
      const key = room?.name ?? 'Unassigned'
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [allRacks, allRooms])

  const maxPortCount = Math.max(1, ...portCounts.map(([, n]) => n))
  const maxRoomCount = Math.max(1, ...roomCounts.map(([, n]) => n))
  const totalDevices = deviceCounts.reduce((s, [, n]) => s + n, 0) || 1

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <CircuitBoard className="size-4 text-slate-400" />
            Devices by kind
            <span className="ml-auto text-xs font-normal text-slate-500">
              {deviceCounts.reduce((s, [, n]) => s + n, 0)} total
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {deviceCounts.length === 0 ? (
            <Empty>No devices yet.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {deviceCounts.map(([kind, count]) => {
                const pct = Math.round((count / totalDevices) * 100)
                return (
                  <li key={kind} className="text-xs">
                    <div className="mb-0.5 flex items-center justify-between">
                      <span className="font-mono">{kind}</span>
                      <span className="text-slate-500">
                        {count} · {pct}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full"
                        style={{
                          width: `${pct}%`,
                          background:
                            DEVICE_KIND_COLORS[kind] ?? '#94a3b8',
                        }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <BarChart3 className="size-4 text-slate-400" />
            Ports by type
            <span className="ml-auto text-xs font-normal text-slate-500">
              {portCounts.reduce((s, [, n]) => s + n, 0)} total
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {portCounts.length === 0 ? (
            <Empty>No ports yet.</Empty>
          ) : (
            <div className="space-y-2">
              {portCounts.map(([kind, count]) => {
                const pct = (count / maxPortCount) * 100
                return (
                  <div key={kind} className="flex items-center gap-2 text-xs">
                    <span className="w-32 shrink-0 truncate font-mono text-slate-600 dark:text-slate-300">
                      {kind}
                    </span>
                    <div className="relative h-4 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                      <div
                        className="absolute inset-y-0 left-0"
                        style={{
                          width: `${pct}%`,
                          background:
                            PORT_KIND_COLORS[kind] ?? '#94a3b8',
                          opacity: 0.85,
                        }}
                      />
                    </div>
                    <span className="w-12 shrink-0 text-right font-mono text-slate-500 tabular-nums">
                      {count}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Layers className="size-4 text-slate-400" />
            Racks by room
            <span className="ml-auto text-xs font-normal text-slate-500">
              {allRacks.length} total
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {roomCounts.length === 0 ? (
            <Empty>No racks placed yet.</Empty>
          ) : (
            <div className="space-y-2">
              {roomCounts.map(([room, count]) => {
                const pct = (count / maxRoomCount) * 100
                const heat = Math.min(1, count / 5)
                return (
                  <div key={room} className="flex items-center gap-2 text-xs">
                    <span className="w-32 shrink-0 truncate font-mono text-slate-600 dark:text-slate-300">
                      {room}
                    </span>
                    <div
                      className="relative h-4 flex-1 overflow-hidden rounded"
                      style={{
                        background: `rgba(239, 68, 68, ${0.1 + heat * 0.5})`,
                      }}
                    >
                      <div
                        className="absolute inset-y-0 left-0"
                        style={{
                          width: `${pct}%`,
                          background: `rgba(239, 68, 68, ${0.3 + heat * 0.5})`,
                        }}
                      />
                    </div>
                    <span className="w-12 shrink-0 text-right font-mono text-slate-500 tabular-nums">
                      {count} rack{count === 1 ? '' : 's'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Activity className="size-4 text-slate-400" />
            Topology summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <SummaryItem
              icon={<Server className="size-3.5" />}
              label="Devices"
              value={allDevices.length}
            />
            <SummaryItem
              icon={<Cable className="size-3.5" />}
              label="Cables"
              value={allCables.length}
            />
            <SummaryItem
              icon={<Network className="size-3.5" />}
              label="Ports"
              value={allPorts.length}
            />
            <SummaryItem
              icon={<Layers className="size-3.5" />}
              label="VRFs"
              value={allVrfs.length}
            />
            <SummaryItem
              icon={<Layers className="size-3.5" />}
              label="Racks"
              value={allRacks.length}
            />
            <SummaryItem
              icon={<CircuitBoard className="size-3.5" />}
              label="Avg ports / device"
              value={
                allDevices.length > 0
                  ? Math.round(allPorts.length / allDevices.length)
                  : 0
              }
            />
            <SummaryItem
              icon={<Cable className="size-3.5" />}
              label="Avg cables / device"
              value={
                allDevices.length > 0
                  ? (allCables.length / allDevices.length).toFixed(1)
                  : '0'
              }
            />
            <SummaryItem
              icon={<Layers className="size-3.5" />}
              label="Utilization"
              value={`${
                allRacks.length > 0
                  ? Math.round(
                      (scope.devices.reduce((s, d) => s + d.uHeight, 0) /
                        allRacks.reduce((s, r) => s + r.uHeight, 0)) *
                        100,
                    )
                  : 0
              }%`}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 dark:border-slate-800 dark:bg-slate-800/40">
      <div className="text-slate-400">{icon}</div>
      <div className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">
        {label}
      </div>
      <div className="font-mono font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-slate-500">{children}</p>
  )
}
