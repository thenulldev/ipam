import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useIsMobile } from '@/hooks/use-media-query'
import { FloorplanListView } from './floorplan-list-view'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FloorplanCanvas } from './floorplan-canvas'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  useCables,
  useDevices,
  useFloorplanWithRacks,
  useFloorplans,
  usePorts,
  useRooms,
  useSites,
  useUsers,
} from '@/lib/queries'
import { MapPinned, Plus } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { useTenantStore } from '@/store/tenant-store'
import { canWrite } from '@/lib/auth'
import type { Device, FloorplanId, Port, RackId } from '@/lib/types'

export function FloorplanPage() {
  const { data: floorplans = [] } = useFloorplans()
  const { data: devices = [] } = useDevices()
  const { data: ports = [] } = usePorts()
  const { data: cables = [] } = useCables()
  const { data: sites = [] } = useSites()
  const { data: rooms = [] } = useRooms()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const tenantId = useTenantStore((s) => s.currentTenantId)
  const tenantUsers = useUsers(tenantId).data ?? []
  const currentUser = tenantUsers.find(
    (u) => u.id === useTenantStore.getState().currentUserId,
  )
  const writable = canWrite(currentUser?.role ?? 'viewer')

  const [floorplanId, setFloorplanId] = useState<FloorplanId | null>(
    (floorplans[0]?.id ?? null) as FloorplanId | null,
  )

  if (isMobile) {
    return <FloorplanListView />
  }

  const current = floorplans.find((f) => f.id === floorplanId)
  const currentRoom = current ? rooms.find((r) => r.id === current.roomId) : undefined
  const currentSite = currentRoom ? sites.find((s) => s.id === currentRoom.siteId) : undefined

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900 sm:gap-3 sm:px-4">
        <MapPinned className="size-4 shrink-0 text-slate-400" />
        <Select
          value={floorplanId ?? undefined}
          onValueChange={(v) => setFloorplanId(v as FloorplanId)}
        >
          <SelectTrigger className="h-9 min-w-0 flex-1 text-sm sm:h-8 sm:w-64 sm:flex-none">
            <SelectValue placeholder="Choose a floorplan" />
          </SelectTrigger>
          <SelectContent>
            {floorplans.map((fp) => {
              const room = rooms.find((r) => r.id === fp.roomId)
              const site = room ? sites.find((s) => s.id === room.siteId) : undefined
              return (
                <SelectItem key={fp.id} value={fp.id}>
                  <div className="flex items-center gap-2">
                    <span>{fp.name}</span>
                    {site && (
                      <span className="text-[10px] text-slate-400">
                        {site.name} / {room?.name}
                      </span>
                    )}
                  </div>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
        {currentSite && (
          <Badge variant="outline" className="text-xs">
            {currentSite.name} / {currentRoom?.name}
          </Badge>
        )}
        <span className="order-last w-full text-[11px] text-slate-500 sm:order-none sm:ml-auto sm:w-auto">
          Drag to pan · scroll to zoom · click a rack to open
        </span>
        {writable && (
          <Button size="sm" variant="outline" className="w-full sm:w-auto">
            <Plus className="size-4" />
            New floorplan
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {floorplanId ? (
          <FloorplanView
            floorplanId={floorplanId}
            devices={devices}
            ports={ports}
            cables={cables}
            onSelectRack={(rackId) =>
              navigate({ to: '/racks/$rackId', params: { rackId } })
            }
          />
        ) : floorplans.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<MapPinned className="size-6" />}
              title="No floorplans yet"
              description="Create your first floorplan to start placing racks and tracing connections."
              action={
                writable ? (
                  <Button>
                    <Plus className="size-4" />
                    Create floorplan
                  </Button>
                ) : null
              }
            />
          </div>
        ) : (
          <div className="grid h-full place-items-center text-sm text-slate-500">
            Select a floorplan above.
          </div>
        )}
      </div>
    </div>
  )
}

function FloorplanView({
  floorplanId,
  devices,
  ports,
  cables,
  onSelectRack,
}: {
  floorplanId: FloorplanId
  devices: Device[]
  ports: Port[]
  cables: import('@/lib/types').Cable[]
  onSelectRack: (id: RackId) => void
}) {
  const { data } = useFloorplanWithRacks(floorplanId)
  const { data: rooms = [] } = useRooms()
  const { data: sites = [] } = useSites()

  if (!data) {
    return (
      <div className="grid h-full place-items-center text-sm text-slate-500">
        Loading floorplan…
      </div>
    )
  }

  const room = rooms.find((r) => r.id === data.roomId)
  const site = room ? sites.find((s) => s.id === room.siteId) : undefined
  const locationLabel = site
    ? `${site.name} / ${room?.name ?? 'Room'}`
    : data.name

  return (
    <div className="relative h-full">
      <div className="pointer-events-none absolute right-4 top-3 z-20 font-mono text-xs font-medium uppercase tracking-wider text-slate-400">
        {locationLabel}
      </div>
      <FloorplanCanvas
        floorplan={data}
        racks={data.racks.map((r) => r.rack)}
        rackPositions={data.racks.map((r) => ({
          rack: r.rack,
          position: r.position,
        }))}
        devices={devices}
        ports={ports}
        cables={cables}
        onSelectRack={onSelectRack}
      />
    </div>
  )
}
