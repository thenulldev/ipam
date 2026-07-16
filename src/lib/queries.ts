import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '@/lib/api'
import { toast } from '@/lib/toast'
import type {
  CableId,
  DeviceId,
  DeviceTemplateId,
  EntityType,
  FloorplanId,
  NoteId,
  ImageId,
  PortId,
  PrefixId,
  RackId,
  RackReservationId,
  RoomId,
  SiteId,
  TenantId,
  UserId,
} from '@/lib/types'

export const qk = {
  sites: () => ['sites'] as const,
  rooms: () => ['rooms'] as const,
  room: (id: RoomId) => ['room', id] as const,
  floorplans: () => ['floorplans'] as const,
  floorplan: (id: FloorplanId) => ['floorplan', id] as const,
  floorplanWithRacks: (id: FloorplanId) => ['floorplan-with-racks', id] as const,
  racks: () => ['racks'] as const,
  rack: (id: RackId) => ['rack', id] as const,
  devices: () => ['devices'] as const,
  devicesByRack: (id: RackId) => ['devices', { rackId: id }] as const,
  device: (id: DeviceId) => ['device', id] as const,
  ports: () => ['ports'] as const,
  portsByDevice: (id: DeviceId) => ['ports', { deviceId: id }] as const,
  port: (id: PortId) => ['port', id] as const,
  cables: () => ['cables'] as const,
  vrfs: () => ['vrfs'] as const,
  prefixes: () => ['prefixes'] as const,
  prefix: (id: PrefixId) => ['prefix', id] as const,
  addresses: () => ['addresses'] as const,
  addressesByPrefix: (id: PrefixId) => ['addresses', { prefixId: id }] as const,

  tenants: () => ['tenants'] as const,
  tenant: (id: TenantId) => ['tenant', id] as const,
  users: (tenantId?: TenantId) => ['users', tenantId ?? 'all'] as const,
  deviceTemplates: (tenantId?: TenantId) =>
    ['device-templates', tenantId ?? 'all'] as const,
  deviceTemplate: (id: DeviceTemplateId) => ['device-template', id] as const,

  notes: (entityType: EntityType, entityId: string) =>
    ['notes', entityType, entityId] as const,
  images: (entityType: EntityType, entityId: string) =>
    ['images', entityType, entityId] as const,
  changeEvents: (tenantId?: TenantId) => ['change-events', tenantId ?? 'all'] as const,
  changeEventsForEntity: (entityType: EntityType, entityId: string) =>
    ['change-events', entityType, entityId] as const,

  rackReservations: (tenantId?: TenantId) =>
    ['reservations', tenantId ?? 'all'] as const,
  dhcpScopes: (tenantId?: TenantId) =>
    ['dhcp-scopes', tenantId ?? 'all'] as const,
  dnsZones: (tenantId?: TenantId) => ['dns-zones', tenantId ?? 'all'] as const,
}

export const useSites = () => useQuery({ queryKey: qk.sites(), queryFn: api.listSites })
export const useSite = (id: SiteId | undefined) =>
  useQuery({
    queryKey: id ? ['site', id] : ['site', 'none'],
    queryFn: () => (id ? api.getSite(id) : Promise.resolve(undefined)),
    enabled: Boolean(id),
  })
export const useRooms = () => useQuery({ queryKey: qk.rooms(), queryFn: api.listRooms })
export const useRoom = (id: RoomId | undefined) =>
  useQuery({
    queryKey: id ? qk.room(id) : ['room', 'none'],
    queryFn: () => (id ? api.getRoom(id) : Promise.resolve(undefined)),
    enabled: Boolean(id),
  })

export const useFloorplans = () =>
  useQuery({ queryKey: qk.floorplans(), queryFn: api.listFloorplans })
export const useFloorplan = (id: FloorplanId | undefined) =>
  useQuery({
    queryKey: id ? qk.floorplan(id) : ['floorplan', 'none'],
    queryFn: () => (id ? api.getFloorplan(id) : Promise.resolve(undefined)),
    enabled: Boolean(id),
  })
export const useFloorplanWithRacks = (id: FloorplanId) =>
  useQuery({ queryKey: qk.floorplanWithRacks(id), queryFn: () => api.getFloorplanWithRacks(id) })

