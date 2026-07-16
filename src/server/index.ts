import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { db, countsByTenant } from './db'
import { seedIfEmpty } from './seed'
import { emitChange } from './meta'
import {
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
  prefixes,
  ipAddresses,
  notes,
  changeEvents,
  imageAttachments,
  dhcpScopes,
  dnsZones,
  deviceTemplates,
  tenants,
  users,
} from './schema'
import { and, eq } from 'drizzle-orm'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const UPLOAD_DIR =
  process.env.IPAM_UPLOAD_DIR ?? join(__dirname, '..', '..', 'data', 'uploads')
mkdirSync(UPLOAD_DIR, { recursive: true })

const app = new Hono()

const seedCounts = seedIfEmpty()

app.get('/', (c) =>
  c.json({
    name: 'IPAM backend',
    seeded: seedCounts,
    rows: countsByTenant(),
  }),
)

// === Static uploads ===
app.use(
  '/uploads/*',
  serveStatic({
    root: './',
    rewriteRequestPath: (p) => p.replace(/^\/uploads/, '/data/uploads'),
  }),
)

// === Reads ===

app.get('/api/tenants', (c) => c.json(db.select().from(tenants).all()))
app.get('/api/users', (c) => c.json(db.select().from(users).all()))
app.get('/api/sites', (c) => c.json(db.select().from(sites).all()))
app.get('/api/rooms', (c) => c.json(db.select().from(rooms).all()))
app.get('/api/floorplans', (c) => c.json(db.select().from(floorplans).all()))
app.get('/api/floorplan-positions', (c) =>
  c.json(db.select().from(rackPositions).all()),
)
app.get('/api/racks', (c) => c.json(db.select().from(racks).all()))
app.get('/api/devices', (c) => c.json(db.select().from(devices).all()))
app.get('/api/ports', (c) => c.json(db.select().from(ports).all()))
app.get('/api/cables', (c) => c.json(db.select().from(cables).all()))
app.get('/api/vrfs', (c) => c.json(db.select().from(vrfs).all()))
app.get('/api/prefixes', (c) => c.json(db.select().from(prefixes).all()))
app.get('/api/addresses', (c) => c.json(db.select().from(ipAddresses).all()))
app.get('/api/ip-addresses', (c) => c.json(db.select().from(ipAddresses).all()))
app.get('/api/notes', (c) => c.json(db.select().from(notes).all()))
app.get('/api/images', (c) => c.json(db.select().from(imageAttachments).all()))
app.get('/api/change-events', (c) =>
  c.json(db.select().from(changeEvents).all()),
)
app.get('/api/reservations', (c) =>
  c.json(db.select().from(rackReservations).all()),
)
app.get('/api/dhcp-scopes', (c) => c.json(db.select().from(dhcpScopes).all()))
app.get('/api/dns-zones', (c) => c.json(db.select().from(dnsZones).all()))
app.get('/api/device-templates', (c) =>
  c.json(db.select().from(deviceTemplates).all()),
)

// === Validation helpers ===

function badRequest(c: { json: (body: unknown, status?: number) => Response }, details: unknown) {
  return c.json({ message: 'Validation failed', details }, 400)
}

function parseJson<T>(schema: z.ZodType<T>, value: unknown): { ok: true; data: T } | { ok: false; error: z.ZodError } {
  const result = schema.safeParse(value)
  if (!result.success) return { ok: false, error: result.error }
  return { ok: true, data: result.data }
}

const IdLike = z.string().min(1)

const createSiteSchema = z.object({
  id: IdLike.optional(),
  tenantId: IdLike,
  name: z.string().min(1),
  address: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
})

app.post('/api/sites', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = parseJson(createSiteSchema, body)
  if (!parsed.ok) return badRequest(c, parsed.error.flatten())
  const data = parsed.data
  const id = data.id ?? `site-${Date.now().toString(36)}`
  db.insert(sites)
    .values({
      id,
      tenantId: data.tenantId,
      name: data.name,
      address: data.address ?? null,
      tags: JSON.stringify(data.tags ?? []),
    })
    .run()
  return c.json({ id, ...data }, 201)
})

const createRoomSchema = z.object({
  id: IdLike.optional(),
  tenantId: IdLike,
  siteId: IdLike,
  name: z.string().min(1),
  floorplanId: IdLike.optional().nullable(),
  tags: z.array(z.string()).optional(),
})

