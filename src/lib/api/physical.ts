import type {
  Cable,
  Device,
  DeviceTemplate,
  Floorplan,
  Port,
  Rack,
  Room,
  Site,
} from '../types.ts'
import { pick } from './adapter.ts'
import { api } from './http-client.ts'
import * as mock from './_mock/physical.ts'

async function getOrUndefined<T>(path: string): Promise<T | undefined> {
  try {
    return await api.get<T>(path)
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
      return undefined
    }
    throw error
  }
}

const liveListSites = (): Promise<Site[]> => api.get('/api/sites')
const liveGetSite: typeof mock.getSite = async (id) =>
  (await liveListSites()).find((site) => site.id === id)
const liveListRooms = (): Promise<Room[]> => api.get('/api/rooms')
const liveGetRoom: typeof mock.getRoom = async (id) =>
  (await liveListRooms()).find((room) => room.id === id)
const liveListFloorplans = (): Promise<Floorplan[]> => api.get('/api/floorplans')
const liveGetFloorplan: typeof mock.getFloorplan = async (id) =>
  (await liveListFloorplans()).find((floorplan) => floorplan.id === id)
const liveListRacks = (): Promise<Rack[]> => api.get('/api/racks')
const liveGetRack: typeof mock.getRack = async (id) =>
  (await liveListRacks()).find((rack) => rack.id === id)
const liveListDevices = (): Promise<Device[]> => api.get('/api/devices')
const liveListDevicesByRack: typeof mock.listDevicesByRack = (rackId) =>
  liveListDevices().then((devices) => devices.filter((device) => device.rackId === rackId))
const liveGetDevice: typeof mock.getDevice = async (id) =>
  (await liveListDevices()).find((device) => device.id === id)
const liveListPorts = (): Promise<Port[]> => api.get('/api/ports')
const liveListPortsByDevice: typeof mock.listPortsByDevice = (deviceId) =>
  liveListPorts().then((ports) => ports.filter((port) => port.deviceId === deviceId))
const liveGetPort: typeof mock.getPort = async (id) =>
  (await liveListPorts()).find((port) => port.id === id)
const liveListCables = (): Promise<Cable[]> => api.get('/api/cables')

const liveGetFloorplanWithRacks: typeof mock.getFloorplanWithRacks = async (id) => {
  const floorplan = await liveGetFloorplan(id)
  if (!floorplan) return undefined
  const rackById = new Map((await liveListRacks()).map((rack) => [rack.id, rack]))
  return {
    ...floorplan,
    racks: floorplan.rackPositions.flatMap((position) => {
      const rack = rackById.get(position.rackId)
      return rack ? [{ rack, position }] : []
    }),
  }
}

const liveCreateDeviceFromTemplate: typeof mock.createDeviceFromTemplate = async (input) => {
  const template = await getOrUndefined<DeviceTemplate>(
    `/api/device-templates/${encodeURIComponent(input.templateId)}`,
  )
  if (!template) throw new Error('Template not found')
  return api.post('/api/devices', input)
}
const liveConnectPorts: typeof mock.connectPorts = (input) =>
  api.post('/api/cables', {
    ...input,
    kind: input.cableKind,
  })
const liveUpdateCableColor: typeof mock.updateCableColor = async (input) => {
  await api.patch(`/api/cables/${encodeURIComponent(input.cableId)}`, {
    color: input.color,
  })
  const cable = await getOrUndefined<Cable>(`/api/cables/${encodeURIComponent(input.cableId)}`)
  if (!cable) throw new Error('Cable not found after update')
  return { ...cable, color: input.color ?? undefined }
}
const liveDisconnectPort: typeof mock.disconnectPort = async (
  cableId,
  actorId,
  actorName,
  tenantId,
) => {
  await api.delete(`/api/cables/${encodeURIComponent(cableId)}`, {
    actorId,
    actorName,
    tenantId,
  })
}
const liveUpdateRackPosition: typeof mock.updateRackPosition = async (input) => {
  await api.post('/api/floorplan-positions', input)
  const floorplan = await liveGetFloorplan(input.floorplanId)
  if (!floorplan) throw new Error('Floorplan not found after update')
  return floorplan
}
const liveCreateSite: typeof mock.createSite = (input) => api.post('/api/sites', input)
const liveUpdateDevice: typeof mock.updateDevice = (input) =>
  api.patch(`/api/devices/${encodeURIComponent(input.id)}`, input)