export const useRacks = () => useQuery({ queryKey: qk.racks(), queryFn: api.listRacks })
export const useRack = (id: RackId | undefined) =>
  useQuery({
    queryKey: id ? qk.rack(id) : ['rack', 'none'],
    queryFn: () => (id ? api.getRack(id) : Promise.resolve(undefined)),
    enabled: Boolean(id),
  })

export const useDevices = () =>
  useQuery({ queryKey: qk.devices(), queryFn: api.listDevices })
export const useDevicesByRack = (rackId: RackId | undefined) =>
  useQuery({
    queryKey: rackId ? qk.devicesByRack(rackId) : ['devices', 'none'],
    queryFn: () => (rackId ? api.listDevicesByRack(rackId) : Promise.resolve([])),
    enabled: Boolean(rackId),
  })
export const useDevice = (id: DeviceId | undefined) =>
  useQuery({
    queryKey: id ? qk.device(id) : ['device', 'none'],
    queryFn: () => (id ? api.getDevice(id) : Promise.resolve(undefined)),
    enabled: Boolean(id),
  })

export const usePorts = () => useQuery({ queryKey: qk.ports(), queryFn: api.listPorts })
export const usePortsByDevice = (id: DeviceId | undefined) =>
  useQuery({
    queryKey: id ? qk.portsByDevice(id) : ['ports', 'none'],
    queryFn: () => (id ? api.listPortsByDevice(id) : Promise.resolve([])),
    enabled: Boolean(id),
  })
export const usePort = (id: PortId | undefined) =>
  useQuery({
    queryKey: id ? qk.port(id) : ['port', 'none'],
    queryFn: () => (id ? api.getPort(id) : Promise.resolve(undefined)),
    enabled: Boolean(id),
  })

export const useCables = () => useQuery({ queryKey: qk.cables(), queryFn: api.listCables })

export const useVrfs = () => useQuery({ queryKey: qk.vrfs(), queryFn: api.listVrfs })
export const usePrefixes = () =>
  useQuery({ queryKey: qk.prefixes(), queryFn: api.listPrefixes })
export const usePrefix = (id: PrefixId | undefined) =>
  useQuery({
    queryKey: id ? qk.prefix(id) : ['prefix', 'none'],
    queryFn: () => (id ? api.getPrefix(id) : Promise.resolve(undefined)),
    enabled: Boolean(id),
  })
export const useAddresses = () =>
  useQuery({ queryKey: qk.addresses(), queryFn: api.listAddresses })
export const useAddressesByPrefix = (prefixId: PrefixId | undefined) =>
  useQuery({
    queryKey: prefixId ? qk.addressesByPrefix(prefixId) : ['addresses', 'none'],
    queryFn: () =>
      prefixId ? api.listAddressesByPrefix(prefixId) : Promise.resolve([]),
    enabled: Boolean(prefixId),
  })

// Tenants, users, templates
export const useTenants = () =>
  useQuery({ queryKey: qk.tenants(), queryFn: api.listTenants })
export const useTenant = (id: TenantId | undefined) =>
  useQuery({
    queryKey: id ? qk.tenant(id) : ['tenant', 'none'],
    queryFn: () => (id ? api.getTenant(id) : Promise.resolve(undefined)),
    enabled: Boolean(id),
  })
export const useUsers = (tenantId?: TenantId) =>
  useQuery({
    queryKey: qk.users(tenantId),
    queryFn: () => api.listUsers({ tenantId }),
  })
export const useDeviceTemplates = (tenantId?: TenantId) =>
  useQuery({
    queryKey: qk.deviceTemplates(tenantId),
    queryFn: () => api.listDeviceTemplates(tenantId),
  })
export const useDeviceTemplate = (id: DeviceTemplateId | undefined) =>
  useQuery({
    queryKey: id ? qk.deviceTemplate(id) : ['device-template', 'none'],
    queryFn: () => (id ? api.getDeviceTemplate(id) : Promise.resolve(undefined)),
    enabled: Boolean(id),
  })

// Meta
export const useNotes = (entityType: EntityType, entityId: string | undefined) =>
  useQuery({
    queryKey: entityId ? qk.notes(entityType, entityId) : ['notes', 'none'],
    queryFn: () =>
      entityId ? api.listNotesForEntity(entityType, entityId) : Promise.resolve([]),
    enabled: Boolean(entityId),
  })