app.post('/api/rooms', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = parseJson(createRoomSchema, body)
  if (!parsed.ok) return badRequest(c, parsed.error.flatten())
  const data = parsed.data
  const id = data.id ?? `room-${Date.now().toString(36)}`
  db.insert(rooms)
    .values({
      id,
      tenantId: data.tenantId,
      siteId: data.siteId,
      name: data.name,
      floorplanId: data.floorplanId ?? null,
      tags: JSON.stringify(data.tags ?? []),
    })
    .run()
  return c.json({ id, ...data }, 201)
})

const createFloorplanSchema = z.object({
  id: IdLike.optional(),
  tenantId: IdLike,
  roomId: IdLike,
  name: z.string().min(1),
  imageUrl: z.string().nullable().optional(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
})

app.post('/api/floorplans', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = parseJson(createFloorplanSchema, body)
  if (!parsed.ok) return badRequest(c, parsed.error.flatten())
  const data = parsed.data
  const id = data.id ?? `fp-${Date.now().toString(36)}`
  db.insert(floorplans)
    .values({
      id,
      tenantId: data.tenantId,
      roomId: data.roomId,
      name: data.name,
      imageUrl: data.imageUrl ?? null,
      width: data.width,
      height: data.height,
    })
    .run()
  return c.json({ id, ...data }, 201)
})

const floorplanPositionSchema = z.object({
  floorplanId: IdLike,
  rackId: IdLike,
  x: z.number().int(),
  y: z.number().int(),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
  actorId: IdLike.optional(),
  actorName: z.string().optional(),
  tenantId: IdLike.optional(),
})

app.post('/api/floorplan-positions', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = parseJson(floorplanPositionSchema, body)
  if (!parsed.ok) return badRequest(c, parsed.error.flatten())
  const data = parsed.data
  const existing = db
    .select()
    .from(rackPositions)
    .where(
      and(
        eq(rackPositions.floorplanId, data.floorplanId),
        eq(rackPositions.rackId, data.rackId),
      ),
    )
    .all()
  if (existing.length > 0) {
    db.update(rackPositions)
      .set({
        x: data.x,
        y: data.y,
        rotation: data.rotation ?? 0,
      })
      .where(
        and(
          eq(rackPositions.floorplanId, data.floorplanId),
          eq(rackPositions.rackId, data.rackId),
        ),
      )
      .run()
  } else {
    db.insert(rackPositions)
      .values({
        floorplanId: data.floorplanId,
        rackId: data.rackId,
        x: data.x,
        y: data.y,
        rotation: data.rotation ?? 0,
      })
      .run()
  }
  if (data.tenantId && data.actorId && data.actorName) {
    emitChange({
      tenantId: data.tenantId,
      actorId: data.actorId,
      actorName: data.actorName,
      action: 'place',
      entityType: 'rack',
      entityId: data.rackId,
      summary: `Moved rack ${data.rackId} to (${data.x}, ${data.y})`,
    })
  }
  return c.json({ ok: true }, 200)
})

const rackPositionSchema = z.object({
  floorplanId: IdLike,
  rackId: IdLike,
  x: z.number().int(),
  y: z.number().int(),
  actorId: IdLike.optional(),
  actorName: z.string().optional(),
  tenantId: IdLike.optional(),
})

app.patch('/api/rack-positions', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = parseJson(rackPositionSchema, body)
  if (!parsed.ok) return badRequest(c, parsed.error.flatten())
  const data = parsed.data
  const existing = db
    .select()
    .from(rackPositions)
    .where(
      and(
        eq(rackPositions.floorplanId, data.floorplanId),
        eq(rackPositions.rackId, data.rackId),
      ),
    )
    .all()
  if (existing.length === 0) {
    db.insert(rackPositions)
      .values({
        floorplanId: data.floorplanId,
        rackId: data.rackId,
        x: data.x,
        y: data.y,
        rotation: 0,
      })
      .run()
  } else {
    db.update(rackPositions)
      .set({ x: data.x, y: data.y })
      .where(
        and(
          eq(rackPositions.floorplanId, data.floorplanId),
          eq(rackPositions.rackId, data.rackId),
        ),
      )
      .run()
  }
  if (data.tenantId && data.actorId && data.actorName) {
    emitChange({
      tenantId: data.tenantId,
      actorId: data.actorId,
      actorName: data.actorName,
      action: 'place',
      entityType: 'rack',
      entityId: data.rackId,
      summary: `Moved rack ${data.rackId} to (${data.x}, ${data.y})`,
    })
  }
  return c.json({ ok: true })
})

