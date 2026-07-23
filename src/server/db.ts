import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'

// better-sqlite3 is synchronous; the wrapper below exposes drizzle's typed
// transaction API on top of `BEGIN IMMEDIATE` so concurrent writers
// serialize instead of stepping on each other's read-then-write sequences.
export type Tx = BetterSQLite3Database<typeof schema>

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// IPAM_DATA_DIR (set by docker-compose) takes precedence over IPAM_DB so a
// container can point at /data once and inherit the rest. On bare dev we
// still default to ./data/ipam.db.
const DATA_DIR = process.env.IPAM_DATA_DIR
  ? process.env.IPAM_DATA_DIR
  : dirname(process.env.IPAM_DB ?? join(__dirname, '..', '..', 'data', 'ipam.db'))
const DB_PATH = process.env.IPAM_DATA_DIR
  ? join(process.env.IPAM_DATA_DIR, 'ipam.db')
  : (process.env.IPAM_DB ?? join(__dirname, '..', '..', 'data', 'ipam.db'))
mkdirSync(DATA_DIR, { recursive: true })

export const sqlite = new Database(DB_PATH)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')
// 5 s busy timeout so concurrent writers serialize cleanly instead of
// throwing SQLITE_BUSY on read-then-write sequences covered by `tx()`.
sqlite.pragma('busy_timeout = 5000')

export const db = drizzle(sqlite, { schema })

/**
 * Run `fn` inside a `BEGIN IMMEDIATE` transaction so concurrent writers
 * serialize at BEGIN instead of racing on the first read. better-sqlite3
 * is synchronous so the callback can be `sync`; we call the underlying
 * `.immediate()` mode on better-sqlite3's transaction wrapper, which
 * matches what the route handlers in `server/index.ts` rely on (POST
 * /cables, DELETE /devices, etc. all assume read-then-write atomicity).
 *
 * Throwing inside `fn` rolls back; returning the value commits.
 */
export function tx<T>(fn: (tx: Tx) => T): T {
  // Drizzle's better-sqlite3 driver defaults to `behavior: 'deferred'`,
  // which lets two transactions both BEGIN, both read, and then compete
  // for the writer lock — the exact read-then-write window that exposes
  // the POST /cables race. Forcing IMMEDIATE acquires the RESERVED lock
  // at BEGIN, so only one writer enters the critical section at a time.
  return db.transaction(fn, { behavior: 'immediate' }) as T
}

