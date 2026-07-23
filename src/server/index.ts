import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { db, countsByTenant, sqlite, tx, type Tx } from './db'
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
import { and, eq, sql } from 'drizzle-orm'
import {
  authApp,
  requireAuth,
  requireRole,
  getActor,
} from './auth'
import {
  errorResponse,
  notFound,
  validationError,
} from './errors'
import {
  deviceTenant,
  portTenant,
  cableTenant,
  rackTenant,
  roomTenant,
  floorplanTenant,
  userTenant,
  assertSameTenant,
} from './scope'
import type { Context } from 'hono'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const UPLOAD_DIR =
  process.env.IPAM_UPLOAD_DIR ?? join(__dirname, '..', '..', 'data', 'uploads')
mkdirSync(UPLOAD_DIR, { recursive: true })

// dist/ is the Vite build output. When the server runs in production
// (compiled via `npm run build:server`, then `node server-build/server/index.js`,
// or inside the Docker image) we serve it as static assets so a single
// port serves both the API and the SPA. In dev (`tsx watch ...`) the Vite
// dev server on :5173 serves the frontend and proxies /api to this server.
// IPAM_DIST_DIR lets the compose/Docker layer point at `/app/dist` without
// baking the path into the compiled output.
const DIST_DIR =
  process.env.IPAM_DIST_DIR ?? join(__dirname, '..', '..', 'dist')

export const app = new Hono()

const seedCounts = seedIfEmpty()

// Root diagnostic — only mount the JSON banner in *dev* (no built SPA on
// disk). When `IPAM_DIST_DIR/dist` is present, GET / is the SPA fallback
// below; mounting this here first would shadow it and the operator would
// see JSON at the URL they expect to open in a browser.
if (!existsSync(DIST_DIR)) {
  app.get('/', (c) =>
    c.json({
      name: 'IPAM backend',
      seeded: seedCounts,
      rows: countsByTenant(),
    }),
  )
}

// === Health check ============================================================
// GET /healthz
//   200 { ok: true,  db: "up",   seedCounts: {...} }   -- DB ping OK
//   503 { ok: false, db: "down", error: string }      -- DB unreachable
//
// The Docker healthcheck and scripts/smoke.ts both contract against this
// shape -- change it in a way that breaks them and you break deploy.
// Intentionally unauthenticated so the Docker healthcheck (and load balancer
// probes) can hit it without a session.
app.get('/healthz', (c) => {
  let dbStatus: 'up' | 'down' = 'up'
  let dbError: string | undefined
  try {
    sqlite.prepare('SELECT 1 AS ok').get()
  } catch (err) {
    dbStatus = 'down'
    dbError = err instanceof Error ? err.message : String(err)
  }
  const body = {
    ok: dbStatus === 'up',
    db: dbStatus,
    seedCounts,
  }
  if (dbStatus === 'up') return c.json(body, 200)
  return c.json({ ...body, error: dbError }, 503)
})

// === Static uploads (unauthenticated; the URL itself is the access token) ===
app.use(
  '/uploads/*',
  serveStatic({
    root: './',
    rewriteRequestPath: (p) => p.replace(/^\/uploads/, '/data/uploads'),
  }),
)

// === Auth (login/logout/me) =================================================
// /api/auth/login and /api/auth/logout are explicitly UNAUTHENTICATED — they
// are how callers establish or tear down a session. /api/auth/me is gated by
// requireAuth. Everything else under /api/** is gated below.
app.route('/api/auth', authApp)

// === Authenticated API surface ==============================================
// All other /api/** routes go through this sub-app so we can mount the
// requireAuth + requireRole middleware once.
const api = new Hono()
api.use('*', requireAuth)

// --- Reads (any authenticated user) ---------------------------------------

api.get('/tenants', (c) => {
  const actor = getActor(c)
  return c.json(
    db.select().from(tenants).where(eq(tenants.id, actor.tenantId)).all(),
  )
})

api.get('/users', (c) => {
  const actor = getActor(c)
  return c.json(
    db.select().from(users).where(eq(users.tenantId, actor.tenantId)).all(),
  )
})

/**
 * PATCH /api/users/:id
 *
 * NUL-51.E / NUL-59 — server-side onboarding completion timestamp.
 *
 * Today the only mutable field is `onboardingCompletedAt` (ISO 8601). The
 * endpoint is intentionally narrow:
 *
 *   - Authz: the actor can only PATCH **their own** row. Cross-tenant ids
 *     return 404 (the standard "not found" treatment, no information leak).
 *     Admins do NOT get a generic "edit any user" backdoor here — onboarding
 *     state is a personal completion flag, not an admin-controlled field.
 *     This can be revisited when NUL-12 lands the full user-admin UI.
 *   - Validation: ISO 8601 string OR `null`. `null` resets the flag (lets the
 *     tour replay). Empty string is rejected at the Zod layer.
 *   - Persistence: writes run inside `tx()` so concurrent PATCHes serialize
 *     instead of last-write-wins (matches the pattern used by other PATCH
 *     routes — see PATCH /api/racks/:id).
 *   - Audit: not logged via emitChange() yet — onboarding completion is a
 *     low-signal action and the audit log is reserved for IPAM-domain
 *     mutations (NUL-12 will revisit).
 */
const patchUserSchema = z.object({
  onboardingCompletedAt: z
    .string()
    .datetime({ offset: true, message: 'Must be an ISO 8601 timestamp' })
    .nullable()
    .optional(),
})