export const useImages = (entityType: EntityType, entityId: string | undefined) =>
  useQuery({
    queryKey: entityId ? qk.images(entityType, entityId) : ['images', 'none'],
    queryFn: () =>
      entityId ? api.listImagesForEntity(entityType, entityId) : Promise.resolve([]),
    enabled: Boolean(entityId),
  })

export const useVlans = (tenantId?: TenantId) =>
  useQuery({
    queryKey: ['vlans', tenantId ?? 'all'],
    queryFn: () => api.listVlans({ tenantId }),
  })

export const useChangeEvents = (opts?: {
  tenantId?: TenantId
  limit?: number
}) =>
  useQuery({
    queryKey: qk.changeEvents(opts?.tenantId),
    queryFn: () => api.listChangeEvents(opts),
  })
export const useChangeEventsForEntity = (
  entityType: EntityType,
  entityId: string | undefined,
) =>
  useQuery({
    queryKey: entityId
      ? qk.changeEventsForEntity(entityType, entityId)
      : ['change-events', 'none'],
    queryFn: () =>
      entityId
        ? api.listChangeEventsForEntity(entityType, entityId)
        : Promise.resolve([]),
    enabled: Boolean(entityId),
  })

// === Mutations ===

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: qk.devices() })
  qc.invalidateQueries({ queryKey: qk.ports() })
  qc.invalidateQueries({ queryKey: qk.cables() })
  qc.invalidateQueries({ queryKey: qk.racks() })
  qc.invalidateQueries({ queryKey: qk.devices() })
  qc.invalidateQueries({ queryKey: qk.changeEvents() })
}

export function useCreateSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Parameters<typeof api.createSite>[0]) =>
      api.createSite(input),
    onSuccess: (site) => {
      qc.invalidateQueries({ queryKey: qk.sites() })
      qc.invalidateQueries({ queryKey: qk.changeEvents() })
      toast.success('Site created', site.name)
    },
    onError: (err) => toast.error('Could not create site', String(err)),
  })
}

export function useCreateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Parameters<typeof api.createNote>[0]) =>
      api.createNote(input),
    onSuccess: (note) => {
      qc.invalidateQueries({ queryKey: qk.notes(note.entityType, note.entityId) })
      qc.invalidateQueries({ queryKey: qk.changeEvents() })
      toast.success('Note added')
    },
    onError: (err) => toast.error('Could not add note', String(err)),
  })
}

export function useDeleteNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: NoteId) => api.deleteNote(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes'] })
      qc.invalidateQueries({ queryKey: qk.changeEvents() })
      toast.info('Note removed')
    },
    onError: (err) => toast.error('Could not remove note', String(err)),
  })
}

export function useCreateImage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Parameters<typeof api.createImage>[0]) =>
      api.createImage(input),
    onSuccess: (image) => {
      qc.invalidateQueries({ queryKey: qk.images(image.entityType, image.entityId) })
      qc.invalidateQueries({ queryKey: qk.changeEvents() })
      toast.success('Image attached')
    },
    onError: (err) => toast.error('Could not attach image', String(err)),
  })
}

export function useDeleteImage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: ImageId) => api.deleteImage(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['images'] })
      qc.invalidateQueries({ queryKey: qk.changeEvents() })
      toast.info('Image removed')
    },
    onError: (err) => toast.error('Could not remove image', String(err)),
  })
}

// Reservations, DHCP, DNS
export const useReservations = (tenantId?: TenantId) =>
  useQuery({
    queryKey: qk.rackReservations(tenantId),
    queryFn: () => api.listReservations({ tenantId }),
  })
export const useDhcpScopes = (tenantId?: TenantId) =>
  useQuery({
    queryKey: qk.dhcpScopes(tenantId),
    queryFn: () => api.listDhcpScopes({ tenantId }),
  })
export const useDnsZones = (tenantId?: TenantId) =>
  useQuery({
    queryKey: qk.dnsZones(tenantId),
    queryFn: () => api.listDnsZones({ tenantId }),
  })

export function useCreateReservation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.CreateReservationInput) => api.createReservation(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations'] })
      qc.invalidateQueries({ queryKey: qk.changeEvents() })
      toast.success('U-range reserved')
    },
    onError: (err) => toast.error('Could not reserve', String(err)),
  })
}

