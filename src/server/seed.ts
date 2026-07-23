import { db } from './db'
import {
  tenants,
  users,
  sites,
  rooms,
  floorplans,
  racks,
  rackPositions,
  rackReservations,
  devices,
  ports,
  cables,
  vrfs,
  vlans,
  prefixes,
  ipAddresses,
  dhcpScopes,
  dnsZones,
  deviceTemplates,
  notes,
  imageAttachments,
  changeEvents,
} from './schema'
import * as mock from '../lib/mock'
import { DEV_DEFAULT_PASSWORD, hashPassword } from './auth'

interface Counts {
  tenants: number
  racks: number
  devices: number
  ports: number
  cables: number
}

export function seedIfEmpty(): Counts {
  const existing = db.select().from(tenants).all()
  if (existing.length > 0) {
    if (db.select().from(vlans).all().length === 0) {
      for (const vlan of mock.vlans) {
        db.insert(vlans).values({
          id: vlan.id,
          tenantId: vlan.tenantId,
          vrfId: vlan.vrfId ?? null,
          vid: vlan.vid,
          name: vlan.name,
          description: vlan.description ?? null,
        }).run()
      }
    }
    return {
      tenants: existing.length,
      racks: db.select().from(racks).all().length,
      devices: db.select().from(devices).all().length,
      ports: db.select().from(ports).all().length,
      cables: db.select().from(cables).all().length,
    }
  }

  // Tenants
  for (const t of mock.tenants) {
    db.insert(tenants).values({
      id: t.id,
      name: t.name,
      slug: t.slug,
      description: t.description ?? null,
      brandColor: t.brandColor ?? null,
      createdAt: t.createdAt,
    }).run()
  }
  const devPasswordHash = hashPassword(DEV_DEFAULT_PASSWORD)
  for (const u of mock.users) {
    db.insert(users).values({
      id: u.id,
      tenantId: u.tenantId,
      name: u.name,
      email: u.email,
      role: u.role,
      avatarColor: u.avatarColor ?? null,
      passwordHash: devPasswordHash,
    }).run()
  }
  // eslint-disable-next-line no-console
  console.log(
    `[ipam] seeded ${mock.users.length} users with DEV password "${DEV_DEFAULT_PASSWORD}" — ` +
      `change before any non-local environment.`,
  )
  for (const s of mock.sites) {
    db.insert(sites).values({
      id: s.id,
      tenantId: s.tenantId,
      name: s.name,
      address: s.address ?? null,
      tags: JSON.stringify(s.tags),
    }).run()
  }
  for (const r of mock.rooms) {
    db.insert(rooms).values({
      id: r.id,
      tenantId: r.tenantId,
      siteId: r.siteId,
      name: r.name,
      floorplanId: r.floorplanId,
      tags: JSON.stringify(r.tags),
    }).run()
  }
  for (const f of mock.floorplans) {
    db.insert(floorplans).values({
      id: f.id,
      tenantId: f.tenantId,
      roomId: f.roomId,
      name: f.name,
      imageUrl: f.imageUrl ?? null,
      width: f.width,
      height: f.height,
    }).run()
  }
  for (const r of mock.racks) {
    db.insert(racks).values({
      id: r.id,
      tenantId: r.tenantId,
      roomId: r.roomId,
      name: r.name,
      uHeight: r.uHeight,
      widthMm: r.widthMm ?? null,
      depthMm: r.depthMm ?? null,
      tags: JSON.stringify(r.tags),
      powerBudgetWatts: r.powerBudgetWatts ?? null,
    }).run()
  }
  for (const f of mock.floorplans) {
    for (const p of f.rackPositions) {
      db.insert(rackPositions).values({
        floorplanId: f.id,
        rackId: p.rackId,
        x: p.x,
        y: p.y,
        rotation: p.rotation,
      }).run()
    }
  }
  for (const r of mock.rackReservations) {
    db.insert(rackReservations).values({
      id: r.id,
      tenantId: r.tenantId,
      rackId: r.rackId,
      uStart: r.uStart,
      uHeight: r.uHeight,
      label: r.label,
      color: r.color,
      reservedById: r.reservedById,
      reservedAt: r.reservedAt,
      expectedBy: r.expectedBy ?? null,
    }).run()
  }
  for (const d of mock.devices) {
    db.insert(devices).values({
      id: d.id,
      rackId: d.rackId,
      name: d.name,
      kind: d.kind,
      model: d.model ?? null,
      vendor: d.vendor ?? null,
      uStart: d.uStart,
      uHeight: d.uHeight,
      face: d.face,
      assetTag: d.assetTag ?? null,
      serialNumber: d.serialNumber ?? null,
      purchaseDate: null,
      warrantyEol: d.warrantyEol ?? null,
      wattage: d.wattage ?? null,
      tags: JSON.stringify(d.tags),
      customFields: JSON.stringify(d.customFields),
    }).run()
  }
  for (const p of mock.ports) {
    db.insert(ports).values({
      id: p.id,
      deviceId: p.deviceId,
      label: p.label,
      kind: p.kind,
      position: p.position,
      cableId: p.cableId ?? null,
      ipAddressId: p.ipAddressId ?? null,
    }).run()
  }
  for (const c of mock.cables) {
    db.insert(cables).values({
      id: c.id,
      kind: c.kind,
      lengthM: c.lengthM ?? null,
      label: c.label ?? null,
      portAId: c.portA,
      portBId: c.portB,
    }).run()
  }
  for (const v of mock.vrfs) {
    db.insert(vrfs).values({
      id: v.id,
      tenantId: 'tenant-internal', // mock vrfs don't have tenantId; default
      name: v.name,
      rd: v.rd ?? null,
      description: v.description ?? null,
    }).run()
  }
  for (const v of mock.vlans) {
    db.insert(vlans).values({
      id: v.id,
      tenantId: v.tenantId,
      vrfId: v.vrfId ?? null,
      vid: v.vid,
      name: v.name,
      description: v.description ?? null,
    }).run()
  }
  for (const p of mock.prefixes) {
    db.insert(prefixes).values({
      id: p.id,
      tenantId: 'tenant-internal', // mock doesn't have tenantId on prefixes; default to internal
      vrfId: p.vrfId ?? null,
      cidr: p.cidr,
      role: p.role,
      description: p.description ?? null,
      parentId: p.parentId ?? null,
      dhcpScopeId: p.dhcpScopeId ?? null,
      dnsForwardZoneId: p.dnsForwardZoneId ?? null,
      dnsReverseZoneId: p.dnsReverseZoneId ?? null,
      tags: JSON.stringify(p.tags),
    }).run()
  }
  for (const a of mock.addresses) {
    db.insert(ipAddresses).values({
      id: a.id,
      tenantId: 'tenant-internal',
      prefixId: a.prefixId,
      address: a.address,
      status: a.status,
      dnsName: a.dnsName ?? null,
      description: a.description ?? null,
      assignedPortId: a.assignedPortId ?? null,
      lastSeenAt: a.lastSeenAt ?? null,
    }).run()
  }
  for (const s of mock.dhcpScopes) {
    db.insert(dhcpScopes).values({
      id: s.id,
      tenantId: s.tenantId,
      name: s.name,
      rangeStart: s.rangeStart,
      rangeEnd: s.rangeEnd,
      leaseSeconds: s.leaseSeconds,
      gateway: s.gateway ?? null,
      dnsServers: JSON.stringify(s.dnsServers),
      options: JSON.stringify(s.options),
    }).run()
  }
  for (const z of mock.dnsZones) {
    db.insert(dnsZones).values({
      id: z.id,
      tenantId: z.tenantId,
      name: z.name,
      kind: z.kind,
      primaryNs: z.primaryNs,
      adminEmail: z.adminEmail,
      ttl: z.ttl,
    }).run()
  }
  for (const t of mock.deviceTemplates) {
    db.insert(deviceTemplates).values({
      id: t.id,
      tenantId: t.tenantId,
      name: t.name,
      vendor: t.vendor,
      model: t.model ?? null,
      kind: t.kind,
      uHeight: t.uHeight,
      defaultFace: t.defaultFace,
      portGroups: JSON.stringify(t.portGroups),
      description: t.description ?? null,
      imageUrl: t.imageUrl ?? null,
    }).run()
  }
  for (const n of mock.notes) {
    db.insert(notes).values({
      id: n.id,
      tenantId: n.tenantId,
      authorId: n.authorId,
      authorName: n.authorName,
      body: n.body,
      createdAt: n.createdAt,
      entityType: n.entityType,
      entityId: n.entityId,
    }).run()
  }
  for (const i of mock.images) {
    db.insert(imageAttachments).values({
      id: i.id,
      tenantId: i.tenantId,
      authorId: i.authorId,
      authorName: i.authorName,
      url: i.url,
      caption: i.caption ?? null,
      createdAt: i.createdAt,
      entityType: i.entityType,
      entityId: i.entityId,
    }).run()
  }
  for (const e of mock.changeEvents) {
    db.insert(changeEvents).values({
      id: e.id,
      tenantId: e.tenantId,
      actorId: e.actorId,
      actorName: e.actorName,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      summary: e.summary,
      createdAt: e.createdAt,
    }).run()
  }

  return {
    tenants: mock.tenants.length,
    racks: mock.racks.length,
    devices: mock.devices.length,
    ports: mock.ports.length,
    cables: mock.cables.length,
  }
}