const createRackSchema = z.object({
  id: IdLike.optional(),
  tenantId: IdLike,
  roomId: IdLike,
  name: z.string().min(1),
  uHeight: z.number().int().positive(),
  widthMm: z.number().int().nullable().optional(),
  depthMm: z.number().int().nullable().optional(),
  tags: z.array(z.string()).optional(),
  powerBudgetWatts: z.number().int().nullable().optional(),
})

app.post('/api/racks', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = parseJson(createRackSchema, body)
  if (!parsed.ok) return badRequest(c, parsed.error.flatten())
  const data = parsed.data
  const id = data.id ?? `rack-${Date.now().toString(36)}`
  db.insert(racks)
    .values({
      id,
      tenantId: data.tenantId,
      roomId: data.roomId,
      name: data.name,
      uHeight: data.uHeight,
      widthMm: data.widthMm ?? null,
      depthMm: data.depthMm ?? null,
      tags: JSON.stringify(data.tags ?? []),
      powerBudgetWatts: data.powerBudgetWatts ?? null,
    })
    .run()
  return c.json({ id, ...data }, 201)
})

const patchRackSchema = z.object({
  name: z.string().min(1).optional(),
  uHeight: z.number().int().positive().optional(),
  widthMm: z.number().int().nullable().optional(),
  depthMm: z.number().int().nullable().optional(),
  tags: z.array(z.string()).optional(),
  powerBudgetWatts: z.number().int().nullable().optional(),
})

app.patch('/api/racks/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  const parsed = parseJson(patchRackSchema, body)
  if (!parsed.ok) return badRequest(c, parsed.error.flatten())
  const data = parsed.data
  const update: Record<string, unknown> = {}
  if (data.name !== undefined) update.name = data.name
  if (data.uHeight !== undefined) update.uHeight = data.uHeight
  if (data.widthMm !== undefined) update.widthMm = data.widthMm
  if (data.depthMm !== undefined) update.depthMm = data.depthMm
  if (data.tags !== undefined) update.tags = JSON.stringify(data.tags)
  if (data.powerBudgetWatts !== undefined)
    update.powerBudgetWatts = data.powerBudgetWatts
  if (Object.keys(update).length === 0) return c.json({ id })
  db.update(racks).set(update).where(eq(racks.id, id)).run()
  return c.json({ id, ...data })
})

const patchDeviceSchema = z.object({
  name: z.string().optional(),
  model: z.string().nullable().optional(),
  vendor: z.string().nullable().optional(),
  uStart: z.number().int().optional(),
  uHeight: z.number().int().optional(),
  face: z.union([z.literal('front'), z.literal('rear')]).optional(),
  assetTag: z.string().nullable().optional(),
  serialNumber: z.string().nullable().optional(),
  warrantyEol: z.string().nullable().optional(),
  wattage: z.number().int().nullable().optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.string()).optional(),
})

app.patch('/api/devices/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  const parsed = parseJson(patchDeviceSchema, body)
  if (!parsed.ok) return badRequest(c, parsed.error.flatten())
  const data = parsed.data
  const update: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue
    if (k === 'tags') update.tags = JSON.stringify(v)
    else if (k === 'customFields') update.customFields = JSON.stringify(v)
    else update[k] = v
  }
  if (Object.keys(update).length === 0) return c.json({ id })
  db.update(devices).set(update).where(eq(devices.id, id)).run()
  return c.json({ id, ...data })
})

app.delete('/api/devices/:id', (c) => {
  const id = c.req.param('id')
  // Clean up dependent rows: ports (cascade), cables referencing them, addresses
  const devicePorts = db.select().from(ports).where(eq(ports.deviceId, id)).all()
  for (const p of devicePorts) {
    if (p.cableId) {
      db.delete(cables).where(eq(cables.id, p.cableId)).run()
    }
    if (p.ipAddressId) {
      db.update(ipAddresses)
        .set({ assignedPortId: null, status: 'free' })
        .where(eq(ipAddresses.id, p.ipAddressId))
        .run()
    }
  }
  db.delete(devices).where(eq(devices.id, id)).run()
  return c.json({ ok: true })
})