api.patch('/users/:id', async (c) => {
  const actor = getActor(c)
  const id = c.req.param('id')
  // Tenant boundary: confirm the user exists in the actor's tenant. Same
  // pattern as the other PATCH routes — return 404, never 403, to avoid
  // leaking cross-tenant row existence.
  try {
    assertSameTenant(actor, userTenant(id), 'user')
  } catch {
    return notFound(c, 'user not found')
  }
  // Self-only authz: only the actor can PATCH their own row, regardless of
  // role. Cross-user writes are not supported yet — that lands with the
  // user-admin UI in NUL-12.
  if (id !== actor.id) {
    return notFound(c, 'user not found')
  }
  const r = await readBody(c, patchUserSchema)
  if (!r.ok) return r.response
  const data = r.data
  const update: Record<string, unknown> = {}
  if (data.onboardingCompletedAt !== undefined) {
    update.onboardingCompletedAt = data.onboardingCompletedAt
  }
  if (Object.keys(update).length > 0) {
    tx((t) => {
      t.update(users).set(update).where(eq(users.id, id)).run()
    })
  }
  // Always return the persisted row so the response shape is identical
  // whether the PATCH was a no-op or an actual write. The /api/auth/me
  // endpoint will pick this up on the next call.
  const row = db
    .select({
      id: users.id,
      tenantId: users.tenantId,
      onboardingCompletedAt: users.onboardingCompletedAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .get()
  return c.json(row)
})

api.get('/sites', (c) => {
  const actor = getActor(c)
  return c.json(
    db.select().from(sites).where(eq(sites.tenantId, actor.tenantId)).all(),
  )
})

api.get('/rooms', (c) => {
  const actor = getActor(c)
  return c.json(
    db.select().from(rooms).where(eq(rooms.tenantId, actor.tenantId)).all(),
  )
})

api.get('/floorplans', (c) => {
  const actor = getActor(c)
  return c.json(
    db.select().from(floorplans).where(eq(floorplans.tenantId, actor.tenantId)).all(),
  )
})

api.get('/floorplan-positions', (c) => {
  // Rack positions are owned by the floorplan (which carries tenantId via
  // its room). Filter via JOIN to keep the tenant boundary tight.
  const actor = getActor(c)
  const rows = db
    .select({
      id: rackPositions.id,
      floorplanId: rackPositions.floorplanId,
      rackId: rackPositions.rackId,
      x: rackPositions.x,
      y: rackPositions.y,
      rotation: rackPositions.rotation,
    })
    .from(rackPositions)
    .innerJoin(floorplans, eq(floorplans.id, rackPositions.floorplanId))
    .where(eq(floorplans.tenantId, actor.tenantId))
    .all()
  return c.json(rows)
})

api.get('/racks', (c) => {
  const actor = getActor(c)
  return c.json(
    db.select().from(racks).where(eq(racks.tenantId, actor.tenantId)).all(),
  )
})

api.get('/devices', (c) => {
  const actor = getActor(c)
  // Devices do not carry tenantId directly; derive via rack.
  return c.json(
    db
      .select({ dev: devices })
      .from(devices)
      .innerJoin(racks, eq(racks.id, devices.rackId))
      .where(eq(racks.tenantId, actor.tenantId))
      .all()
      .map((r) => r.dev),
  )
})

api.get('/ports', (c) => {
  const actor = getActor(c)
  // Ports via device → rack.
  return c.json(
    db
      .select({ p: ports })
      .from(ports)
      .innerJoin(devices, eq(devices.id, ports.deviceId))
      .innerJoin(racks, eq(racks.id, devices.rackId))
      .where(eq(racks.tenantId, actor.tenantId))
      .all()
      .map((r) => r.p),
  )
})

api.get('/cables', (c) => {
  const actor = getActor(c)
  return c.json(
    db
      .select({ c: cables })
      .from(cables)
      .innerJoin(ports, eq(ports.id, cables.portAId))
      .innerJoin(devices, eq(devices.id, ports.deviceId))
      .innerJoin(racks, eq(racks.id, devices.rackId))
      .where(eq(racks.tenantId, actor.tenantId))
      .all()
      .map((r) => r.c),
  )
})

api.get('/vrfs', (c) => {
  const actor = getActor(c)
  return c.json(
    db.select().from(vrfs).where(eq(vrfs.tenantId, actor.tenantId)).all(),
  )
})

api.get('/prefixes', (c) => {
  const actor = getActor(c)
  return c.json(
    db.select().from(prefixes).where(eq(prefixes.tenantId, actor.tenantId)).all(),
  )
})

api.get('/addresses', (c) => {
  const actor = getActor(c)
  return c.json(
    db.select().from(ipAddresses).where(eq(ipAddresses.tenantId, actor.tenantId)).all(),
  )
})

api.get('/ip-addresses', (c) => {
  const actor = getActor(c)
  return c.json(
    db.select().from(ipAddresses).where(eq(ipAddresses.tenantId, actor.tenantId)).all(),
  )
})

api.get('/notes', (c) => {
  const actor = getActor(c)
  return c.json(
    db.select().from(notes).where(eq(notes.tenantId, actor.tenantId)).all(),
  )
})

api.get('/images', (c) => {
  const actor = getActor(c)
  return c.json(
    db
      .select()
      .from(imageAttachments)
      .where(eq(imageAttachments.tenantId, actor.tenantId))
      .all(),
  )
})

api.get('/change-events', (c) => {
  const actor = getActor(c)
  return c.json(
    db.select().from(changeEvents).where(eq(changeEvents.tenantId, actor.tenantId)).all(),
  )
})

api.get('/reservations', (c) => {
  const actor = getActor(c)
  return c.json(
    db
      .select()
      .from(rackReservations)
      .where(eq(rackReservations.tenantId, actor.tenantId))
      .all(),
  )
})

api.get('/dhcp-scopes', (c) => {
  const actor = getActor(c)
  return c.json(
    db.select().from(dhcpScopes).where(eq(dhcpScopes.tenantId, actor.tenantId)).all(),
  )
})

api.get('/dns-zones', (c) => {
  const actor = getActor(c)
  return c.json(
    db.select().from(dnsZones).where(eq(dnsZones.tenantId, actor.tenantId)).all(),
  )
})

api.get('/device-templates', (c) => {
  const actor = getActor(c)
  return c.json(
    db
      .select()
      .from(deviceTemplates)
      .where(eq(deviceTemplates.tenantId, actor.tenantId))
      .all(),
  )
})

// --- Mutations (editor or admin only) -------------------------------------

// Hono middleware: every mutation below requires editor or admin.
const requireEditor = requireRole('editor')
api.post('*', requireEditor)
api.patch('*', requireEditor)
api.put('*', requireEditor)
api.delete('*', requireEditor)

// === Validation helpers ====================================================

class HttpError extends Error {
  constructor(public status: number, public code: 'not_found' | 'conflict' | 'validation', message: string) {
    super(message)
  }
}

const IdLike = z.string().min(1)

function parseJson<T>(schema: z.ZodType<T>, value: unknown): { ok: true; data: T } | { ok: false; error: z.ZodError } {
  const result = schema.safeParse(value)
  if (!result.success) return { ok: false, error: result.error }
  return { ok: true, data: result.data }
}

/**
 * Read+parse the request body, returning a typed error envelope if the body
 * is malformed or fails Zod validation. Routes below use this to avoid
 * repeating the try/parse dance.
 */
async function readBody<S extends z.ZodTypeAny>(
  c: Context,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: Response }> {
  const raw = await c.req.json().catch(() => null)
  const parsed = parseJson(schema, raw)
  if (!parsed.ok) return { ok: false, response: validationError(c, parsed.error.flatten()) }
  return { ok: true, data: parsed.data }
}

const createSiteSchema = z.object({
  id: IdLike.optional(),
  name: z.string().min(1),
  address: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
})

api.post('/sites', async (c) => {
  const actor = getActor(c)
  const r = await readBody(c, createSiteSchema)
  if (!r.ok) return r.response
  const data = r.data
  const id = data.id ?? `site-${Date.now().toString(36)}`
  db.insert(sites)
    .values({
      id,
      tenantId: actor.tenantId,
      name: data.name,
      address: data.address ?? null,
      tags: JSON.stringify(data.tags ?? []),
    })
    .run()
  return c.json({ id, ...data, tenantId: actor.tenantId }, 201)
})

const createRoomSchema = z.object({
  id: IdLike.optional(),
  siteId: IdLike,
  name: z.string().min(1),
  floorplanId: IdLike.optional().nullable(),
  tags: z.array(z.string()).optional(),
})

api.post('/rooms', async (c) => {
  const actor = getActor(c)
  const r = await readBody(c, createRoomSchema)
  if (!r.ok) return r.response
  const data = r.data
  // Cross-tenant guard: siteId must belong to the actor's tenant.
  try {
    assertSameTenant(actor, roomTenant(data.siteId), 'site')
  } catch {
    return notFound(c, 'site not found')
  }
  const id = data.id ?? `room-${Date.now().toString(36)}`
  db.insert(rooms)
    .values({
      id,
      tenantId: actor.tenantId,
      siteId: data.siteId,
      name: data.name,
      floorplanId: data.floorplanId ?? null,
      tags: JSON.stringify(data.tags ?? []),
    })
    .run()
  return c.json({ id, ...data, tenantId: actor.tenantId }, 201)
})

const createFloorplanSchema = z.object({
  id: IdLike.optional(),
  roomId: IdLike,
  name: z.string().min(1),
  imageUrl: z.string().nullable().optional(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
})

api.post('/floorplans', async (c) => {
  const actor = getActor(c)
  const r = await readBody(c, createFloorplanSchema)
  if (!r.ok) return r.response
  const data = r.data
  try {
    assertSameTenant(actor, roomTenant(data.roomId), 'room')
  } catch {
    return notFound(c, 'room not found')
  }
  const id = data.id ?? `fp-${Date.now().toString(36)}`
  db.insert(floorplans)
    .values({
      id,
      tenantId: actor.tenantId,
      roomId: data.roomId,
      name: data.name,
      imageUrl: data.imageUrl ?? null,
      width: data.width,
      height: data.height,
    })
    .run()
  return c.json({ id, ...data, tenantId: actor.tenantId }, 201)
})

const floorplanPositionSchema = z.object({
  floorplanId: IdLike,
  rackId: IdLike,
  x: z.number().int(),
  y: z.number().int(),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
})

api.post('/floorplan-positions', async (c) => {
  const actor = getActor(c)
  const r = await readBody(c, floorplanPositionSchema)
  if (!r.ok) return r.response
  const data = r.data
  try {
    assertSameTenant(actor, floorplanTenant(data.floorplanId), 'floorplan')
    assertSameTenant(actor, rackTenant(data.rackId), 'rack')
  } catch {
    return notFound(c, 'floorplan or rack not found')
  }
  // Upsert — wrap in a tx so two concurrent placements don't both insert.
  tx((t) => {
    const existing = t
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
      t.update(rackPositions)
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
      t.insert(rackPositions)
        .values({
          floorplanId: data.floorplanId,
          rackId: data.rackId,
          x: data.x,
          y: data.y,
          rotation: data.rotation ?? 0,
        })
        .run()
    }
    emitChange(
      c,
      {
        action: 'place',
        entityType: 'rack',
        entityId: data.rackId,
        summary: `Moved rack ${data.rackId} to (${data.x}, ${data.y})`,
      },
      t,
    )
  })
  return c.json({ ok: true }, 200)
})

const rackPositionSchema = z.object({
  floorplanId: IdLike,
  rackId: IdLike,
  x: z.number().int(),
  y: z.number().int(),
})

api.patch('/rack-positions', async (c) => {
  const actor = getActor(c)
  const r = await readBody(c, rackPositionSchema)
  if (!r.ok) return r.response
  const data = r.data
  try {
    assertSameTenant(actor, floorplanTenant(data.floorplanId), 'floorplan')
    assertSameTenant(actor, rackTenant(data.rackId), 'rack')
  } catch {
    return notFound(c, 'floorplan or rack not found')
  }
  tx((t) => {
    const existing = t
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
      t.insert(rackPositions)
        .values({
          floorplanId: data.floorplanId,
          rackId: data.rackId,
          x: data.x,
          y: data.y,
          rotation: 0,
        })
        .run()
    } else {
      t.update(rackPositions)
        .set({ x: data.x, y: data.y })
        .where(
          and(
            eq(rackPositions.floorplanId, data.floorplanId),
            eq(rackPositions.rackId, data.rackId),
          ),
        )
        .run()
    }
    emitChange(
      c,
      {
        action: 'place',
        entityType: 'rack',
        entityId: data.rackId,
        summary: `Moved rack ${data.rackId} to (${data.x}, ${data.y})`,
      },
      t,
    )
  })
  return c.json({ ok: true })
})

const createRackSchema = z.object({
  id: IdLike.optional(),
  roomId: IdLike,
  name: z.string().min(1),
  uHeight: z.number().int().positive(),
  widthMm: z.number().int().nullable().optional(),
  depthMm: z.number().int().nullable().optional(),
  tags: z.array(z.string()).optional(),
  powerBudgetWatts: z.number().int().nullable().optional(),
})

api.post('/racks', async (c) => {
  const actor = getActor(c)
  const r = await readBody(c, createRackSchema)
  if (!r.ok) return r.response
  const data = r.data
  try {
    assertSameTenant(actor, roomTenant(data.roomId), 'room')
  } catch {
    return notFound(c, 'room not found')
  }
  const id = data.id ?? `rack-${Date.now().toString(36)}`
  db.insert(racks)
    .values({
      id,
      tenantId: actor.tenantId,
      roomId: data.roomId,
      name: data.name,
      uHeight: data.uHeight,
      widthMm: data.widthMm ?? null,
      depthMm: data.depthMm ?? null,
      tags: JSON.stringify(data.tags ?? []),
      powerBudgetWatts: data.powerBudgetWatts ?? null,
    })
    .run()
  return c.json({ id, ...data, tenantId: actor.tenantId }, 201)
})

const patchRackSchema = z.object({
  name: z.string().min(1).optional(),
  uHeight: z.number().int().positive().optional(),
  widthMm: z.number().int().nullable().optional(),
  depthMm: z.number().int().nullable().optional(),
  tags: z.array(z.string()).optional(),
  powerBudgetWatts: z.number().int().nullable().optional(),
})

api.patch('/racks/:id', async (c) => {
  const actor = getActor(c)
  const id = c.req.param('id')
  try {
    assertSameTenant(actor, rackTenant(id), 'rack')
  } catch {
    return notFound(c, 'rack not found')
  }
  const r = await readBody(c, patchRackSchema)
  if (!r.ok) return r.response
  const data = r.data
  const update: Record<string, unknown> = {}
  if (data.name !== undefined) update.name = data.name
  if (data.uHeight !== undefined) update.uHeight = data.uHeight
  if (data.widthMm !== undefined) update.widthMm = data.widthMm
  if (data.depthMm !== undefined) update.depthMm = data.depthMm
  if (data.tags !== undefined) update.tags = JSON.stringify(data.tags)
  if (data.powerBudgetWatts !== undefined)
    update.powerBudgetWatts = data.powerBudgetWatts
  if (Object.keys(update).length === 0) return c.json({ id })
  tx((t) => {
    t.update(racks).set(update).where(eq(racks.id, id)).run()
  })
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

api.patch('/devices/:id', async (c) => {
  const actor = getActor(c)
  const id = c.req.param('id')
  try {
    assertSameTenant(actor, deviceTenant(id), 'device')
  } catch {
    return notFound(c, 'device not found')
  }
  const r = await readBody(c, patchDeviceSchema)
  if (!r.ok) return r.response
  const data = r.data
  const update: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue
    if (k === 'tags') update.tags = JSON.stringify(v)
    else if (k === 'customFields') update.customFields = JSON.stringify(v)
    else update[k] = v
  }
  if (Object.keys(update).length === 0) return c.json({ id })
  // Tx so concurrent patches serialize instead of last-write-wins losing
  // changes (e.g. editor A sets tags while editor B sets wattage).
  tx((t) => {
    t.update(devices).set(update).where(eq(devices.id, id)).run()
  })
  return c.json({ id, ...data })
})

api.delete('/devices/:id', (c) => {
  const actor = getActor(c)
  const id = c.req.param('id')
  try {
    assertSameTenant(actor, deviceTenant(id), 'device')
  } catch {
    return notFound(c, 'device not found')
  }
  // Cascade is split across several tables; serialize so an interleaved
  // cable connect to one of the soon-to-be-deleted ports can't leave a
  // dangling cableId pointing at a port that's gone.
  try {
    tx((t) => {
      const devicePorts = t.select().from(ports).where(eq(ports.deviceId, id)).all()
      for (const p of devicePorts) {
        if (p.cableId) {
          t.delete(cables).where(eq(cables.id, p.cableId)).run()
        }
        if (p.ipAddressId) {
          t.update(ipAddresses)
            .set({ assignedPortId: null, status: 'free' })
            .where(eq(ipAddresses.id, p.ipAddressId))
            .run()
        }
      }
      t.delete(devices).where(eq(devices.id, id)).run()
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return errorResponse(c, err.status, err.code, err.message)
    }
    throw err
  }
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
  templateId: IdLike,
  rackId: IdLike,
  name: z.string().min(1),
  uStart: z.number().int().positive(),
  face: z.union([z.literal('front'), z.literal('rear')]).optional(),
})

/**
 * Check whether the U-range [uStart, uStart+uHeight) on `rackId` is already
 * occupied by another device on the same face, OR reserved by an
 * active rack reservation. Caller must run inside a tx so the check + the
 * subsequent insert are atomic against concurrent placements.
 */
function uRangeOverlapQuery(t: Tx, rackId: string, uStart: number, uHeight: number, face: 'front' | 'rear') {
  const uEnd = uStart + uHeight - 1
  // Overlap predicate for half-open ranges: a.uStart <= uEnd AND b.uEnd >= uStart.
  // Devices on the OPPOSITE face don't conflict — front/rear share a U but
  // don't physically occupy the same space.
  const conflictingDevices = t
    .select({ id: devices.id })
    .from(devices)
    .where(
      and(
        eq(devices.rackId, rackId),
        eq(devices.face, face),
        sql`${devices.uStart} <= ${uEnd}`,
        sql`${devices.uStart} + ${devices.uHeight} - 1 >= ${uStart}`,
      ),
    )
    .all()
  if (conflictingDevices.length > 0) {
    return { conflict: true as const, reason: 'device' as const }
  }
  const conflictingReservations = t
    .select({ id: rackReservations.id })
    .from(rackReservations)
    .where(
      and(
        eq(rackReservations.rackId, rackId),
        sql`${rackReservations.uStart} <= ${uEnd}`,
        sql`${rackReservations.uStart} + ${rackReservations.uHeight} - 1 >= ${uStart}`,
      ),
    )
    .all()
  if (conflictingReservations.length > 0) {
    return { conflict: true as const, reason: 'reservation' as const }
  }
  return { conflict: false as const }
}

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

async function createDeviceFromTemplateHandler(c: Context) {
  const actor = getActor(c)
  const r = await readBody(c, createDeviceFromTemplateSchema)
  if (!r.ok) return r.response
  const data = r.data

  // Cross-tenant guards: template AND rack must be in the actor's tenant.
  const tpl = db
    .select()
    .from(deviceTemplates)
    .where(eq(deviceTemplates.id, data.templateId))
    .get()
  if (!tpl || tpl.tenantId !== actor.tenantId) {
    return notFound(c, 'template not found')
  }
  try {
    assertSameTenant(actor, rackTenant(data.rackId), 'rack')
  } catch {
    return notFound(c, 'rack not found')
  }
  const rack = db.select().from(racks).where(eq(racks.id, data.rackId)).get()!

  const deviceId = data.id ?? `dev-${randomUUID().slice(0, 8)}`
  const portGroupsParsed = z.array(portGroupTemplateSchema).safeParse(
    JSON.parse(tpl.portGroups) as unknown,
  )
  const portGroups = portGroupsParsed.success ? portGroupsParsed.data : []
  const portsToCreate = generatePortsForDevice(deviceId, portGroups)

  // Device row + N port rows + audit row in one tx so a partial
  // failure can't leave a device with zero ports. The U-overlap check
  // also runs inside the tx so two concurrent placements on the same U
  // can't both win.
  let inserted: typeof devices.$inferSelect | undefined
  try {
    tx((t) => {
      const uHeight = tpl.uHeight
      const face = (data.face ?? (tpl.defaultFace as 'front' | 'rear')) as 'front' | 'rear'
      const overlap = uRangeOverlapQuery(t, data.rackId, data.uStart, uHeight, face)
      if (overlap.conflict) {
        throw new HttpError(
          409,
          'conflict',
          `U-range overlaps an existing ${overlap.reason}`,
        )
      }
      t.insert(devices)
        .values({
          id: deviceId,
          rackId: data.rackId,
          name: data.name,
          kind: tpl.kind,
          model: tpl.model ?? null,
          vendor: tpl.vendor,
          uStart: data.uStart,
          uHeight: tpl.uHeight,
          face,
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
        t.insert(ports).values(p).run()
      }
      emitChange(
        c,
        {
          action: 'create',
          entityType: 'device',
          entityId: deviceId,
          summary: `Created device ${data.name} on rack ${rack.name} (template: ${tpl.name})`,
        },
        t,
      )
      inserted = t.select().from(devices).where(eq(devices.id, deviceId)).get()
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return errorResponse(c, err.status, err.code, err.message)
    }
    throw err
  }
  return c.json({ ...inserted, ports: portsToCreate.map((p) => p.id) }, 201)
}

type Handler = (c: import('hono').Context) => Response | Promise<Response>
const deviceCreationHandler = createDeviceFromTemplateHandler as unknown as Handler
api.post('/devices', deviceCreationHandler)
api.post('/devices/with-template', deviceCreationHandler)

const createCableSchema = z.object({
  id: IdLike.optional(),
  kind: z.string().min(1),
  portAId: IdLike,
  portBId: IdLike,
  lengthM: z.number().nullable().optional(),
  label: z.string().nullable().optional(),
})

api.post('/cables', async (c) => {
  const actor = getActor(c)
  const r = await readBody(c, createCableSchema)
  if (!r.ok) return r.response
  const data = r.data
  // Tenant guards run OUTSIDE the transaction — they only touch the ports
  // for their tenantId and return synchronously. The race-sensitive
  // "both ports still free?" check + insert + port updates happen in one
  // BEGIN IMMEDIATE block so concurrent connects to the same port get
  // serialized instead of both seeing cableId=null and winning.
  try {
    assertSameTenant(actor, portTenant(data.portAId), 'portA')
    assertSameTenant(actor, portTenant(data.portBId), 'portB')
  } catch {
    return notFound(c, 'port not found')
  }
  if (data.portAId === data.portBId) {
    return errorResponse(c, 409, 'conflict', 'Cannot connect a port to itself')
  }
  const id = data.id ?? `cable-${randomUUID().slice(0, 8)}`
  try {
    tx((t) => {
      const portA = t.select().from(ports).where(eq(ports.id, data.portAId)).get()
      const portB = t.select().from(ports).where(eq(ports.id, data.portBId)).get()
      if (!portA || !portB) {
        throw new HttpError(404, 'not_found', 'port not found')
      }
      if (portA.cableId || portB.cableId) {
        throw new HttpError(409, 'conflict', 'Port already connected')
      }
      t.insert(cables)
        .values({
          id,
          kind: data.kind,
          lengthM: data.lengthM ?? null,
          label: data.label ?? null,
          portAId: data.portAId,
          portBId: data.portBId,
        })
        .run()
      t.update(ports).set({ cableId: id }).where(eq(ports.id, data.portAId)).run()
      t.update(ports).set({ cableId: id }).where(eq(ports.id, data.portBId)).run()
      emitChange(
        c,
        {
          action: 'connect',
          entityType: 'cable',
          entityId: id,
          summary: `Connected cable "${data.label ?? id}" to ${portA.label} ↔ ${portB.label}`,
        },
        t,
      )
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return errorResponse(c, err.status, err.code, err.message)
    }
    throw err
  }
  return c.json({ id, kind: data.kind, lengthM: data.lengthM, label: data.label, portA: data.portAId, portB: data.portBId }, 201)
})

api.delete('/cables/:id', (c) => {
  const actor = getActor(c)
  const id = c.req.param('id')
  try {
    assertSameTenant(actor, cableTenant(id), 'cable')
  } catch {
    return notFound(c, 'cable not found')
  }
  // Tx so the port-cableId null-out and the cable delete can't be
  // interleaved with a concurrent POST /cables reusing one of the ports.
  tx((t) => {
    const cable = t.select().from(cables).where(eq(cables.id, id)).get()
    if (!cable) return
    t.update(ports).set({ cableId: null }).where(eq(ports.id, cable.portAId)).run()
    t.update(ports).set({ cableId: null }).where(eq(ports.id, cable.portBId)).run()
    t.delete(cables).where(eq(cables.id, id)).run()
  })
  return c.json({ ok: true })
})

const patchCableSchema = z.object({
  color: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  lengthM: z.number().nullable().optional(),
})

api.patch('/cables/:id', async (c) => {
  const actor = getActor(c)
  const id = c.req.param('id')
  try {
    assertSameTenant(actor, cableTenant(id), 'cable')
  } catch {
    return notFound(c, 'cable not found')
  }
  const r = await readBody(c, patchCableSchema)
  if (!r.ok) return r.response
  const data = r.data
  // The 'color' field isn't in the cable schema but is supported by the mock
  // client; store it as part of label JSON-encoded suffix for round-tripping.
  const update: Record<string, unknown> = {}
  if (data.label !== undefined) update.label = data.label
  if (data.lengthM !== undefined) update.lengthM = data.lengthM
  if (Object.keys(update).length > 0) {
    tx((t) => {
      t.update(cables).set(update).where(eq(cables.id, id)).run()
    })
  }
  return c.json({ id, ...data })
})

const patchPortSchema = z.object({
  label: z.string().optional(),
  vlanId: IdLike.nullable().optional(),
  vlanMode: z.enum(['access', 'trunk', 'hybrid']).nullable().optional(),
})

api.patch('/ports/:id', async (c) => {
  const actor = getActor(c)
  const id = c.req.param('id')
  try {
    assertSameTenant(actor, portTenant(id), 'port')
  } catch {
    return notFound(c, 'port not found')
  }
  const r = await readBody(c, patchPortSchema)
  if (!r.ok) return r.response
  const data = r.data
  // The base schema doesn't carry vlanId/vlanMode/cassette — accept and ignore unknown fields.
  const update: Record<string, unknown> = {}
  if (data.label !== undefined) update.label = data.label
  if (Object.keys(update).length > 0) {
    tx((t) => {
      t.update(ports).set(update).where(eq(ports.id, id)).run()
    })
  }
  return c.json({ id, ...data })
})

const postPortSchema = z.object({
  id: IdLike.optional(),
  label: z.string().optional(),
  vlanId: IdLike.nullable().optional(),
  vlanMode: z.enum(['access', 'trunk', 'hybrid']).nullable().optional(),
})

api.post('/ports', async (c) => {
  const actor = getActor(c)
  const r = await readBody(c, postPortSchema)
  if (!r.ok) return r.response
  const parsed = r.data
  const id = parsed.id ?? c.req.query('id')
  if (!id) return errorResponse(c, 400, 'validation', 'Missing port id')
  try {
    assertSameTenant(actor, portTenant(id), 'port')
  } catch {
    return notFound(c, 'port not found')
  }
  const update: Record<string, unknown> = {}
  if (parsed.label !== undefined) update.label = parsed.label
  if (Object.keys(update).length > 0) {
    tx((t) => {
      t.update(ports).set(update).where(eq(ports.id, id)).run()
    })
  }
  return c.json({ id, label: parsed.label })
})

const assignAddressSchema = z.object({
  addressId: IdLike,
  portId: IdLike,
})

api.post('/ip-addresses', async (c) => {
  const actor = getActor(c)
  const r = await readBody(c, assignAddressSchema)
  if (!r.ok) return r.response
  const data = r.data
  try {
    assertSameTenant(actor, portTenant(data.portId), 'port')
  } catch {
    return notFound(c, 'port not found')
  }
  // Atomic swap: two concurrent assigns to the same port would otherwise
  // race on the SELECT-then-UPDATE of `assignedPortId`. BEGIN IMMEDIATE
  // serializes them and we re-check inside the transaction.
  try {
    const result = tx((t) => {
      const addr = t.select().from(ipAddresses).where(eq(ipAddresses.id, data.addressId)).get()
      if (!addr || addr.tenantId !== actor.tenantId) {
        throw new HttpError(404, 'not_found', 'address not found')
      }
      const port = t.select().from(ports).where(eq(ports.id, data.portId)).get()
      if (!port) throw new HttpError(404, 'not_found', 'port not found')
      // Clear any other address that was already on this port
      const prevForPort = t
        .select()
        .from(ipAddresses)
        .where(eq(ipAddresses.assignedPortId, data.portId))
        .all()
      for (const a of prevForPort) {
        if (a.id !== data.addressId) {
          t.update(ipAddresses)
            .set({ assignedPortId: null, status: 'free' })
            .where(eq(ipAddresses.id, a.id))
            .run()
        }
      }
      if (addr.assignedPortId && addr.assignedPortId !== data.portId) {
        t.update(ports)
          .set({ ipAddressId: null })
          .where(eq(ports.id, addr.assignedPortId))
          .run()
      }
      t.update(ipAddresses)
        .set({
          assignedPortId: data.portId,
          status: 'assigned',
          lastSeenAt: new Date().toISOString(),
        })
        .where(eq(ipAddresses.id, data.addressId))
        .run()
      t.update(ports)
        .set({ ipAddressId: data.addressId })
        .where(eq(ports.id, data.portId))
        .run()
      emitChange(
        c,
        {
          action: 'update',
          entityType: 'address',
          entityId: data.addressId,
          summary: `Assigned ${addr.address} to port ${port.label}`,
        },
        t,
      )
      return t.select().from(ipAddresses).where(eq(ipAddresses.id, data.addressId)).get()!
    })
    return c.json(result, 200)
  } catch (err) {
    if (err instanceof HttpError) {
      return errorResponse(c, err.status, err.code, err.message)
    }
    throw err
  }
})

api.delete('/ip-addresses/:id', async (c) => {
  const actor = getActor(c)
  const id = c.req.param('id')
  const addr = db.select().from(ipAddresses).where(eq(ipAddresses.id, id)).get()
  if (!addr || addr.tenantId !== actor.tenantId) return notFound(c, 'address not found')
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
  emitChange(c, {
    action: 'update',
    entityType: 'address',
    entityId: id,
    summary: `Unassigned ${addr.address} (now free)`,
  })
  return c.json({ ok: true })
})

const createReservationSchema = z.object({
  id: IdLike.optional(),
  rackId: IdLike,
  uStart: z.number().int().positive(),
  uHeight: z.number().int().positive(),
  label: z.string().min(1),
  color: z.string().min(1),
  reservedById: IdLike.optional(),
  expectedBy: z.string().nullable().optional(),
})

api.post('/reservations', async (c) => {
  const actor = getActor(c)
  const r = await readBody(c, createReservationSchema)
  if (!r.ok) return r.response
  const data = r.data
  try {
    assertSameTenant(actor, rackTenant(data.rackId), 'rack')
  } catch {
    return notFound(c, 'rack not found')
  }
  const id = data.id ?? `res-${randomUUID().slice(0, 8)}`
  try {
    tx((t) => {
      // Disallow overlap with existing devices (both faces) and with
      // other reservations. Reservations don't track face, so they
      // reserve the U on both faces.
      const uEnd = data.uStart + data.uHeight - 1
      const conflictingDevices = t
        .select({ id: devices.id })
        .from(devices)
        .where(
          and(
            eq(devices.rackId, data.rackId),
            sql`${devices.uStart} <= ${uEnd}`,
            sql`${devices.uStart} + ${devices.uHeight} - 1 >= ${data.uStart}`,
          ),
        )
        .all()
      if (conflictingDevices.length > 0) {
        throw new HttpError(409, 'conflict', 'U-range overlaps an existing device')
      }
      const conflictingReservations = t
        .select({ id: rackReservations.id })
        .from(rackReservations)
        .where(
          and(
            eq(rackReservations.rackId, data.rackId),
            sql`${rackReservations.uStart} <= ${uEnd}`,
            sql`${rackReservations.uStart} + ${rackReservations.uHeight} - 1 >= ${data.uStart}`,
          ),
        )
        .all()
      if (conflictingReservations.length > 0) {
        throw new HttpError(409, 'conflict', 'U-range overlaps an existing reservation')
      }
      t.insert(rackReservations)
        .values({
          id,
          tenantId: actor.tenantId,
          rackId: data.rackId,
          uStart: data.uStart,
          uHeight: data.uHeight,
          label: data.label,
          color: data.color,
          reservedById: data.reservedById ?? actor.id,
          reservedAt: new Date().toISOString(),
          expectedBy: data.expectedBy ?? null,
        })
        .run()
      emitChange(
        c,
        {
          action: 'create',
          entityType: 'rack',
          entityId: data.rackId,
          summary: `Reserved U${data.uStart}–U${data.uStart + data.uHeight - 1} for "${data.label}"`,
        },
        t,
      )
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return errorResponse(c, err.status, err.code, err.message)
    }
    throw err
  }
  return c.json({ id, ...data, tenantId: actor.tenantId }, 201)
})

api.delete('/reservations/:id', (c) => {
  const actor = getActor(c)
  const id = c.req.param('id')
  const res = db.select().from(rackReservations).where(eq(rackReservations.id, id)).get()
  if (!res || res.tenantId !== actor.tenantId) return notFound(c, 'reservation not found')
  db.delete(rackReservations).where(eq(rackReservations.id, id)).run()
  emitChange(c, {
    action: 'delete',
    entityType: 'rack',
    entityId: res.rackId,
    summary: `Released reservation "${res.label}"`,
  })
  return c.json({ ok: true })
})

const createPrefixSchema = z.object({
  id: IdLike.optional(),
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

api.post('/prefixes', async (c) => {
  const actor = getActor(c)
  const r = await readBody(c, createPrefixSchema)
  if (!r.ok) return r.response
  const data = r.data
  // Cross-tenant guards for every optional FK the caller could supply.
  if (data.vrfId) {
    const vrf = db.select().from(vrfs).where(eq(vrfs.id, data.vrfId)).get()
    if (!vrf || vrf.tenantId !== actor.tenantId) return notFound(c, 'vrf not found')
  }
  if (data.parentId) {
    const parent = db.select().from(prefixes).where(eq(prefixes.id, data.parentId)).get()
    if (!parent || parent.tenantId !== actor.tenantId) return notFound(c, 'parent prefix not found')
  }
  if (data.dhcpScopeId) {
    const s = db.select().from(dhcpScopes).where(eq(dhcpScopes.id, data.dhcpScopeId)).get()
    if (!s || s.tenantId !== actor.tenantId) return notFound(c, 'dhcp scope not found')
  }
  if (data.dnsForwardZoneId) {
    const z = db.select().from(dnsZones).where(eq(dnsZones.id, data.dnsForwardZoneId)).get()
    if (!z || z.tenantId !== actor.tenantId) return notFound(c, 'dns zone not found')
  }
  if (data.dnsReverseZoneId) {
    const z = db.select().from(dnsZones).where(eq(dnsZones.id, data.dnsReverseZoneId)).get()
    if (!z || z.tenantId !== actor.tenantId) return notFound(c, 'dns zone not found')
  }
  const id = data.id ?? `prefix-${randomUUID().slice(0, 8)}`
  db.insert(prefixes)
    .values({
      id,
      tenantId: actor.tenantId,
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
  return c.json({ id, ...data, tenantId: actor.tenantId }, 201)
})

const createAddressSchema = z.object({
  id: IdLike.optional(),
  prefixId: IdLike,
  address: z.string().min(1),
  status: z.enum(['free', 'assigned', 'reserved', 'dhcp', 'gateway']),
  dnsName: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
})

api.post('/addresses', async (c) => {
  const actor = getActor(c)
  const r = await readBody(c, createAddressSchema)
  if (!r.ok) return r.response
  const data = r.data
  // Cross-tenant guard: prefixId must belong to the actor's tenant.
  const prefix = db.select().from(prefixes).where(eq(prefixes.id, data.prefixId)).get()
  if (!prefix || prefix.tenantId !== actor.tenantId) return notFound(c, 'prefix not found')
  const id = data.id ?? `ip-${randomUUID().slice(0, 8)}`
  db.insert(ipAddresses)
    .values({
      id,
      tenantId: actor.tenantId,
      prefixId: data.prefixId,
      address: data.address,
      status: data.status,
      dnsName: data.dnsName ?? null,
      description: data.description ?? null,
      assignedPortId: null,
      lastSeenAt: null,
    })
    .run()
  return c.json({ id, ...data, tenantId: actor.tenantId }, 201)
})

const createImageSchema = z.object({
  id: IdLike.optional(),
  url: z.string(),
  caption: z.string().nullable().optional(),
  entityType: z.string(),
  entityId: z.string(),
})

api.post('/images', async (c) => {
  const actor = getActor(c)
  const r = await readBody(c, createImageSchema)
  if (!r.ok) return r.response
  const data = r.data
  const id = data.id ?? `image-${randomUUID().slice(0, 8)}`
  db.insert(imageAttachments)
    .values({
      id,
      tenantId: actor.tenantId,
      authorId: actor.id,
      authorName: actor.name,
      url: data.url,
      caption: data.caption ?? null,
      createdAt: new Date().toISOString(),
      entityType: data.entityType,
      entityId: data.entityId,
    })
    .run()
  return c.json({ id, ...data, tenantId: actor.tenantId, authorId: actor.id, authorName: actor.name }, 201)
})

api.delete('/images/:id', (c) => {
  const actor = getActor(c)
  const id = c.req.param('id')
  const row = db.select().from(imageAttachments).where(eq(imageAttachments.id, id)).get()
  if (!row || row.tenantId !== actor.tenantId) return notFound(c, 'image not found')
  db.delete(imageAttachments).where(eq(imageAttachments.id, id)).run()
  return c.json({ ok: true })
})

const createDeviceTemplateSchema = z.object({
  id: IdLike.optional(),
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

api.post('/device-templates', async (c) => {
  const actor = getActor(c)
  const r = await readBody(c, createDeviceTemplateSchema)
  if (!r.ok) return r.response
  const data = r.data
  const id = data.id ?? `tpl-${randomUUID().slice(0, 8)}`
  db.insert(deviceTemplates)
    .values({
      id,
      tenantId: actor.tenantId,
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
  return c.json({ id, ...data, tenantId: actor.tenantId }, 201)
})

const createNoteSchema = z.object({
  id: IdLike.optional(),
  body: z.string().min(1),
  entityType: z.string(),
  entityId: z.string(),
})

api.post('/notes', async (c) => {
  const actor = getActor(c)
  const r = await readBody(c, createNoteSchema)
  if (!r.ok) return r.response
  const data = r.data
  const id = data.id ?? `note-${randomUUID().slice(0, 8)}`
  const createdAt = new Date().toISOString()
  db.insert(notes)
    .values({
      id,
      tenantId: actor.tenantId,
      authorId: actor.id,
      authorName: actor.name,
      body: data.body,
      createdAt,
      entityType: data.entityType,
      entityId: data.entityId,
    })
    .run()
  return c.json({ id, ...data, tenantId: actor.tenantId, authorId: actor.id, authorName: actor.name, createdAt }, 201)
})

api.delete('/notes/:id', (c) => {
  const actor = getActor(c)
  const id = c.req.param('id')
  const row = db.select().from(notes).where(eq(notes.id, id)).get()
  if (!row || row.tenantId !== actor.tenantId) return notFound(c, 'note not found')
  db.delete(notes).where(eq(notes.id, id)).run()
  return c.json({ ok: true })
})

// === Multipart upload =======================================================
const ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])
const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
}

api.post('/upload', async (c) => {
  const form = await c.req.formData().catch(() => null)
  if (!form) return errorResponse(c, 400, 'validation', 'Expected multipart/form-data')
  const file = form.get('file')
  if (!(file instanceof File)) {
    return errorResponse(c, 400, 'validation', 'Missing file')
  }
  let ext = extname(file.name).toLowerCase()
  if (!ext) ext = EXT_BY_MIME[file.type] ?? ''
  if (!ALLOWED_EXTS.has(ext)) {
    return errorResponse(c, 415, 'validation', `Unsupported file type: ${file.type || 'unknown'}`)
  }
  const name = `${randomUUID()}${ext}`
  const buf = Buffer.from(await file.arrayBuffer())
  writeFileSync(join(UPLOAD_DIR, name), buf)
  const url = `/uploads/${name}`
  return c.json({ url, name, size: buf.byteLength, contentType: file.type }, 201)
})

// Mount the authenticated sub-app under /api.
app.route('/api', api)

// === Static SPA (production) =================================================
// Serve the Vite-built frontend from the same port as the API so a single
// `docker compose up` exposes both. The Docker image sets IPAM_DIST_DIR to
// /app/dist; in dev this directory does not exist and we skip the routes
// entirely so /api keeps answering without competing with the Vite dev
// proxy on :5173. MUST be registered after every /api/* route or the
// `app.get('*')` fallback shadows the API.
if (existsSync(DIST_DIR)) {
  app.use(
    '/assets/*',
    serveStatic({
      root: './',
      rewriteRequestPath: (p) => p.replace(/^\/assets/, DIST_DIR + '/assets'),
    }),
  )
  // SPA fallback: any other non-API GET serves index.html so client-side
  // routing works after a hard refresh.
  app.get('*', (c) => {
    const path = c.req.path
    if (path.startsWith('/api/') || path.startsWith('/uploads/')) {
      return c.notFound()
    }
    return c.html(readFileSync(join(DIST_DIR, 'index.html'), 'utf8'))
  })
}

const port = Number(process.env.PORT ?? 8787)
if (process.env.IPAM_NO_LISTEN !== '1') {
  serve({ fetch: app.fetch, port }, (info) => {
    console.info(`IPAM backend listening on http://localhost:${info.port}`)
  })
}
