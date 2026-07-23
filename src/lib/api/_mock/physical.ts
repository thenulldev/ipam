import type {
  Cable,
  Device,
  DeviceId,
  DeviceTemplate,
  DeviceTemplateId,
  Floorplan,
  Port,
  PortKind,
  Rack,
  RackId,
  Room,
  RoomId,
  Site,
  SiteId,
  TenantId,
} from '../../types'
import * as db from '../../mock'
import { delay } from '../client'
import { emitChange } from './meta'

export async function listSites(): Promise<Site[]> {
  return delay(db.sites)
}

export async function getSite(id: SiteId): Promise<Site | undefined> {
  return delay(db.sites.find((s) => s.id === id))
}

export async function listRooms(): Promise<Room[]> {
  return delay(db.rooms)
}

export async function listFloorplans(): Promise<Floorplan[]> {
  return delay(db.floorplans)
}

export async function getFloorplan(id: Floorplan['id']): Promise<Floorplan | undefined> {
  return delay(db.floorplans.find((f) => f.id === id))
}

export async function listRacks(): Promise<Rack[]> {
  return delay(db.racks)
}

export async function getRack(id: RackId): Promise<Rack | undefined> {
  return delay(db.racks.find((r) => r.id === id))
}

export async function listDevices(): Promise<Device[]> {
  return delay(db.devices)
}

export async function listDevicesByRack(rackId: RackId): Promise<Device[]> {
  return delay(db.devices.filter((d) => d.rackId === rackId))
}

export async function getDevice(id: Device['id']): Promise<Device | undefined> {
  return delay(db.devices.find((d) => d.id === id))
}

export async function listPorts(): Promise<Port[]> {
  return delay(db.ports)
}

export async function listPortsByDevice(deviceId: DeviceId): Promise<Port[]> {
  return delay(db.ports.filter((p) => p.deviceId === deviceId))
}

export async function getPort(id: Port['id']): Promise<Port | undefined> {
  return delay(db.ports.find((p) => p.id === id))
}

export async function listCables(): Promise<Cable[]> {
  return delay(db.cables)
}

export async function getRoom(id: RoomId): Promise<Room | undefined> {
  return delay(db.rooms.find((r) => r.id === id))
}

export type FloorplanWithRacks = Floorplan & {
  racks: { rack: Rack; position: Floorplan['rackPositions'][number] }[]
}

export async function getFloorplanWithRacks(
  id: Floorplan['id'],
): Promise<FloorplanWithRacks | undefined> {
  const fp = db.floorplans.find((f) => f.id === id)
  if (!fp) return delay(undefined)
  const racks = fp.rackPositions.map((pos) => {
    const rack = db.racks.find((r) => r.id === pos.rackId)!
    return { rack, position: pos }
  })
  return delay({ ...fp, racks })
}

// === Mutations ===

let portCounter = 0
const nextPortId = () =>
  'port-' + (++portCounter + db.ports.length).toString().padStart(6, '0') as Port['id']
let deviceCounter = 0
const nextDeviceId = () =>
  'dev-' + (++deviceCounter + db.devices.length).toString().padStart(6, '0') as DeviceId

export interface CreateDeviceFromTemplateInput {
  tenantId: TenantId
  templateId: DeviceTemplateId
  rackId: RackId
  name: string
  uStart: number
  face?: 'front' | 'rear'
  actorId: import('../../types').UserId
  actorName: string
}

export async function createDeviceFromTemplate(
  input: CreateDeviceFromTemplateInput,
): Promise<Device> {
  const tpl: DeviceTemplate | undefined = db.deviceTemplates.find(
    (t) => t.id === input.templateId,
  )
  if (!tpl) throw new Error('Template not found')
  const rack = db.racks.find((r) => r.id === input.rackId)
  if (!rack) throw new Error('Rack not found')

  const deviceId = nextDeviceId()
  const ports: Port[] = []
  let position = 1
  for (const group of tpl.portGroups) {
    const pad = group.pad ?? 2
    const startIndex = group.startIndex ?? 1
    for (let i = 0; i < group.count; i++) {
      const idx = startIndex + i
      const port: Port = {
        id: nextPortId(),
        deviceId,
        label: `${group.labelPrefix}${idx.toString().padStart(pad, '0')}`,
        kind: group.kind as PortKind,
        position: position++,
      }
      ports.push(port)
    }
  }

  const device: Device = {
    id: deviceId,
    rackId: input.rackId,
    name: input.name,
    kind: tpl.kind,
    model: tpl.model,
    vendor: tpl.vendor,
    uStart: input.uStart,
    uHeight: tpl.uHeight,
    face: input.face ?? tpl.defaultFace,
    ports: ports.map((p) => p.id),
    tags: [],
    customFields: {},
  }

  db.devices.push(device)
  db.ports.push(...ports)
  rack.devices.push(deviceId)

  await emitChange({
    tenantId: input.tenantId,
    actorId: input.actorId,
    actorName: input.actorName,
    action: 'create',
    entityType: 'device',
    entityId: deviceId,
    summary: `Created device ${input.name} on rack ${rack.name} (template: ${tpl.name})`,
  })

  return delay(device, 60)
}

