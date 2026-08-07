import type { Context, MiddlewareHandler } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { createHmac, scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from './db'
import { users, tenants } from './schema'
import { forbidden, unauthenticated } from './errors'
import type { ApiErrorBody } from './errors'
import { Hono } from 'hono'

/**
 * Server-side authentication + authorization for the IPAM backend.
 *
 * Design (see NUL-18 plan, revision dfd01b96):
 *   - Cookie-based session for v1: signed, httpOnly, SameSite=Lax.
 *     A bearer-token path is intentionally deferred until the Mobile Engineer
 *     is hired.
 *   - `requireAuth` middleware attaches `actor` to the Hono context. Every
 *     `/api/**` route other than `/api/auth/login` calls it.
 *   - `requireRole` enforces RBAC. Viewers cannot mutate. Admin-only routes
 *     gate on `admin`.
 *
 * Password hashing: scrypt (Node built-in, constant-time compare). Salt is
 * stored as `scrypt$N$r$p$<saltB64>$<hashB64>` so the same column can hold
 * hashes with different cost factors if we ever tune them.
 *
 * Tenant-ownership guards (`deviceTenant`, `assertSameTenant`, …) live in
 * `./scope.ts` to keep this module focused on auth concerns.
 */

// ── password hashing ───────────────────────────────────────────────────────

const SCRYPT_N = 16384
const SCRYPT_r = 8
const SCRYPT_p = 1
const KEY_LEN = 64
const SALT_LEN = 16

export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_LEN)
  const hash = scryptSync(plain, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p })
  return `scrypt$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function verifyPassword(plain: string, encoded: string | null | undefined): boolean {
  if (!encoded) return false
  const parts = encoded.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts
  const n = Number(nStr); const r = Number(rStr); const p = Number(pStr)
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false
  let salt: Buffer; let expected: Buffer
  try {
    salt = Buffer.from(saltB64, 'base64')
    expected = Buffer.from(hashB64, 'base64')
  } catch {
    return false
  }
  const actual = scryptSync(plain, salt, expected.length, { N: n, r, p })
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

// ── session cookie ─────────────────────────────────────────────────────────

const COOKIE_NAME = 'ipam_session'
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 7 // 7 days

// Dev fallback. The server logs a warning if this is used.
const DEV_FALLBACK_SECRET = 'ipam-dev-secret-do-not-use-in-prod'

function getSecret(): string {
  const s = process.env.IPAM_SESSION_SECRET
  if (s && s.length >= 16) return s
  console.warn(
    '[ipam] IPAM_SESSION_SECRET is unset or too short; using a DEV-ONLY fallback. ' +
      'Set IPAM_SESSION_SECRET to a random 32+ char string before deploying.',
  )
  return DEV_FALLBACK_SECRET
}

interface SessionPayload {
  userId: string
  iat: number // seconds since epoch
}

function sign(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const mac = createHmac('sha256', getSecret()).update(body).digest('base64url')
  return `${body}.${mac}`
}

function verify(token: string): SessionPayload | null {
  const idx = token.lastIndexOf('.')
  if (idx <= 0) return null
  const body = token.slice(0, idx)
  const mac = token.slice(idx + 1)
  const expected = createHmac('sha256', getSecret()).update(body).digest('base64url')
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return null
  if (!timingSafeEqual(a, b)) return null
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload
    if (typeof parsed.userId !== 'string' || typeof parsed.iat !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

export function setSessionCookie(
  c: Parameters<typeof setCookie>[0],
  userId: string,
): void {
  const token = sign({ userId, iat: Math.floor(Date.now() / 1000) })
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_S,
  })
}

export function clearSessionCookie(c: Parameters<typeof deleteCookie>[0]): void {
  deleteCookie(c, COOKIE_NAME, { path: '/' })
}

function readSession(c: Parameters<typeof getCookie>[0]): SessionPayload | null {
  const raw = getCookie(c, COOKIE_NAME)
  if (!raw) return null
  return verify(raw)
}

// ── actor / context ────────────────────────────────────────────────────────

export type ActorRole = 'admin' | 'editor' | 'viewer'

export interface Actor {
  id: string
  tenantId: string
  name: string
  email: string
  role: ActorRole
  avatarColor: string | null
  /**
   * ISO 8601 timestamp the user finished/skipped the NUL-51 product tour.
   * `null` = not yet completed. Sourced from `users.onboarding_completed_at`
   * (NUL-51.E / NUL-59) and surfaced via `GET /api/auth/me`. Optional on the
   * Actor type so existing call sites don't need to know about the column.
   */
  onboardingCompletedAt?: string | null
}

export interface ActorWithTenant extends Actor {
  tenant: { id: string; name: string; slug: string } | null
}

// Hono module augmentation: attach `actor` to the Context's variable map.
declare module 'hono' {
  interface ContextVariableMap {
    actor: ActorWithTenant
  }
}

export function getActor(c: Context): ActorWithTenant {
  return c.get('actor')
}

// ── rate limiting (in-memory, dev-grade) ──────────────────────────────────

interface Bucket {
  count: number
  resetAt: number
}

const RATE_WINDOW_MS = 60_000
const RATE_MAX = 10 // 10 attempts/min per IP for /api/auth/login

const loginBuckets = new Map<string, Bucket>()

function rateCheck(ip: string): { ok: true } | { ok: false; retryAfterS: number } {
  const now = Date.now()
  const b = loginBuckets.get(ip)
  if (!b || b.resetAt <= now) {
    loginBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return { ok: true }
  }
  if (b.count >= RATE_MAX) {
    return { ok: false, retryAfterS: Math.ceil((b.resetAt - now) / 1000) }
  }
  b.count += 1
  return { ok: true }
}

// periodic cleanup so the map doesn't grow unbounded
let lastCleanup = Date.now()
function maybeCleanup() {
  const now = Date.now()
  if (now - lastCleanup < RATE_WINDOW_MS) return
  lastCleanup = now
  for (const [k, v] of loginBuckets) {
    if (v.resetAt <= now) loginBuckets.delete(k)
  }
}

// ── middleware ─────────────────────────────────────────────────────────────

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const sess = readSession(c)
  if (!sess) {
    return unauthenticated(c, 'Authentication required')
  }
  const row = db.select().from(users).where(eq(users.id, sess.userId)).get()
  if (!row) {
    return unauthenticated(c, 'Session refers to a user that no longer exists')
  }
  const tenant = db.select().from(tenants).where(eq(tenants.id, row.tenantId)).get() ?? null
  c.set('actor', {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    email: row.email,
    role: row.role as ActorRole,
    avatarColor: row.avatarColor ?? null,
    // ISO string or null. Drizzle's `text(...)` returns string | null.
    onboardingCompletedAt: row.onboardingCompletedAt ?? null,
    tenant: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug } : null,
  })
  await next()
  return undefined
}

export function requireRole(min: ActorRole): MiddlewareHandler {
  const rank: Record<ActorRole, number> = { viewer: 1, editor: 2, admin: 3 }
  return async (c, next) => {
    const actor = c.get('actor')
    if (!actor) return unauthenticated(c, 'Authentication required')
    if (rank[actor.role] < rank[min]) {
      return forbidden(c, `Requires ${min} role`)
    }
    await next()
    return undefined
  }
}

// ── error helper for typed response assertion (used by tests) ──────────────

export function isApiError(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error: unknown }).error === 'object' &&
    (value as { error: { code?: unknown } }).error !== null &&
    typeof (value as { error: { code: unknown } }).error.code === 'string'
  )
}

// ── default password (dev seed) ────────────────────────────────────────────

export const DEV_DEFAULT_PASSWORD = 'ipam-dev'

// ── Hono sub-app for /api/auth/* — mounted by index.ts ────────────────────

export const authApp = new Hono()

authApp.post('/login', async (c) => {
  maybeCleanup()
  const ip =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    c.req.header('x-real-ip') ??
    'local'
  const limited = rateCheck(ip)
  if (!limited.ok) {
    c.header('Retry-After', String(limited.retryAfterS))
    return c.json(
      { error: { code: 'forbidden', message: 'Too many login attempts; slow down.' } },
      429,
    )
  }

  const body = (await c.req.json().catch(() => null)) as
    | { email?: unknown; password?: unknown }
    | null
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!email || !password) {
    return c.json(
      { error: { code: 'validation', message: 'email and password are required' } },
      400,
    )
  }
  const row = db.select().from(users).where(eq(users.email, email)).get()
  // Constant-time-ish: always run a hash compare even if the row is missing.
  const ok = row ? verifyPassword(password, row.passwordHash) : verifyPassword(password, null)
  if (!row || !ok) {
    return c.json(
      { error: { code: 'unauthenticated', message: 'Invalid email or password' } },
      401,
    )
  }
  setSessionCookie(c, row.id)
  return c.json({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    tenantId: row.tenantId,
    // NUL-51.E / NUL-59: same shape as /me, so the client doesn't have to
    // re-fetch to learn whether the tour has been completed.
    onboardingCompletedAt: row.onboardingCompletedAt ?? null,
  })
})

authApp.post('/logout', (c) => {
  // NUL-230: use c.body(null, 204) so the Set-Cookie header prepared by
  // clearSessionCookie(c) is actually sent. Returning a bare
  // `new Response(null, { status: 204 })` discards c.res.headers, so the
  // browser kept its old ipam_session cookie and the next /api/auth/me
  // request still succeeded (the user appeared to be "still logged in"
  // after logout). See src/server/__tests__/auth-and-tenant.test.ts for
  // the regression test.
  clearSessionCookie(c)
  return c.body(null, 204)
})

authApp.get('/me', requireAuth, (c) => {
  const actor = getActor(c)
  return c.json({
    id: actor.id,
    name: actor.name,
    email: actor.email,
    role: actor.role,
    tenantId: actor.tenantId,
    tenant: actor.tenant,
    // NUL-51.E / NUL-59: expose the server-side tour-completion timestamp so
    // the client can prefer it over `localStorage` and survive cache clears.
    onboardingCompletedAt: actor.onboardingCompletedAt ?? null,
  })
})
