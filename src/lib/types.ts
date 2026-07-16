// Core domain model for IPAM, rack & patch documentation.
// All entity IDs are branded strings to prevent cross-pollination.

type Brand<T, B> = T & { readonly __brand: B }

export type SiteId = Brand<string, 'Site'>
export type RoomId = Brand<string, 'Room'>
export type FloorplanId = Brand<string, 'Floorplan'>
export type RackId = Brand<string, 'Rack'>
export type DeviceId = Brand<string, 'Device'>
export type PortId = Brand<string, 'Port'>
export type CableId = Brand<string, 'Cable'>
export type VrfId = Brand<string, 'Vrf'>
export type VlanId = Brand<string, 'Vlan'>
export type PrefixId = Brand<string, 'Prefix'>
export type IpAddressId = Brand<string, 'IpAddress'>
export type TagId = Brand<string, 'Tag'>
export type RackReservationId = Brand<string, 'RackReservation'>
export type DhcpScopeId = Brand<string, 'DhcpScope'>
export type DnsZoneId = Brand<string, 'DnsZone'>

export type TenantId = Brand<string, 'Tenant'>
export type UserId = Brand<string, 'User'>
export type NoteId = Brand<string, 'Note'>
export type ImageId = Brand<string, 'Image'>
export type DeviceTemplateId = Brand<string, 'DeviceTemplate'>
export type ChangeEventId = Brand<string, 'ChangeEvent'>

export type UserRole = 'admin' | 'editor' | 'viewer'

export type PortState =
  | 'free' // not connected to anything
  | 'connected' // port has a cable
  | 'incomplete' // cable exists but the other end isn't terminated
  | 'patchbox-keystone' // patch panel port with a "Building Connection"
  | 'patchbox-empty' // patch panel slot, no keystone

export type CableColor = 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'cyan' | 'pink' | 'yellow' | 'gray'

export const EntityTypes = [
  'tenant',
  'site',
  'room',
  'floorplan',
  'rack',
  'device',
  'port',
  'cable',
  'prefix',
  'address',
  'template',
] as const
export type EntityType = (typeof EntityTypes)[number]

export const ChangeActions = [
  'create',
  'update',
  'delete',
  'connect',
  'disconnect',
  'note',
  'attach',
  'place',
] as const
export type ChangeAction = (typeof ChangeActions)[number] 

export type FrontBack = 'front' | 'rear'

export interface Site {
  id: SiteId
  tenantId: TenantId
  name: string
  address?: string
  rooms: RoomId[]
  tags: string[]
}

export interface Room {
  id: RoomId
  tenantId: TenantId
  siteId: SiteId
  name: string
  floorplanId: FloorplanId
  tags: string[]
}

export interface Floorplan {
  id: FloorplanId
  tenantId: TenantId
  roomId: RoomId
  name: string
  /** Optional background image (PNG/SVG) drawn behind the racks. */
  imageUrl?: string
  /** Logical canvas size in pixels (used for coordinate scaling). */
  width: number
  height: number
  /** Where racks are placed on this floorplan. */
  rackPositions: RackPosition[]
}

export interface RackPosition {
  rackId: RackId
  /** Origin in floorplan pixel space (top-left of the rack). */
  x: number
  y: number
  rotation: 0 | 90 | 180 | 270
}

export interface Rack {
  id: RackId
  tenantId: TenantId
  roomId: RoomId
  name: string
  uHeight: number
  widthMm?: number
  depthMm?: number
  devices: DeviceId[]
  tags: string[]
  /** Rated power budget in watts (per PDU/feed). Defaults to uHeight * 100W. */
  powerBudgetWatts?: number
}

export interface RackReservation {
  id: RackReservationId
  tenantId: TenantId
  rackId: RackId
  /** 1-indexed U position at the bottom of the reservation. */
  uStart: number
  uHeight: number
  label: string
  /** Hex color for the visual fill (e.g. '#fbbf24'). */
  color: string
  reservedById: UserId
  reservedAt: string
  expectedBy?: string
}

export type DeviceKind =
  | 'switch'
  | 'router'
  | 'firewall'
  | 'server'
  | 'patch-panel'
  | 'pdu'
  | 'kvm'
  | 'console-server'
  | 'blank'
  | 'patchbox-cassette'
  | 'rack-tray'
  | 'cable-manager'
  | 'gateway'
  | 'ups'

export interface Device {
  id: DeviceId
  rackId: RackId
  name: string
  kind: DeviceKind
  model?: string
  vendor?: string
  /** 1-indexed U position at the bottom of the device. */
  uStart: number
  uHeight: number
  face: FrontBack
  ports: PortId[]
  /** Inventory / lifecycle */
  assetTag?: string
  serialNumber?: string
  purchaseDate?: string
  warrantyEol?: string
  /** PSU wattage for power-budget aggregation (e.g. 750). */
  wattage?: number
  /** Free-form tags for filtering. */
  tags: string[]
  /** Per-device custom fields (e.g. mgmtIp: 10.0.0.5). */
  customFields: Record<string, string>
}