export interface ConnectPortsInput {
  tenantId: TenantId
  cableKind: import('../../types').CableKind
  portAId: import('../../types').PortId
  portBId: import('../../types').PortId
  lengthM?: number
  label?: string
  actorId: import('../../types').UserId
  actorName: string
}

let cableCounter = 0
const nextCableId = () =>
  'cable-' + (++cableCounter + db.cables.length).toString().padStart(4, '0') as Cable['id']

export async function connectPorts(input: ConnectPortsInput): Promise<Cable> {
  const portA = db.ports.find((p) => p.id === input.portAId)
  const portB = db.ports.find((p) => p.id === input.portBId)
  if (!portA || !portB) throw new Error('Port not found')
  if (portA.cableId || portB.cableId) throw new Error('Port already connected')
  const cable: Cable = {
    id: nextCableId(),
    kind: input.cableKind,
    lengthM: input.lengthM,
    label: input.label,
    portA: input.portAId,
    portB: input.portBId,
  }
  db.cables.push(cable)
  portA.cableId = cable.id
  portB.cableId = cable.id

  await emitChange({
    tenantId: input.tenantId,
    actorId: input.actorId,
    actorName: input.actorName,
    action: 'connect',
    entityType: 'cable',
    entityId: cable.id,
    summary: `Connected cable "${cable.label ?? cable.id}" to ${portA.label} ↔ ${portB.label}`,
  })

  return delay(cable, 60)
}

export interface UpdateCableColorInput {
  tenantId: TenantId
  cableId: import('../../types').CableId
  color: string | null
  actorId: import('../../types').UserId
  actorName: string
}

export async function updateCableColor(input: UpdateCableColorInput): Promise<Cable> {
  const cable = db.cables.find((c) => c.id === input.cableId)
  if (!cable) throw new Error('Cable not found')
  ;(cable as any).color = input.color ?? undefined
  await emitChange({
    tenantId: input.tenantId,
    actorId: input.actorId,
    actorName: input.actorName,
    action: 'update',
    entityType: 'cable',
    entityId: input.cableId,
    summary: `Updated cable color${input.color ? ` to ${input.color}` : ' (cleared)'}`,
  })
  return delay(cable, 30)
}

export async function disconnectPort(
  cableId: import('../../types').CableId,
  actorId: import('../../types').UserId,
  actorName: string,
  tenantId: TenantId,
): Promise<void> {
  const cable = db.cables.find((c) => c.id === cableId)
  if (!cable) return delay(undefined, 30)
  const portA = db.ports.find((p) => p.id === cable.portA)
  const portB = db.ports.find((p) => p.id === cable.portB)
  if (portA) portA.cableId = null
  if (portB) portB.cableId = null
  const idx = db.cables.findIndex((c) => c.id === cableId)
  if (idx >= 0) db.cables.splice(idx, 1)

  await emitChange({
    tenantId,
    actorId,
    actorName,
    action: 'disconnect',
    entityType: 'cable',
    entityId: cableId,
    summary: `Disconnected cable "${cable.label ?? cableId}"`,
  })

  return delay(undefined, 30)
}

export interface UpdateRackPositionInput {
  tenantId: TenantId
  floorplanId: Floorplan['id']
  rackId: RackId
  x: number
  y: number
  actorId: import('../../types').UserId
  actorName: string
}

export async function updateRackPosition(
  input: UpdateRackPositionInput,
): Promise<Floorplan> {
  const fp = db.floorplans.find((f) => f.id === input.floorplanId)
  if (!fp) throw new Error('Floorplan not found')
  const pos = fp.rackPositions.find((p) => p.rackId === input.rackId)
  if (pos) {
    pos.x = input.x
    pos.y = input.y
  }

  await emitChange({
    tenantId: input.tenantId,
    actorId: input.actorId,
    actorName: input.actorName,
    action: 'place',
    entityType: 'rack',
    entityId: input.rackId,
    summary: `Moved rack ${input.rackId} to (${input.x}, ${input.y}) on ${fp.name}`,
  })

  return delay(fp, 40)
}

