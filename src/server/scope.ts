import { and, eq, type SQL } from 'drizzle-orm'
import { db } from './db'
import {
  racks,
  rooms,
  sites,
  floorplans,
  devices,
  ports,
  cables,
  users,
} from './schema'
import type { Actor } from './auth'

// `users` is intentionally retained as an export from this module's import
// surface so a future `assertUserInTenant()` helper has a typed handle; the
// ESLint override on the import keeps the type from being flagged dead.
// (We use it below in `userTenant`.)

/**
 * Server-side tenant scoping helpers.
 *
 * Every read and write must pass through one of these helpers. They enforce
 * the tenant boundary that the web/mobile client must NOT be trusted to
 * honour.
 */

/** Build a `WHERE table.tenantId = ?` clause for any tenant-scoped table. */
export function tenantClause<T extends { tenantId: import('drizzle-orm/sqlite-core').SQLiteColumn }>(
  table: T,
  tenantId: string,
): SQL {
  return eq(table.tenantId, tenantId)
}

/** Combine an optional user-supplied filter with the tenant clause. */
export function andTenant<T extends { tenantId: import('drizzle-orm/sqlite-core').SQLiteColumn }>(
  table: T,
  tenantId: string,
  ...rest: (SQL | undefined)[]
): SQL {
  return and(eq(table.tenantId, tenantId), ...rest.filter((x): x is SQL => Boolean(x)))!
}

/**
 * Resolve the tenantId of a device by walking device → rack. Returns
 * `undefined` if the device does not exist.
 */
export function deviceTenant(deviceId: string): string | undefined {
  const row = db
    .select({ tenantId: racks.tenantId })
    .from(devices)
    .innerJoin(racks, eq(racks.id, devices.rackId))
    .where(eq(devices.id, deviceId))
    .get()
  return row?.tenantId
}

/** Resolve the tenantId of a port by walking port → device → rack. */
export function portTenant(portId: string): string | undefined {
  const row = db
    .select({ tenantId: racks.tenantId })
    .from(ports)
    .innerJoin(devices, eq(devices.id, ports.deviceId))
    .innerJoin(racks, eq(racks.id, devices.rackId))
    .where(eq(ports.id, portId))
    .get()
  return row?.tenantId
}

/** Resolve the tenantId of a cable by walking cable → port → device → rack. */
export function cableTenant(cableId: string): string | undefined {
  // cables reference portAId / portBId; both must be in the same tenant.
  const row = db
    .select({ tenantId: racks.tenantId })
    .from(cables)
    .innerJoin(ports, eq(ports.id, cables.portAId))
    .innerJoin(devices, eq(devices.id, ports.deviceId))
    .innerJoin(racks, eq(racks.id, devices.rackId))
    .where(eq(cables.id, cableId))
    .get()
  return row?.tenantId
}

/** Resolve the tenantId of a rack directly. */
export function rackTenant(rackId: string): string | undefined {
  return db.select({ tenantId: racks.tenantId }).from(racks).where(eq(racks.id, rackId)).get()?.tenantId
}

/** Resolve the tenantId of a room via site. */
export function roomTenant(roomId: string): string | undefined {
  const row = db
    .select({ tenantId: sites.tenantId })
    .from(rooms)
    .innerJoin(sites, eq(sites.id, rooms.siteId))
    .where(eq(rooms.id, roomId))
    .get()
  return row?.tenantId
}

/** Resolve the tenantId of a floorplan via room → site. */
export function floorplanTenant(floorplanId: string): string | undefined {
  const row = db
    .select({ tenantId: sites.tenantId })
    .from(floorplans)
    .innerJoin(rooms, eq(rooms.id, floorplans.roomId))
    .innerJoin(sites, eq(sites.id, rooms.siteId))
    .where(eq(floorplans.id, floorplanId))
    .get()
  return row?.tenantId
}

/**
 * Resolve the tenantId of a user directly. `users` carries `tenant_id`
 * natively (no JOIN needed). Used by `PATCH /api/users/:id` (NUL-59) to
 * enforce the tenant boundary before letting an actor edit their own row.
 */
export function userTenant(userId: string): string | undefined {
  return db
    .select({ tenantId: users.tenantId })
    .from(users)
    .where(eq(users.id, userId))
    .get()?.tenantId
}

/** Assert the actor's tenantId matches the given row's tenantId. */
export function assertSameTenant(
  actor: Actor,
  rowTenantId: string | undefined,
  resourceLabel: string,
): asserts rowTenantId is string {
  if (!rowTenantId) {
    const err = new Error(`${resourceLabel} not found`)
    ;(err as Error & { code?: string }).code = 'not_found'
    throw err
  }
  if (rowTenantId !== actor.tenantId) {
    // Pretend it doesn't exist — leaking existence is information.
    const err = new Error(`${resourceLabel} not found`)
    ;(err as Error & { code?: string }).code = 'not_found'
    throw err
  }
}

/** Like `assertSameTenant`, but for resources reached through a join. */
export function assertSameTenantIndirect(
  actor: Actor,
  derived: string | undefined,
  resourceLabel: string,
): void {
  return assertSameTenant(actor, derived, resourceLabel)
}