export function useDeleteReservation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      id: RackReservationId
      actorId: UserId
      actorName: string
      tenantId: TenantId
    }) => api.deleteReservation(input.id, input.actorId, input.actorName, input.tenantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations'] })
      qc.invalidateQueries({ queryKey: qk.changeEvents() })
      toast.info('Reservation released')
    },
    onError: (err) => toast.error('Could not release', String(err)),
  })
}

export function useCreateDeviceFromTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.CreateDeviceFromTemplateInput) =>
      api.createDeviceFromTemplate(input),
    onSuccess: () => {
      invalidateAll(qc)
      toast.success('Device created')
    },
    onError: (err) => toast.error('Could not create device', String(err)),
  })
}

export function useUpdateDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.UpdateDeviceInput) => api.updateDevice(input),
    onSuccess: (dev) => {
      invalidateAll(qc)
      qc.invalidateQueries({ queryKey: qk.device(dev.id) })
      toast.success('Device updated', dev.name)
    },
    onError: (err) => toast.error('Could not update device', String(err)),
  })
}

export function useUpdatePort() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.UpdatePortInput) => api.updatePort(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.ports() })
      qc.invalidateQueries({ queryKey: qk.changeEvents() })
      toast.success('Port updated')
    },
    onError: (err) => toast.error('Could not update port', String(err)),
  })
}

export function useDeleteDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: DeviceId; actorId: import('@/lib/types').UserId; actorName: string; tenantId: TenantId }) =>
      api.deleteDevice(input.id, input.actorId, input.actorName, input.tenantId),
    onSuccess: () => {
      invalidateAll(qc)
      toast.info('Device removed')
    },
    onError: (err) => toast.error('Could not remove device', String(err)),
  })
}

export function useConnectPorts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.ConnectPortsInput) => api.connectPorts(input),
    onSuccess: (cable) => {
      invalidateAll(qc)
      toast.success('Cable connected', cable.label ?? cable.id)
    },
    onError: (err) => toast.error('Could not connect ports', String(err)),
  })
}

export function useUpdateCableColor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.UpdateCableColorInput) =>
      api.updateCableColor(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.cables() })
      qc.invalidateQueries({ queryKey: qk.changeEvents() })
      toast.success('Cable color updated')
    },
    onError: (err) => toast.error('Could not update color', String(err)),
  })
}

export function useDisconnectPort() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      cableId: CableId
      actorId: import('@/lib/types').UserId
      actorName: string
      tenantId: TenantId
    }) => api.disconnectPort(input.cableId, input.actorId, input.actorName, input.tenantId),
    onSuccess: () => {
      invalidateAll(qc)
      toast.info('Cable disconnected')
    },
    onError: (err) => toast.error('Could not disconnect', String(err)),
  })
}

export function useUpdateRackPosition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.UpdateRackPositionInput) => api.updateRackPosition(input),
    onSuccess: (_fp, vars) => {
      qc.invalidateQueries({ queryKey: qk.floorplanWithRacks(vars.floorplanId) })
      qc.invalidateQueries({ queryKey: qk.floorplan(vars.floorplanId) })
      qc.invalidateQueries({ queryKey: qk.changeEvents() })
      // silent — repositioning is frequent
    },
    onError: (err) => toast.error('Could not move rack', String(err)),
  })
}

export function useAssignAddress() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.AssignAddressInput) => api.assignAddress(input),
    onSuccess: (addr) => {
      qc.invalidateQueries({ queryKey: qk.addresses() })
      qc.invalidateQueries({ queryKey: qk.ports() })
      qc.invalidateQueries({ queryKey: qk.changeEvents() })
      qc.invalidateQueries({ queryKey: ['notes', 'address', addr.id] })
      toast.success('IP assigned', addr.address)
    },
    onError: (err) => toast.error('Could not assign IP', String(err)),
  })
}

export function useUnassignAddress() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.UnassignAddressInput) => api.unassignAddress(input),
    onSuccess: (addr) => {
      qc.invalidateQueries({ queryKey: qk.addresses() })
      qc.invalidateQueries({ queryKey: qk.ports() })
      qc.invalidateQueries({ queryKey: qk.changeEvents() })
      toast.info('IP unassigned', addr.address)
    },
    onError: (err) => toast.error('Could not unassign IP', String(err)),
  })
}