// === Site CRUD ===

let siteCounter = 0
const nextSiteId = () =>
  'site-' + (++siteCounter).toString().padStart(4, '0') as SiteId

export interface CreateSiteInput {
  tenantId: TenantId
  name: string
  address?: string
  actorId: import('../../types').UserId
  actorName: string
}

export async function createSite(input: CreateSiteInput): Promise<Site> {
  const site: Site = {
    id: nextSiteId(),
    tenantId: input.tenantId,
    name: input.name,
    address: input.address,
    rooms: [],
    tags: [],
  }
  db.sites.push(site)
  await emitChange({
    tenantId: input.tenantId,
    actorId: input.actorId,
    actorName: input.actorName,
    action: 'create',
    entityType: 'site',
    entityId: site.id,
    summary: `Created site ${site.name}`,
  })
  return delay(site, 60)
}

// === Device edit / delete ===

export interface UpdateDeviceInput {
  tenantId: TenantId
  id: DeviceId
  patch: Partial<
    Pick<
      Device,
      | 'name'
      | 'model'
      | 'vendor'
      | 'uStart'
      | 'uHeight'
      | 'face'
      | 'assetTag'
      | 'serialNumber'
      | 'warrantyEol'
      | 'wattage'
      | 'tags'
      | 'customFields'
    >
  >
  actorId: import('../../types').UserId
  actorName: string
}

export async function updateDevice(input: UpdateDeviceInput): Promise<Device> {
  const device = db.devices.find((d) => d.id === input.id)
  if (!device) throw new Error('Device not found')
  const before = { ...device }
  Object.assign(device, input.patch)
  await emitChange({
    tenantId: input.tenantId,
    actorId: input.actorId,
    actorName: input.actorName,
    action: 'update',
    entityType: 'device',
    entityId: device.id,
    summary: `Updated ${device.name}: ${Object.keys(input.patch).join(', ')}`,
  })
  void before
  return delay(device, 50)
}

export interface UpdatePortInput {
  tenantId: TenantId
  id: import('../../types').PortId
  patch: {
    label?: import('../../types').Port['label']
    vlanId?: import('../../types').Port['vlanId'] | null
    vlanMode?: import('../../types').Port['vlanMode'] | null
    cassette?: import('../../types').Port['cassette']
  }
  actorId: import('../../types').UserId
  actorName: string
}

export async function updatePort(input: UpdatePortInput): Promise<import('../../types').Port> {
  const port = db.ports.find((p) => p.id === input.id)
  if (!port) throw new Error('Port not found')
  Object.assign(port, input.patch)
  await emitChange({
    tenantId: input.tenantId,
    actorId: input.actorId,
    actorName: input.actorName,
    action: 'update',
    entityType: 'port',
    entityId: port.id,
    summary: `Updated port ${port.label}: ${Object.keys(input.patch).join(', ')}`,
  })
  return delay(port, 30)
}

export async function deleteDevice(
  id: DeviceId,
  actorId: import('../../types').UserId,
  actorName: string,
  tenantId: TenantId,
): Promise<void> {
  const idx = db.devices.findIndex((d) => d.id === id)
  if (idx < 0) return delay(undefined, 30)
  const device = db.devices[idx]!
  // Drop ports and any cable references
  for (const p of db.ports.filter((p) => p.deviceId === id)) {
    if (p.cableId) {
      const cable = db.cables.find((c) => c.id === p.cableId)
      if (cable) {
        const other = cable.portA === p.id ? cable.portB : cable.portA
        const otherPort = db.ports.find((x) => x.id === other)
        if (otherPort) otherPort.cableId = null
        db.cables.splice(db.cables.findIndex((c) => c.id === cable.id), 1)
      }
    }
    if (p.ipAddressId) {
      const addr = db.addresses.find((a) => a.id === p.ipAddressId)
      if (addr) {
        addr.assignedPortId = undefined
        addr.status = 'free'
      }
    }
  }
  db.ports.splice(0, db.ports.length, ...db.ports.filter((p) => p.deviceId !== id))
  // Drop device from rack.devices
  const rack = db.racks.find((r) => r.id === device.rackId)
  if (rack) rack.devices = rack.devices.filter((d) => d !== id)
  db.devices.splice(idx, 1)
  await emitChange({
    tenantId,
    actorId,
    actorName,
    action: 'delete',
    entityType: 'device',
    entityId: id,
    summary: `Removed device ${device.name}`,
  })
  return delay(undefined, 40)
}