const portGroupTemplateSchema = z.object({
  kind: z.string(),
  count: z.number().int().positive(),
  labelPrefix: z.string(),
  startIndex: z.number().int().optional(),
  pad: z.number().int().optional(),
})

const createDeviceFromTemplateSchema = z.object({
  id: IdLike.optional(),
  tenantId: IdLike,
  templateId: IdLike,
  rackId: IdLike,
  name: z.string().min(1),
  uStart: z.number().int().positive(),
  face: z.union([z.literal('front'), z.literal('rear')]).optional(),
  actorId: IdLike.optional(),
  actorName: z.string().optional(),
})

function generatePortsForDevice(
  deviceId: string,
  portGroups: Array<{
    kind: string
    count: number
    labelPrefix: string
    startIndex?: number
    pad?: number
  }>,
): Array<{
  id: string
  deviceId: string
  label: string
  kind: string
  position: number
  cableId: string | null
  ipAddressId: string | null
}> {
  const out: Array<{
    id: string
    deviceId: string
    label: string
    kind: string
    position: number
    cableId: string | null
    ipAddressId: string | null
  }> = []
  let position = 1
  for (const group of portGroups) {
    const pad = group.pad ?? 2
    const startIndex = group.startIndex ?? 1
    for (let i = 0; i < group.count; i++) {
      const idx = startIndex + i
      const portId = `port-${randomUUID().slice(0, 8)}`
      out.push({
        id: portId,
        deviceId,
        label: `${group.labelPrefix}${idx.toString().padStart(pad, '0')}`,
        kind: group.kind,
        position: position++,
        cableId: null,
        ipAddressId: null,
      })
    }
  }
  return out
}

function createDeviceFromTemplateHandler(c: { json: (b: unknown, s?: number) => Response; req: { json: () => Promise<unknown> } }) {
  return (async () => {
    const body = await c.req.json().catch(() => null)
    const parsed = parseJson(createDeviceFromTemplateSchema, body)
    if (!parsed.ok) return badRequest(c, parsed.error.flatten())
    const data = parsed.data
    const tpl = db
      .select()
      .from(deviceTemplates)
      .where(eq(deviceTemplates.id, data.templateId))
      .get()
    if (!tpl) return c.json({ message: 'Template not found' }, 404)
    const rack = db.select().from(racks).where(eq(racks.id, data.rackId)).get()
    if (!rack) return c.json({ message: 'Rack not found' }, 404)

    const deviceId = data.id ?? `dev-${randomUUID().slice(0, 8)}`
    const portGroupsParsed = z.array(portGroupTemplateSchema).safeParse(
      JSON.parse(tpl.portGroups) as unknown,
    )
    const portGroups = portGroupsParsed.success ? portGroupsParsed.data : []
    const portsToCreate = generatePortsForDevice(deviceId, portGroups)

    db.insert(devices)
      .values({
        id: deviceId,
        rackId: data.rackId,
        name: data.name,
        kind: tpl.kind,
        model: tpl.model ?? null,
        vendor: tpl.vendor,
        uStart: data.uStart,
        uHeight: tpl.uHeight,
        face: data.face ?? (tpl.defaultFace as 'front' | 'rear'),
        assetTag: null,
        serialNumber: null,
        purchaseDate: null,
        warrantyEol: null,
        wattage: null,
        tags: JSON.stringify([]),
        customFields: JSON.stringify({}),
      })
      .run()
    for (const p of portsToCreate) {
      db.insert(ports).values(p).run()
    }
    if (data.tenantId && data.actorId && data.actorName) {
      emitChange({
        tenantId: data.tenantId,
        actorId: data.actorId,
        actorName: data.actorName,
        action: 'create',
        entityType: 'device',
        entityId: deviceId,
        summary: `Created device ${data.name} on rack ${rack.name} (template: ${tpl.name})`,
      })
    }
    const inserted = db.select().from(devices).where(eq(devices.id, deviceId)).get()
    return c.json({ ...inserted, ports: portsToCreate.map((p) => p.id) }, 201)
  })()
}

type Handler = (c: import('hono').Context) => Response | Promise<Response>

const deviceCreationHandler = createDeviceFromTemplateHandler as unknown as Handler
app.post('/api/devices', deviceCreationHandler)
app.post('/api/devices/with-template', deviceCreationHandler)