export type PortKind =
  | 'rj45-1g'
  | 'rj45-2.5g'
  | 'rj45-5g'
  | 'rj45-10g'
  | 'sfp-1g'
  | 'sfp-plus-10g'
  | 'qsfp-40g'
  | 'qsfp28-100g'
  | 'fiber-lc'
  | 'console-rj45'
  | 'console-usb'
  | 'power-c13'
  | 'power-c19'
  | 'usb-a'

export interface Port {
  id: PortId
  deviceId: DeviceId
  label: string
  kind: PortKind
  /** 1-based position on the device for layout ordering. */
  position: number
  cableId?: CableId | null
  ipAddressId?: IpAddressId | null
  /** Optional VLAN membership. Ports may be untagged or tagged. */
  vlanId?: VlanId | null
  vlanMode?: 'access' | 'trunk' | 'hybrid'
  /** Patchbox cassette configuration (only on patchbox cassette devices). */
  cassette?: PatchboxCassette
}

export interface PatchboxCassette {
  /** 1-based slot number within the cassette. */
  slot: number
  type: 'copper' | 'fiber' | 'empty'
  cableType?: string
  cableLengthM?: number
  cableColorHex?: string
  connectorTop?: string
  connectorBottom?: string
}

export interface Vlan {
  id: VlanId
  tenantId: TenantId
  vrfId?: VrfId
  vid: number // 1-4094
  name: string
  description?: string
}

export type CableKind =
  | 'cat5e'
  | 'cat6'
  | 'cat6a'
  | 'fiber-sm-os2'
  | 'fiber-mm-om3'
  | 'dac'
  | 'power-c13'
  | 'power-c19'
  | 'console-usb'

export interface Cable {
  id: CableId
  kind: CableKind
  lengthM?: number
  label?: string
  portA: PortId
  portB: PortId
  /** User-assigned color for visualization. */
  color?: CableColor | string
}

export interface Vrf {
  id: VrfId
  name: string
  rd?: string
  description?: string
}

export type PrefixRole =
  | 'lan'
  | 'wan'
  | 'mgmt'
  | 'transit'
  | 'loopback'
  | 'p2p'
  | 'reserved'
  | 'dhcp-pool'
  | 'infra'

export interface Prefix {
  id: PrefixId
  vrfId?: VrfId
  cidr: string
  role: PrefixRole
  description?: string
  parentId?: PrefixId
  dhcpScopeId?: DhcpScopeId
  dnsForwardZoneId?: DnsZoneId
  dnsReverseZoneId?: DnsZoneId
  tags: string[]
}

export interface DhcpScope {
  id: DhcpScopeId
  tenantId: TenantId
  name: string
  /** Range of addresses inside the prefix. */
  rangeStart: string
  rangeEnd: string
  leaseSeconds: number
  gateway?: string
  dnsServers: string[]
  options: Array<{ name: string; value: string }>
}

export interface DnsZone {
  id: DnsZoneId
  tenantId: TenantId
  name: string
  /** 'forward' = A/AAAA, 'reverse' = PTR. */
  kind: 'forward' | 'reverse'
  /** Nameservers (SOA-style metadata). */
  primaryNs: string
  adminEmail: string
  ttl: number
}

export type AddressStatus = 'free' | 'assigned' | 'reserved' | 'dhcp' | 'gateway'

export interface IpAddress {
  id: IpAddressId
  prefixId: PrefixId
  address: string
  status: AddressStatus
  dnsName?: string
  description?: string
  assignedPortId?: PortId
  lastSeenAt?: string
}

// === Tenancy ===

export interface Tenant {
  id: TenantId
  name: string
  slug: string
  description?: string
  brandColor?: string
  createdAt: string
}

export interface User {
  id: UserId
  tenantId: TenantId
  name: string
  email: string
  role: UserRole
  avatarColor?: string
}

// === Meta info (notes / images) ===

export interface Note {
  id: NoteId
  tenantId: TenantId
  authorId: UserId
  authorName: string
  body: string
  createdAt: string
  entityType: EntityType
  entityId: string
}

export interface ImageAttachment {
  id: ImageId
  tenantId: TenantId
  authorId: UserId
  authorName: string
  url: string
  caption?: string
  createdAt: string
  entityType: EntityType
  entityId: string
}

// === Device templates ===

export interface PortGroupTemplate {
  kind: import('./types').PortKind
  count: number
  labelPrefix: string
  startIndex?: number
  pad?: number
}

export interface DeviceTemplate {
  id: DeviceTemplateId
  tenantId: TenantId
  name: string
  vendor: string
  model?: string
  kind: DeviceKind
  uHeight: number
  defaultFace: FrontBack
  portGroups: PortGroupTemplate[]
  description?: string
  // Optional image (data: URL) for catalog preview
  imageUrl?: string
}

// === Change tracking ===

export interface ChangeEvent {
  id: ChangeEventId
  tenantId: TenantId
  actorId: UserId
  actorName: string
  action: ChangeAction
  entityType: EntityType
  entityId: string
  summary: string
  createdAt: string
}
