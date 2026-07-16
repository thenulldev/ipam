import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// All ids are TEXT (we use the same string ids as the frontend).

export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  brandColor: text('brand_color'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
})

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  email: text('email').notNull(),
  role: text('role').notNull(), // 'admin' | 'editor' | 'viewer'
  avatarColor: text('avatar_color'),
})

export const sites = sqliteTable('sites', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  address: text('address'),
  tags: text('tags').notNull().default('[]'), // JSON
})

export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  siteId: text('site_id').notNull().references(() => sites.id),
  name: text('name').notNull(),
  floorplanId: text('floorplan_id'),
  tags: text('tags').notNull().default('[]'),
})

export const floorplans = sqliteTable('floorplans', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  roomId: text('room_id').notNull().references(() => rooms.id),
  name: text('name').notNull(),
  imageUrl: text('image_url'),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
})

export const racks = sqliteTable('racks', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  roomId: text('room_id').notNull().references(() => rooms.id),
  name: text('name').notNull(),
  uHeight: integer('u_height').notNull(),
  widthMm: integer('width_mm'),
  depthMm: integer('depth_mm'),
  tags: text('tags').notNull().default('[]'),
  powerBudgetWatts: integer('power_budget_watts'),
})

export const rackPositions = sqliteTable('rack_positions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  floorplanId: text('floorplan_id').notNull().references(() => floorplans.id),
  rackId: text('rack_id').notNull().references(() => racks.id),
  x: integer('x').notNull(),
  y: integer('y').notNull(),
  rotation: integer('rotation').notNull().default(0),
})

export const rackReservations = sqliteTable('rack_reservations', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  rackId: text('rack_id').notNull().references(() => racks.id),
  uStart: integer('u_start').notNull(),
  uHeight: integer('u_height').notNull(),
  label: text('label').notNull(),
  color: text('color').notNull(),
  reservedById: text('reserved_by_id').notNull(),
  reservedAt: text('reserved_at').notNull(),
  expectedBy: text('expected_by'),
})

export const devices = sqliteTable('devices', {
  id: text('id').primaryKey(),
  rackId: text('rack_id').notNull().references(() => racks.id),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  model: text('model'),
  vendor: text('vendor'),
  uStart: integer('u_start').notNull(),
  uHeight: integer('u_height').notNull(),
  face: text('face').notNull().default('front'),
  assetTag: text('asset_tag'),
  serialNumber: text('serial_number'),
  purchaseDate: text('purchase_date'),
  warrantyEol: text('warranty_eol'),
  wattage: integer('wattage'),
  tags: text('tags').notNull().default('[]'),
  customFields: text('custom_fields').notNull().default('{}'),
})

export const ports = sqliteTable('ports', {
  id: text('id').primaryKey(),
  deviceId: text('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  kind: text('kind').notNull(),
  position: integer('position').notNull(),
  cableId: text('cable_id'),
  ipAddressId: text('ip_address_id'),
})

export const cables = sqliteTable('cables', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  lengthM: integer('length_m'), // store as float? SQLite has REAL, drizzle has real()
  label: text('label'),
  portAId: text('port_a_id').notNull().references(() => ports.id),
  portBId: text('port_b_id').notNull().references(() => ports.id),
})

export const vrfs = sqliteTable('vrfs', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  rd: text('rd'),
  description: text('description'),
})

export const prefixes = sqliteTable('prefixes', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  vrfId: text('vrf_id').references(() => vrfs.id),
  cidr: text('cidr').notNull(),
  role: text('role').notNull(),
  description: text('description'),
  parentId: text('parent_id'),
  dhcpScopeId: text('dhcp_scope_id'),
  dnsForwardZoneId: text('dns_forward_zone_id'),
  dnsReverseZoneId: text('dns_reverse_zone_id'),
  tags: text('tags').notNull().default('[]'),
})

export const ipAddresses = sqliteTable('ip_addresses', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  prefixId: text('prefix_id').notNull().references(() => prefixes.id),
  address: text('address').notNull(),
  status: text('status').notNull(), // 'free' | 'assigned' | 'reserved' | 'dhcp' | 'gateway'
  dnsName: text('dns_name'),
  description: text('description'),
  assignedPortId: text('assigned_port_id'),
  lastSeenAt: text('last_seen_at'),
})

export const dhcpScopes = sqliteTable('dhcp_scopes', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  rangeStart: text('range_start').notNull(),
  rangeEnd: text('range_end').notNull(),
  leaseSeconds: integer('lease_seconds').notNull(),
  gateway: text('gateway'),
  dnsServers: text('dns_servers').notNull().default('[]'),
  options: text('options').notNull().default('[]'),
})

export const dnsZones = sqliteTable('dns_zones', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  primaryNs: text('primary_ns').notNull(),
  adminEmail: text('admin_email').notNull(),
  ttl: integer('ttl').notNull(),
})

export const deviceTemplates = sqliteTable('device_templates', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  vendor: text('vendor').notNull(),
  model: text('model'),
  kind: text('kind').notNull(),
  uHeight: integer('u_height').notNull(),
  defaultFace: text('default_face').notNull().default('front'),
  portGroups: text('port_groups').notNull().default('[]'),
  description: text('description'),
  imageUrl: text('image_url'),
})

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  authorId: text('author_id').notNull().references(() => users.id),
  authorName: text('author_name').notNull(),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
})

export const imageAttachments = sqliteTable('image_attachments', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  authorId: text('author_id').notNull().references(() => users.id),
  authorName: text('author_name').notNull(),
  url: text('url').notNull(),
  caption: text('caption'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
})

export const changeEvents = sqliteTable('change_events', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  actorId: text('actor_id').notNull().references(() => users.id),
  actorName: text('actor_name').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  summary: text('summary').notNull(),
  /** JSON snapshot of the entity BEFORE the mutation. NULL for creates. */
  beforeState: text('before_state'),
  /** JSON snapshot of the entity AFTER the mutation. NULL for deletes. */
  afterState: text('after_state'),
  /** Free-form structured context: e.g. {"ip":"10.0.0.5","cidr":"10.0.0.0/24"}. */
  context: text('context'),
  /** 'ok' | 'warn' | 'block' — outcome of the conflict check (when relevant). */
  outcome: text('outcome').notNull().default('ok'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
})