// Run create-table migrations idempotently on startup.
// Drizzle Kit migrations would be the proper way; for the scaffold this
// simple "create if not exists" loop is enough.
function ensureTables() {
  // Generated from drizzle-kit push; embedded here so we don't need a separate
  // migration step at scaffold time.
  const statements = [
    `CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      brand_color TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      avatar_color TEXT,
      password_hash TEXT,
      onboarding_completed_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      address TEXT,
      tags TEXT NOT NULL DEFAULT '[]'
    )`,
    `CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      site_id TEXT NOT NULL REFERENCES sites(id),
      name TEXT NOT NULL,
      floorplan_id TEXT,
      tags TEXT NOT NULL DEFAULT '[]'
    )`,
    `CREATE TABLE IF NOT EXISTS floorplans (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      room_id TEXT NOT NULL REFERENCES rooms(id),
      name TEXT NOT NULL,
      image_url TEXT,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS racks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      room_id TEXT NOT NULL REFERENCES rooms(id),
      name TEXT NOT NULL,
      u_height INTEGER NOT NULL,
      width_mm INTEGER,
      depth_mm INTEGER,
      tags TEXT NOT NULL DEFAULT '[]',
      power_budget_watts INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS rack_positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      floorplan_id TEXT NOT NULL REFERENCES floorplans(id),
      rack_id TEXT NOT NULL REFERENCES racks(id),
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      rotation INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS rack_reservations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      rack_id TEXT NOT NULL REFERENCES racks(id),
      u_start INTEGER NOT NULL,
      u_height INTEGER NOT NULL,
      label TEXT NOT NULL,
      color TEXT NOT NULL,
      reserved_by_id TEXT NOT NULL,
      reserved_at TEXT NOT NULL,
      expected_by TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      rack_id TEXT NOT NULL REFERENCES racks(id),
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      model TEXT,
      vendor TEXT,
      u_start INTEGER NOT NULL,
      u_height INTEGER NOT NULL,
      face TEXT NOT NULL DEFAULT 'front',
      asset_tag TEXT,
      serial_number TEXT,
      purchase_date TEXT,
      warranty_eol TEXT,
      wattage INTEGER,
      tags TEXT NOT NULL DEFAULT '[]',
      custom_fields TEXT NOT NULL DEFAULT '{}'
    )`,
    `CREATE TABLE IF NOT EXISTS ports (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      kind TEXT NOT NULL,
      position INTEGER NOT NULL,
      cable_id TEXT,
      ip_address_id TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS cables (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      length_m INTEGER,
      label TEXT,
      port_a_id TEXT NOT NULL REFERENCES ports(id),
      port_b_id TEXT NOT NULL REFERENCES ports(id)
    )`,
    `CREATE TABLE IF NOT EXISTS vrfs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      rd TEXT,
      description TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS vlans (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      vrf_id TEXT REFERENCES vrfs(id),
      vid INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS prefixes (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      vrf_id TEXT REFERENCES vrfs(id),
      cidr TEXT NOT NULL,
      role TEXT NOT NULL,
      description TEXT,
      parent_id TEXT,
      dhcp_scope_id TEXT,
      dns_forward_zone_id TEXT,
      dns_reverse_zone_id TEXT,
      tags TEXT NOT NULL DEFAULT '[]'
    )`,
    `CREATE TABLE IF NOT EXISTS ip_addresses (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      prefix_id TEXT NOT NULL REFERENCES prefixes(id),
      address TEXT NOT NULL,
      status TEXT NOT NULL,
      dns_name TEXT,
      description TEXT,
      assigned_port_id TEXT,
      last_seen_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS dhcp_scopes (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      range_start TEXT NOT NULL,
      range_end TEXT NOT NULL,
      lease_seconds INTEGER NOT NULL,
      gateway TEXT,
      dns_servers TEXT NOT NULL DEFAULT '[]',
      options TEXT NOT NULL DEFAULT '[]'
    )`,
    `CREATE TABLE IF NOT EXISTS dns_zones (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      primary_ns TEXT NOT NULL,
      admin_email TEXT NOT NULL,
      ttl INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS device_templates (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      vendor TEXT NOT NULL,
      model TEXT,
      kind TEXT NOT NULL,
      u_height INTEGER NOT NULL,
      default_face TEXT NOT NULL DEFAULT 'front',
      port_groups TEXT NOT NULL DEFAULT '[]',
      description TEXT,
      image_url TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      author_id TEXT NOT NULL REFERENCES users(id),
      author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS image_attachments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      author_id TEXT NOT NULL REFERENCES users(id),
      author_name TEXT NOT NULL,
      url TEXT NOT NULL,
      caption TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS change_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      actor_id TEXT NOT NULL REFERENCES users(id),
      actor_name TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      before_state TEXT,
      after_state TEXT,
      context TEXT,
      outcome TEXT NOT NULL DEFAULT 'ok',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  ]
  // Additive ALTERs for legacy DBs that pre-date the before/after columns.
  // Each ALTER is wrapped to swallow the "duplicate column name" error.
  // IMPORTANT: these must run AFTER `statements` below — ALTER fails on a
  // missing table, and a clean-box install hits that path.
  const legacyAlters = [
    `ALTER TABLE change_events ADD COLUMN before_state TEXT`,
    `ALTER TABLE change_events ADD COLUMN after_state TEXT`,
    `ALTER TABLE change_events ADD COLUMN context TEXT`,
    `ALTER TABLE change_events ADD COLUMN outcome TEXT NOT NULL DEFAULT 'ok'`,
    // NUL-18: password column added in this PR. New tables get it via the
    // CREATE above; legacy DBs need this ALTER.
    `ALTER TABLE users ADD COLUMN password_hash TEXT`,
    // NUL-59: server-side onboarding completion timestamp (NUL-51.E follow-up).
    // Nullable so existing rows get NULL = "tour not completed yet".
    `ALTER TABLE users ADD COLUMN onboarding_completed_at TEXT`,
  ]
  // Indexes that power the /api/audit-log query surface (NUL-12).
  const indexStatements = [
    `CREATE INDEX IF NOT EXISTS idx_change_events_tenant_time
       ON change_events(tenant_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_change_events_actor
       ON change_events(tenant_id, actor_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_change_events_entity
       ON change_events(tenant_id, entity_type, entity_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_change_events_outcome
       ON change_events(tenant_id, outcome, created_at DESC)`,
  ]
  for (const stmt of statements) {
    sqlite.exec(stmt)
  }
  for (const stmt of legacyAlters) {
    try {
      sqlite.exec(stmt)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!/duplicate column name/i.test(msg)) throw err
    }
  }
  for (const stmt of indexStatements) {
    sqlite.exec(stmt)
  }
}

ensureTables()

// Quick row-counts to surface seed status
export function countsByTenant() {
  const rows = sqlite
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM racks WHERE tenant_id = ?) AS racks,
        (SELECT COUNT(*) FROM devices WHERE rack_id IN (SELECT id FROM racks WHERE tenant_id = ?)) AS devices,
        (SELECT COUNT(*) FROM ports WHERE device_id IN (SELECT id FROM devices WHERE rack_id IN (SELECT id FROM racks WHERE tenant_id = ?))) AS ports`,
    )
    .all('tenant-internal', 'tenant-internal', 'tenant-internal')
  return rows
}