const createCableSchema = z.object({
  id: IdLike.optional(),
  kind: z.string().min(1),
  portAId: IdLike,
  portBId: IdLike,
  lengthM: z.number().nullable().optional(),
  label: z.string().nullable().optional(),
  actorId: IdLike.optional(),
  actorName: z.string().optional(),
  tenantId: IdLike.optional(),
})

app.post('/api/cables', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = parseJson(createCableSchema, body)
  if (!parsed.ok) return badRequest(c, parsed.error.flatten())
  const data = parsed.data
  const portA = db.select().from(ports).where(eq(ports.id, data.portAId)).get()
  const portB = db.select().from(ports).where(eq(ports.id, data.portBId)).get()
  if (!portA || !portB) return c.json({ message: 'Port not found' }, 404)
  if (portA.cableId || portB.cableId)
    return c.json({ message: 'Port already connected' }, 409)
  const id = data.id ?? `cable-${randomUUID().slice(0, 8)}`
  db.insert(cables)
    .values({
      id,
      kind: data.kind,
      lengthM: data.lengthM ?? null,
      label: data.label ?? null,
      portAId: data.portAId,
      portBId: data.portBId,
    })
    .run()
  db.update(ports).set({ cableId: id }).where(eq(ports.id, data.portAId)).run()
  db.update(ports).set({ cableId: id }).where(eq(ports.id, data.portBId)).run()
  if (data.tenantId && data.actorId && data.actorName) {
    emitChange({
      tenantId: data.tenantId,
      actorId: data.actorId,
      actorName: data.actorName,
      action: 'connect',
      entityType: 'cable',
      entityId: id,
      summary: `Connected cable "${data.label ?? id}" to ${portA.label} ↔ ${portB.label}`,
    })
  }
  return c.json({ id, kind: data.kind, lengthM: data.lengthM, label: data.label, portA: data.portAId, portB: data.portBId }, 201)
})

app.delete('/api/cables/:id', (c) => {
  const id = c.req.param('id')
  const cable = db.select().from(cables).where(eq(cables.id, id)).get()
  if (!cable) return c.json({ ok: true })
  db.update(ports).set({ cableId: null }).where(eq(ports.id, cable.portAId)).run()
  db.update(ports).set({ cableId: null }).where(eq(ports.id, cable.portBId)).run()
  db.delete(cables).where(eq(cables.id, id)).run()
  return c.json({ ok: true })
})

const patchCableSchema = z.object({
  color: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  lengthM: z.number().nullable().optional(),
})

app.patch('/api/cables/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  const parsed = parseJson(patchCableSchema, body)
  if (!parsed.ok) return badRequest(c, parsed.error.flatten())
  const data = parsed.data
  // The 'color' field isn't in the cable schema but is supported by the mock
  // client; store it as part of label JSON-encoded suffix for round-tripping.
  const update: Record<string, unknown> = {}
  if (data.label !== undefined) update.label = data.label
  if (data.lengthM !== undefined) update.lengthM = data.lengthM
  if (Object.keys(update).length > 0) {
    db.update(cables).set(update).where(eq(cables.id, id)).run()
  }
  return c.json({ id, ...data })
})

const patchPortSchema = z.object({
  label: z.string().optional(),
  vlanId: IdLike.nullable().optional(),
  vlanMode: z.enum(['access', 'trunk', 'hybrid']).nullable().optional(),
})

app.patch('/api/ports/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  const parsed = parseJson(patchPortSchema, body)
  if (!parsed.ok) return badRequest(c, parsed.error.flatten())
  const data = parsed.data
  // The base schema doesn't carry vlanId/vlanMode/cassette — accept and ignore unknown fields.
  const update: Record<string, unknown> = {}
  if (data.label !== undefined) update.label = data.label
  if (Object.keys(update).length > 0) {
    db.update(ports).set(update).where(eq(ports.id, id)).run()
  }
  return c.json({ id, ...data })
})

const postPortSchema = z.object({
  id: IdLike.optional(),
  label: z.string().optional(),
  vlanId: IdLike.nullable().optional(),
  vlanMode: z.enum(['access', 'trunk', 'hybrid']).nullable().optional(),
})