const liveUpdatePort: typeof mock.updatePort = (input) =>
  api.patch(`/api/ports/${encodeURIComponent(input.id)}`, input)
const liveDeleteDevice: typeof mock.deleteDevice = async (
  id,
  actorId,
  actorName,
  tenantId,
) => {
  await api.delete(`/api/devices/${encodeURIComponent(id)}`, {
    actorId,
    actorName,
    tenantId,
  })
}

export const listSites = pick<typeof mock.listSites>(liveListSites, mock.listSites)
export const getSite = pick<typeof mock.getSite>(liveGetSite, mock.getSite)
export const listRooms = pick<typeof mock.listRooms>(liveListRooms, mock.listRooms)
export const getRoom = pick<typeof mock.getRoom>(liveGetRoom, mock.getRoom)
export const listFloorplans = pick<typeof mock.listFloorplans>(
  liveListFloorplans,
  mock.listFloorplans,
)
export const getFloorplan = pick<typeof mock.getFloorplan>(liveGetFloorplan, mock.getFloorplan)
export const listRacks = pick<typeof mock.listRacks>(liveListRacks, mock.listRacks)
export const getRack = pick<typeof mock.getRack>(liveGetRack, mock.getRack)
export const listDevices = pick<typeof mock.listDevices>(liveListDevices, mock.listDevices)
export const listDevicesByRack = pick<typeof mock.listDevicesByRack>(
  liveListDevicesByRack,
  mock.listDevicesByRack,
)
export const getDevice = pick<typeof mock.getDevice>(liveGetDevice, mock.getDevice)
export const listPorts = pick<typeof mock.listPorts>(liveListPorts, mock.listPorts)
export const listPortsByDevice = pick<typeof mock.listPortsByDevice>(
  liveListPortsByDevice,
  mock.listPortsByDevice,
)
export const getPort = pick<typeof mock.getPort>(liveGetPort, mock.getPort)
export const listCables = pick<typeof mock.listCables>(liveListCables, mock.listCables)
export const getFloorplanWithRacks = pick<typeof mock.getFloorplanWithRacks>(
  liveGetFloorplanWithRacks,
  mock.getFloorplanWithRacks,
)
export const createDeviceFromTemplate = pick<typeof mock.createDeviceFromTemplate>(
  liveCreateDeviceFromTemplate,
  mock.createDeviceFromTemplate,
)
export const connectPorts = pick<typeof mock.connectPorts>(liveConnectPorts, mock.connectPorts)
export const updateCableColor = pick<typeof mock.updateCableColor>(
  liveUpdateCableColor,
  mock.updateCableColor,
)
export const disconnectPort = pick<typeof mock.disconnectPort>(
  liveDisconnectPort,
  mock.disconnectPort,
)
export const updateRackPosition = pick<typeof mock.updateRackPosition>(
  liveUpdateRackPosition,
  mock.updateRackPosition,
)
export const createSite = pick<typeof mock.createSite>(liveCreateSite, mock.createSite)
export const updateDevice = pick<typeof mock.updateDevice>(liveUpdateDevice, mock.updateDevice)
export const updatePort = pick<typeof mock.updatePort>(liveUpdatePort, mock.updatePort)
export const deleteDevice = pick<typeof mock.deleteDevice>(liveDeleteDevice, mock.deleteDevice)

export type {
  ConnectPortsInput,
  CreateDeviceFromTemplateInput,
  CreateSiteInput,
  FloorplanWithRacks,
  UpdateCableColorInput,
  UpdateDeviceInput,
  UpdatePortInput,
  UpdateRackPositionInput,
} from './_mock/physical'
