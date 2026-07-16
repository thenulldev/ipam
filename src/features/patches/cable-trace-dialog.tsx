import { useMemo } from 'react'
import type { Cable, Port, PortId } from '@/lib/types'
import { useCables, useDevices, usePorts, useRacks, useRooms } from '@/lib/queries'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ChevronRight, Server, Cable as CableIcon } from 'lucide-react'

interface Props {
  portId: PortId | null
  onClose: () => void
}

interface TraceHop {
  fromPort: Port
  cable?: Cable
  toPort?: Port
  toDeviceName?: string
  toRackName?: string
}

export function CableTraceDialog({ portId, onClose }: Props) {
  const ports = usePorts().data ?? []
  const cables = useCables().data ?? []
  const devices = useDevices().data ?? []
  const racks = useRacks().data ?? []
  const rooms = useRooms().data ?? []

  const port = ports.find((p) => p.id === portId) ?? null
  const device = port ? devices.find((d) => d.id === port.deviceId) : null
  const rack = device ? racks.find((r) => r.id === device.rackId) : null
  const room = rack ? rooms.find((r) => r.id === rack.roomId) : null

  const hops = useMemo<TraceHop[]>(() => {
    if (!port) return []
    const chain: TraceHop[] = [{ fromPort: port }]
    let currentPort: Port | undefined = port
    const visited = new Set<string>()
    for (let depth = 0; depth < 12; depth++) {
      if (!currentPort) break
      if (visited.has(currentPort.id)) break
      visited.add(currentPort.id)
      if (!currentPort.cableId) break
      const cable = cables.find((c: Cable) => c.id === currentPort!.cableId)
      if (!cable) break
      const otherId: PortId =
        cable.portA === currentPort.id ? cable.portB : cable.portA
      const otherPort: Port | undefined = ports.find((p) => p.id === otherId)
      if (!otherPort) break
      const otherDevice = devices.find((d) => d.id === otherPort.deviceId)
      const otherRack = otherDevice ? racks.find((r) => r.id === otherDevice.rackId) : null
      chain.push({
        fromPort: currentPort,
        cable,
        toPort: otherPort,
        toDeviceName: otherDevice?.name,
        toRackName: otherRack?.name,
      })
      currentPort = otherPort
    }
    return chain
  }, [port, ports, cables, devices, racks])

  return (
    <Dialog open={Boolean(portId)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CableIcon className="size-4" />
            Cable trace
          </DialogTitle>
          <DialogDescription>
            {port && device && rack && (
              <span>
                Starting from <span className="font-mono">{port.label}</span> on{' '}
                <span className="font-medium">{device.name}</span> ({rack.name})
                {room && <> · {room.name}</>}.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {hops.length === 1 ? (
          <p className="text-sm text-slate-500">
            This port is not connected to anything.
          </p>
        ) : (
          <ol className="space-y-1.5 text-sm">
            {hops.slice(1).map((hop, idx) => (
              <li
                key={idx}
                className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 dark:border-slate-800"
              >
                <span className="rounded bg-slate-200 px-2 py-0.5 font-mono text-[11px] dark:bg-slate-700">
                  hop {idx + 1}
                </span>
                <Server className="size-4 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    {hop.toDeviceName} <span className="text-slate-400">·</span>{' '}
                    <span className="font-mono">{hop.toPort?.label}</span>
                    {hop.toRackName && (
                      <span className="text-slate-500"> ({hop.toRackName})</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    via {hop.cable?.kind} · {hop.cable?.label ?? hop.cable?.id}
                  </div>
                </div>
                <ChevronRight className="size-4 text-slate-300" />
              </li>
            ))}
            <li className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
              Trace ended at a terminal port after{' '}
              <strong>{hops.length - 1}</strong> hop
              {hops.length - 1 === 1 ? '' : 's'}.
            </li>
          </ol>
        )}
      </DialogContent>
    </Dialog>
  )
}