app.post('/api/ports', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = parseJson(postPortSchema, body)
  if (!parsed.ok) return badRequest(c, parsed.error.flatten())
  const id = parsed.data.id ?? c.req.query('id')
  if (!id) return c.json({ message: 'Missing port id' }, 400)
  const update: Record<string, unknown> = {}
  if (parsed.data.label !== undefined) update.label = parsed.data.label
  if (Object.keys(update).length > 0) {
    db.update(ports).set(update).where(eq(ports.id, id)).run()
  }
  return c.json({ id, label: parsed.data.label })
})

const assignAddressSchema = z.object({
  tenantId: IdLike,
  addressId: IdLike,
  portId: IdLike,
  actorId: IdLike.optional(),
  actorName: z.string().optional(),
})

app.post('/api/ip-addresses', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = parseJson(assignAddressSchema, body)
  if (!parsed.ok) return badRequest(c, parsed.error.flatten())
  const data = parsed.data
  const addr = db.select().from(ipAddresses).where(eq(ipAddresses.id, data.addressId)).get()
  const port = db.select().from(ports).where(eq(ports.id, data.portId)).get()
  if (!addr) return c.json({ message: 'Address not found' }, 404)
  if (!port) return c.json({ message: 'Port not found' }, 404)
  // Clear any other address that was already on this port
  const prevForPort = db
    .select()
    .from(ipAddresses)
    .where(eq(ipAddresses.assignedPortId, data.portId))
    .all()
  for (const a of prevForPort) {
    if (a.id !== data.addressId) {
      db.update(ipAddresses)
        .set({ assignedPortId: null, status: 'free' })
        .where(eq(ipAddresses.id, a.id))
        .run()
    }
  }
  if (addr.assignedPortId && addr.assignedPortId !== data.portId) {
    db.update(ports)
      .set({ ipAddressId: null })
      .where(eq(ports.id, addr.assignedPortId))
      .run()
  }
  db.update(ipAddresses)
    .set({
      assignedPortId: data.portId,
      status: 'assigned',
      lastSeenAt: new Date().toISOString(),
    })
    .where(eq(ipAddresses.id, data.addressId))
    .run()
  db.update(ports)
    .set({ ipAddressId: data.addressId })
    .where(eq(ports.id, data.portId))
    .run()
  if (data.tenantId && data.actorId && data.actorName) {
    emitChange({
      tenantId: data.tenantId,
      actorId: data.actorId,
      actorName: data.actorName,
      action: 'update',
      entityType: 'address',
      entityId: data.addressId,
      summary: `Assigned ${addr.address} to port ${port.label}`,
    })
  }
  const updated = db.select().from(ipAddresses).where(eq(ipAddresses.id, data.addressId)).get()
  return c.json(updated, 200)
})

const unassignAddressSchema = z.object({
  tenantId: IdLike,
  addressId: IdLike,
  actorId: IdLike.optional(),
  actorName: z.string().optional(),
})

app.delete('/api/ip-addresses/:id', async (c) => {
  const id = c.req.param('id')
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = parseJson(unassignAddressSchema.partial({ addressId: true }), body)
  if (!parsed.ok) return badRequest(c, parsed.error.flatten())
  const addr = db.select().from(ipAddresses).where(eq(ipAddresses.id, id)).get()
  if (!addr) return c.json({ ok: true })
  if (addr.assignedPortId) {
    db.update(ports)
      .set({ ipAddressId: null })
      .where(eq(ports.id, addr.assignedPortId))
      .run()
  }
  db.update(ipAddresses)
    .set({ assignedPortId: null, status: 'free' })
    .where(eq(ipAddresses.id, id))
    .run()
  const data = parsed.data
  if (data.tenantId && data.actorId && data.actorName) {
    emitChange({
      tenantId: data.tenantId,
      actorId: data.actorId,
      actorName: data.actorName,
      action: 'update',
      entityType: 'address',
      entityId: id,
      summary: `Unassigned ${addr.address} (now free)`,
    })
  }
  return c.json({ ok: true })
})

const createReservationSchema = z.object({
  id: IdLike.optional(),
  tenantId: IdLike,
  rackId: IdLike,
  uStart: z.number().int().positive(),
  uHeight: z.number().int().positive(),
  label: z.string().min(1),
  color: z.string().min(1),
  reservedById: IdLike.optional(),
  actorId: IdLike.optional(),
  actorName: z.string().optional(),
  expectedBy: z.string().nullable().optional(),
})

