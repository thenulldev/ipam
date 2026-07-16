import { useMemo } from 'react'
import {
  useCables,
  useDevices,
  useFloorplans,
  usePorts,
  useRacks,
  useRooms,
  useSites,
} from './queries'
import { useTenantStore } from '@/store/tenant-store'

/**
 * Returns all the entity lists pre-filtered by the current tenant.
 * - Sites/Racks/Rooms/Floorplans are filtered directly via tenantId.
 * - Devices are filtered via Rack.tenantId.
 * - Ports/Cables are filtered via Device → Rack.
 */
export function useTenantScope() {
  const currentTenantId = useTenantStore((s) => s.currentTenantId)

  const sites = useSites().data ?? []
  const rooms = useRooms().data ?? []
  const floorplans = useFloorplans().data ?? []
  const racks = useRacks().data ?? []
  const devices = useDevices().data ?? []
  const ports = usePorts().data ?? []
  const cables = useCables().data ?? []

  return useMemo(() => {
    const tenantSiteIds = new Set(sites.filter((s) => s.tenantId === currentTenantId).map((s) => s.id))
    const tenantRooms = rooms.filter((r) => tenantSiteIds.has(r.siteId))
    const tenantRoomIds = new Set(tenantRooms.map((r) => r.id))
    const tenantFloorplans = floorplans.filter((f) => tenantRoomIds.has(f.roomId))
    const tenantRacks = racks.filter((r) => r.tenantId === currentTenantId)
    const tenantRackIds = new Set(tenantRacks.map((r) => r.id))
    const tenantDevices = devices.filter((d) => tenantRackIds.has(d.rackId))
    const tenantDeviceIds = new Set(tenantDevices.map((d) => d.id))
    const tenantPorts = ports.filter((p) => tenantDeviceIds.has(p.deviceId))
    const tenantPortIds = new Set(tenantPorts.map((p) => p.id))
    const tenantCables = cables.filter(
      (c) => tenantPortIds.has(c.portA) && tenantPortIds.has(c.portB),
    )
    return {
      sites: sites.filter((s) => s.tenantId === currentTenantId),
      rooms: tenantRooms,
      floorplans: tenantFloorplans,
      racks: tenantRacks,
      devices: tenantDevices,
      ports: tenantPorts,
      cables: tenantCables,
    }
  }, [sites, rooms, floorplans, racks, devices, ports, cables, currentTenantId])
}
