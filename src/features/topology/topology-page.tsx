import { useMemo } from 'react'
import {
  Cable,
  CircleDot,
  GitBranch,
  Network,
  Server,
} from 'lucide-react'
import {
  useAddresses,
  useCables,
  useDevices,
  usePorts,
  usePrefixes,
  useVrfs,
} from '@/lib/queries'
import { useTenantScope } from '@/lib/tenant-scope'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Link } from '@tanstack/react-router'
import type { Cable as CableT, Device, IpAddress, Port, Prefix, Vrf } from '@/lib/types'

interface VrfSubnet {
  vrf: Vrf | null
  prefixes: Prefix[]
  subnets: Array<{
    prefix: Prefix
    addresses: IpAddress[]
    devices: Map<string, { device: Device; addresses: IpAddress[] }>
  }>
}

export function TopologyPage() {
  const vrfs = useVrfs().data ?? []
  const prefixes = usePrefixes().data ?? []
  const addresses = useAddresses().data ?? []
  const allDevices = useDevices().data ?? []
  const ports = usePorts().data ?? []
  const allCables = useCables().data ?? []
  const scope = useTenantScope()

  // Group prefixes by VRF, then build subnets with assigned addresses
  const byVrf: VrfSubnet[] = useMemo(() => {
    const map = new Map<string | null, Prefix[]>()
    for (const p of prefixes) {
      const k = (p.vrfId as string | undefined) ?? null
      const arr = map.get(k) ?? []
      arr.push(p)
      map.set(k, arr)
    }
    return Array.from(map.entries()).map(([k, pfxs]) => {
      const vrf = k ? vrfs.find((v) => v.id === k) ?? null : null
      const subnets = pfxs.map((prefix) => {
        const subAddrs = addresses.filter((a) => a.prefixId === prefix.id)
        const devices = new Map<
          string,
          { device: Device; addresses: IpAddress[] }
        >()
        for (const a of subAddrs) {
          if (!a.assignedPortId) continue
          const port = ports.find((p) => p.id === a.assignedPortId)
          if (!port) continue
          const dev = allDevices.find((d) => d.id === port.deviceId)
          if (!dev) continue
          const entry = devices.get(dev.id) ?? { device: dev, addresses: [] }
          entry.addresses.push(a)
          devices.set(dev.id, entry)
        }
        return { prefix, addresses: subAddrs, devices }
      })
      return { vrf, prefixes: pfxs, subnets }
    })
  }, [vrfs, prefixes, addresses, allDevices, ports])

  // Adjacency index: device id → {peer device, port, cable}
  const adjacency = useMemo(() => {
    const map = new Map<
      string,
      Array<{ peer: Device; port: Port; cable: CableT }>
    >()
    for (const c of allCables) {
      const pa = ports.find((p) => p.id === c.portA)
      const pb = ports.find((p) => p.id === c.portB)
      if (!pa || !pb) continue
      const da = allDevices.find((d) => d.id === pa.deviceId)
      const db = allDevices.find((d) => d.id === pb.deviceId)
      if (!da || !db) continue
      const a = map.get(da.id) ?? []
      a.push({ peer: db, port: pb, cable: c })
      map.set(da.id, a)
      const b = map.get(db.id) ?? []
      b.push({ peer: da, port: pa, cable: c })
      map.set(db.id, b)
    }
    return map
  }, [allCables, ports, allDevices])

  // Stats
  const totalDevices = scope.devices.length
  const totalCables = scope.cables.length
  const totalAddresses = addresses.length
  const totalAssigned = addresses.filter(
    (a) => a.status === 'assigned',
  ).length

  return (
    <div className="min-w-0 space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <GitBranch className="size-6 shrink-0 text-slate-400" />
            Network topology
          </h1>
          <p className="text-sm text-slate-500">
            VRFs, subnets, devices, and adjacencies in the current tenant.
          </p>
        </div>
        <div className="flex max-w-full flex-wrap gap-2 text-xs text-slate-500">
          <Badge variant="outline">
            <Layers className="mr-1 size-3" />
            {byVrf.length} VRF
          </Badge>
          <Badge variant="outline">
            <Network className="mr-1 size-3" />
            {prefixes.length} subnets
          </Badge>
          <Badge variant="outline">
            <Server className="mr-1 size-3" />
            {totalDevices} devices
          </Badge>
          <Badge variant="outline">
            <Cable className="mr-1 size-3" />
            {totalCables} cables
          </Badge>
          <Badge variant="outline">
            <CircleDot className="mr-1 size-3" />
            {totalAssigned}/{totalAddresses} IPs
          </Badge>
        </div>
      </div>

      {byVrf.map((vrfBlock, idx) => (
        <VrfCard
          key={vrfBlock.vrf?.id ?? `default-${idx}`}
          vrfBlock={vrfBlock}
          adjacency={adjacency}
        />
      ))}

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="size-4 text-slate-400" />
            L3 adjacency graph
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-xs text-slate-500">
            Direct L2/L3 connections between devices. For L3 traffic flow across
            subnets/VRFs, see the IPAM &gt; Subnet tree.
          </p>
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from(adjacency.entries())
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([devId, peers]) => {
                const dev = scope.devices.find((d) => d.id === devId)
                if (!dev) return null
                return (
                  <li
                    key={devId}
                    className="min-w-0 rounded-md border border-slate-200 p-2 text-xs dark:border-slate-800"
                  >
                    <Link
                      to="/racks/$rackId"
                      params={{ rackId: dev.rackId }}
                      className="break-words font-medium hover:underline"
                    >
                      {dev.name}
                    </Link>
                    <span className="ml-1 text-slate-500">→</span>
                    {peers.map(({ peer, port, cable }) => (
                      <span
                        key={cable.id + peer.id}
                        className="ml-1 inline-flex max-w-full items-center gap-0.5 break-words font-mono"
                      >
                        {peer.name}.{port.label}
                      </span>
                    ))}
                  </li>
                )
              })}
            {adjacency.size === 0 && (
              <p className="text-sm text-slate-500">
                No device-to-device adjacencies.
              </p>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

function VrfCard({
  vrfBlock,
  adjacency,
}: {
  vrfBlock: VrfSubnet
  adjacency: Map<string, Array<{ peer: Device; port: Port; cable: CableT }>>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Layers className="size-4 text-slate-400" />
          VRF: {vrfBlock.vrf?.name ?? 'default'}
          {vrfBlock.vrf?.rd && (
            <Badge variant="outline" className="font-mono">
              RD {vrfBlock.vrf.rd}
            </Badge>
          )}
          <span className="w-full text-xs text-slate-500 sm:ml-auto sm:w-auto">
            {vrfBlock.subnets.length} subnets
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {vrfBlock.subnets.map((sn) => (
            <SubnetCard
              key={sn.prefix.id}
              subnet={sn}
              adjacency={adjacency}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function SubnetCard({
  subnet,
  adjacency,
}: {
  subnet: VrfSubnet['subnets'][number]
  adjacency: Map<string, Array<{ peer: Device; port: Port; cable: CableT }>>
}) {
  const assigned = subnet.addresses.filter((a) => a.status === 'assigned')
  const free = subnet.addresses.filter((a) => a.status === 'free').length
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2">
        <Network className="size-3.5 text-slate-400" />
        <span className="font-mono text-sm font-semibold">
          {subnet.prefix.cidr}
        </span>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase',
            subnet.prefix.role === 'lan' &&
              'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
            subnet.prefix.role === 'mgmt' &&
              'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
            subnet.prefix.role === 'p2p' &&
              'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
            !['lan', 'mgmt', 'p2p'].includes(subnet.prefix.role) &&
              'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
          )}
        >
          {subnet.prefix.role}
        </span>
        <span className="ml-auto text-[10px] text-slate-500">
          {assigned.length} used
        </span>
      </div>
      {subnet.prefix.description && (
        <p className="mt-0.5 text-[11px] text-slate-500">
          {subnet.prefix.description}
        </p>
      )}

      {subnet.devices.size === 0 ? (
        <p className="mt-2 text-[11px] text-slate-400">
          {free > 0 ? `${free} free, no devices.` : 'No addresses.'}
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {Array.from(subnet.devices.values()).map(({ device, addresses }) => {
            const peers = adjacency.get(device.id) ?? []
            return (
              <li
                key={device.id}
                className="rounded border border-slate-200 bg-slate-50 p-1.5 text-[11px] dark:border-slate-800 dark:bg-slate-800/40"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Server className="size-3 text-slate-400" />
                  <Link
                    to="/racks/$rackId"
                    params={{ rackId: device.rackId }}
                    className="font-medium hover:underline"
                  >
                    {device.name}
                  </Link>
                  <span className="text-slate-400">·</span>
                  {addresses.map((a) => (
                    <span
                      key={a.id}
                      className="rounded bg-emerald-100 px-1 py-0.5 font-mono text-[10px] text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                    >
                      {a.address}
                    </span>
                  ))}
                </div>
                {peers.length > 0 && (
                  <div className="ml-4 mt-0.5 break-words text-[10px] text-slate-500">
                    ↳ {peers.length} peer
                    {peers.length === 1 ? '' : 's'}:{' '}
                    {peers
                      .map(
                        (p) =>
                          `${p.peer.name}.${p.port.label}`,
                      )
                      .join(', ')}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Link2(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function Layers(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  )
}