app.post('/api/reservations', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = parseJson(createReservationSchema, body)
  if (!parsed.ok) return badRequest(c, parsed.error.flatten())
  const data = parsed.data
  const id = data.id ?? `res-${randomUUID().slice(0, 8)}`
  db.insert(rackReservations)
    .values({
      id,
      tenantId: data.tenantId,
      rackId: data.rackId,
      uStart: data.uStart,
      uHeight: data.uHeight,
      label: data.label,
      color: data.color,
      reservedById: data.reservedById ?? data.actorId ?? 'system',
      reservedAt: new Date().toISOString(),
      expectedBy: data.expectedBy ?? null,
    })
    .run()
  if (data.actorId && data.actorName) {
    emitChange({
      tenantId: data.tenantId,
      actorId: data.actorId,
      actorName: data.actorName,
      action: 'create',
      entityType: 'rack',
      entityId: data.rackId,
      summary: `Reserved U${data.uStart}–U${data.uStart + data.uHeight - 1} for "${data.label}"`,
    })
  }
  return c.json({ id, ...data }, 201)
})

const deleteReservationSchema = z.object({
  tenantId: IdLike,
  actorId: IdLike.optional(),
  actorName: z.string().optional(),
})

app.delete('/api/reservations/:id', async (c) => {
  const id = c.req.param('id')
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = parseJson(deleteReservationSchema.partial({ tenantId: true }), body)
  if (!parsed.ok) return badRequest(c, parsed.error.flatten())
  const res = db.select().from(rackReservations).where(eq(rackReservations.id, id)).get()
  if (!res) return c.json({ ok: true })
  db.delete(rackReservations).where(eq(rackReservations.id, id)).run()
  const data = parsed.data
  if (data.tenantId && data.actorId && data.actorName) {
    emitChange({
      tenantId: data.tenantId,
      actorId: data.actorId,
      actorName: data.actorName,
      action: 'delete',
      entityType: 'rack',
      entityId: res.rackId,
      summary: `Released reservation "${res.label}"`,
    })
  }
  return c.json({ ok: true })
})

const createPrefixSchema = z.object({
  id: IdLike.optional(),
  tenantId: IdLike,
  vrfId: IdLike.nullable().optional(),
  cidr: z.string().min(1),
  role: z.string().min(1),
  description: z.string().nullable().optional(),
  parentId: IdLike.nullable().optional(),
  dhcpScopeId: IdLike.nullable().optional(),
  dnsForwardZoneId: IdLike.nullable().optional(),
  dnsReverseZoneId: IdLike.nullable().optional(),
  tags: z.array(z.string()).optional(),
})

app.post('/api/prefixes', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = parseJson(createPrefixSchema, body)
  if (!parsed.ok) return badRequest(c, parsed.error.flatten())
  const data = parsed.data
  const id = data.id ?? `prefix-${randomUUID().slice(0, 8)}`
  db.insert(prefixes)
    .values({
      id,
      tenantId: data.tenantId,
      vrfId: data.vrfId ?? null,
      cidr: data.cidr,
      role: data.role,
      description: data.description ?? null,
      parentId: data.parentId ?? null,
      dhcpScopeId: data.dhcpScopeId ?? null,
      dnsForwardZoneId: data.dnsForwardZoneId ?? null,
      dnsReverseZoneId: data.dnsReverseZoneId ?? null,
      tags: JSON.stringify(data.tags ?? []),
    })
    .run()
  return c.json({ id, ...data }, 201)
})

const createAddressSchema = z.object({
  id: IdLike.optional(),
  tenantId: IdLike,
  prefixId: IdLike,
  address: z.string().min(1),
  status: z.enum(['free', 'assigned', 'reserved', 'dhcp', 'gateway']),
  dnsName: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
})

app.post('/api/addresses', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = parseJson(createAddressSchema, body)
  if (!parsed.ok) return badRequest(c, parsed.error.flatten())
  const data = parsed.data
  const id = data.id ?? `ip-${randomUUID().slice(0, 8)}`
  db.insert(ipAddresses)
    .values({
      id,
      tenantId: data.tenantId,
      prefixId: data.prefixId,
      address: data.address,
      status: data.status,
      dnsName: data.dnsName ?? null,
      description: data.description ?? null,
      assignedPortId: null,
      lastSeenAt: null,
    })
    .run()
  return c.json({ id, ...data }, 201)
})

const createImageSchema = z.object({
  id: IdLike.optional(),
  tenantId: IdLike,
  authorId: IdLike,
  authorName: z.string(),
  url: z.string(),
  caption: z.string().nullable().optional(),
  entityType: z.string(),
  entityId: z.string(),
})

app.post('/api/images', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = parseJson(createImageSchema, body)
  if (!parsed.ok) return badRequest(c, parsed.error.flatten())
  const data = parsed.data
  const id = data.id ?? `image-${randomUUID().slice(0, 8)}`
  db.insert(imageAttachments)
    .values({
      id,
      tenantId: data.tenantId,
      authorId: data.authorId,
      authorName: data.authorName,
      url: data.url,
      caption: data.caption ?? null,
      createdAt: new Date().toISOString(),
      entityType: data.entityType,
      entityId: data.entityId,
    })
    .run()
  return c.json({ id, ...data }, 201)
})

app.delete('/api/images/:id', (c) => {
  const id = c.req.param('id')
  db.delete(imageAttachments).where(eq(imageAttachments.id, id)).run()
  return c.json({ ok: true })
})

const createDeviceTemplateSchema = z.object({
  id: IdLike.optional(),
  tenantId: IdLike,
  name: z.string().min(1),
  vendor: z.string().min(1),
  model: z.string().nullable().optional(),
  kind: z.string().min(1),
  uHeight: z.number().int().positive(),
  defaultFace: z.union([z.literal('front'), z.literal('rear')]).optional(),
  portGroups: z.array(portGroupTemplateSchema).optional(),
  description: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
})

app.post('/api/device-templates', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = parseJson(createDeviceTemplateSchema, body)
  if (!parsed.ok) return badRequest(c, parsed.error.flatten())
  const data = parsed.data
  const id = data.id ?? `tpl-${randomUUID().slice(0, 8)}`
  db.insert(deviceTemplates)
    .values({
      id,
      tenantId: data.tenantId,
      name: data.name,
      vendor: data.vendor,
      model: data.model ?? null,
      kind: data.kind,
      uHeight: data.uHeight,
      defaultFace: data.defaultFace ?? 'front',
      portGroups: JSON.stringify(data.portGroups ?? []),
      description: data.description ?? null,
      imageUrl: data.imageUrl ?? null,
    })
    .run()
  return c.json({ id, ...data }, 201)
})

const createNoteSchema = z.object({
  id: IdLike.optional(),
  tenantId: IdLike,
  authorId: IdLike,
  authorName: z.string(),
  body: z.string().min(1),
  entityType: z.string(),
  entityId: z.string(),
})

app.post('/api/notes', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = parseJson(createNoteSchema, body)
  if (!parsed.ok) return badRequest(c, parsed.error.flatten())
  const data = parsed.data
  const id = data.id ?? `note-${randomUUID().slice(0, 8)}`
  const createdAt = new Date().toISOString()
  db.insert(notes)
    .values({
      id,
      tenantId: data.tenantId,
      authorId: data.authorId,
      authorName: data.authorName,
      body: data.body,
      createdAt,
      entityType: data.entityType,
      entityId: data.entityId,
    })
    .run()
  return c.json({ id, ...data, createdAt }, 201)
})

app.delete('/api/notes/:id', (c) => {
  const id = c.req.param('id')
  db.delete(notes).where(eq(notes.id, id)).run()
  return c.json({ ok: true })
})

// === Multipart upload ===
const ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])
const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
}

app.post('/api/upload', async (c) => {
  const form = await c.req.formData().catch(() => null)
  if (!form) return c.json({ message: 'Expected multipart/form-data' }, 400)
  const file = form.get('file')
  if (!(file instanceof File)) {
    return c.json({ message: 'Missing file' }, 400)
  }
  let ext = extname(file.name).toLowerCase()
  if (!ext) ext = EXT_BY_MIME[file.type] ?? ''
  if (!ALLOWED_EXTS.has(ext)) {
    return c.json({ message: `Unsupported file type: ${file.type || 'unknown'}` }, 415)
  }
  const name = `${randomUUID()}${ext}`
  const buf = Buffer.from(await file.arrayBuffer())
  writeFileSync(join(UPLOAD_DIR, name), buf)
  const url = `/uploads/${name}`
  return c.json({ url, name, size: buf.byteLength, contentType: file.type }, 201)
})

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`IPAM backend listening on http://localhost:${info.port}`)
})
