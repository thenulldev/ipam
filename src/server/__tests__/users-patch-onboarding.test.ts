/**
 * NUL-59 — PATCH /api/users/:id backend tests.
 *
 * Covers the acceptance criteria added when server-side
 * `onboarding_completed_at` was wired through:
 *
 *   1. GET /api/auth/me returns the column (initially null).
 *   2. POST /api/auth/login returns the column (initially null).
 *   3. PATCH /api/users/:id accepts an ISO 8601 timestamp and persists it.
 *   4. PATCH /api/users/:id accepts `null` (resets the flag → tour replays).
 *   5. The persisted value is reflected by the next GET /api/auth/me.
 *   6. PATCH with a non-ISO string returns 400 validation envelope.
 *   7. PATCH /api/users/:otherUserId returns 404 even when the actor is admin
 *      (self-only authz — onboarding is a personal flag, not an admin-editable
 *      field). Cross-tenant → 404 for the same reason.
 *   8. PATCH on a non-existent user id returns 404.
 *   9. Unauthenticated PATCH returns 401.
 *
 * These tests share the same `withFreshServer` harness as
 * `auth-and-tenant.test.ts` (each test gets its own tmp IPAM_DATA_DIR so
 * better-sqlite3's single-writer constraint isn't violated).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))

function pickPort(): number {
  return 19500 + Math.floor(Math.random() * 999)
}

const INTERNAL_ADMIN = { email: 'stephan@internal.example', password: 'ipam-dev' }
const INTERNAL_EDITOR = { email: 'priya@internal.example', password: 'ipam-dev' }
const ACME_ADMIN = { email: 'alice@acme.example', password: 'ipam-dev' }

interface ServerHandle {
  proc: ChildProcess
  base: string
  port: number
  dataDir: string
  stderr: string
}

async function startServer(dataDir: string): Promise<ServerHandle> {
  const port = pickPort()
  const proc = spawn(
    process.execPath,
    ['--import', 'tsx', 'src/server/index.ts'],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        IPAM_DATA_DIR: dataDir,
        IPAM_SESSION_SECRET: 'test-secret-do-not-use-in-prod-32chars-minimum',
        NODE_ENV: 'test',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const handle: ServerHandle = {
    proc,
    base: `http://127.0.0.1:${port}`,
    port,
    dataDir,
    stderr: '',
  }
  proc.stderr?.on('data', (c) => {
    handle.stderr += c.toString('utf8')
  })
  proc.stdout?.on('data', (c) => {
    handle.stderr += c.toString('utf8')
  })

  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${handle.base}/healthz`)
      if (r.status === 200) return handle
    } catch {
      // not ready yet
    }
    await new Promise((res) => setTimeout(res, 100))
  }
  proc.kill()
  throw new Error(
    `server on port ${port} did not become ready in 10s.\nstderr:\n${handle.stderr}`,
  )
}

function stopServer(handle: ServerHandle): void {
  try {
    handle.proc.kill()
  } catch {
    /* ignore */
  }
}

async function withFreshServer<T>(
  fn: (h: ServerHandle) => Promise<T>,
): Promise<T> {
  const dataDir = mkdtempSync(join(tmpdir(), 'ipam-nul59-'))
  const h = await startServer(dataDir)
  try {
    return await fn(h)
  } finally {
    stopServer(h)
    await new Promise((res) => setTimeout(res, 50))
    rmSync(dataDir, { recursive: true, force: true })
  }
}

async function login(base: string, who: { email: string; password: string }): Promise<string> {
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(who),
  })
  if (r.status !== 200) {
    const text = await r.text().catch(() => '')
    throw new Error(`login failed for ${who.email}: ${r.status} ${text}`)
  }
  const setCookie = r.headers.get('set-cookie') ?? ''
  const cookie = setCookie.split(';')[0]
  if (!cookie) throw new Error('no session cookie returned')
  return cookie
}

function asEnvelope(body: unknown): { error: { code: string; message: string } } {
  assert.equal(typeof body, 'object', `expected object body, got ${typeof body}`)
  assert.ok(body !== null, 'body is null')
  const b = body as Record<string, unknown>
  assert.ok('error' in b, `expected envelope { error: {...} }, got ${JSON.stringify(body)}`)
  const err = b.error as Record<string, unknown>
  assert.equal(typeof err.code, 'string')
  assert.equal(typeof err.message, 'string')
  return { error: { code: err.code as string, message: err.message as string } }
}

// =============================================================================
// 1. /api/auth/me surfaces the column (initially null on a fresh seed)
// =============================================================================

test('GET /api/auth/me returns onboardingCompletedAt (initially null)', async () => {
  await withFreshServer(async (h) => {
    const cookie = await login(h.base, INTERNAL_ADMIN)
    const r = await fetch(`${h.base}/api/auth/me`, { headers: { cookie } })
    assert.equal(r.status, 200)
    const body = (await r.json()) as Record<string, unknown>
    assert.ok(
      'onboardingCompletedAt' in body,
      `missing onboardingCompletedAt on /me: ${JSON.stringify(body)}`,
    )
    assert.equal(body.onboardingCompletedAt, null)
  })
})

test('POST /api/auth/login returns onboardingCompletedAt (initially null)', async () => {
  await withFreshServer(async (h) => {
    const r = await fetch(`${h.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(INTERNAL_ADMIN),
    })
    assert.equal(r.status, 200)
    const body = (await r.json()) as Record<string, unknown>
    assert.ok('onboardingCompletedAt' in body)
    assert.equal(body.onboardingCompletedAt, null)
  })
})

// =============================================================================
// 2. PATCH /api/users/:id — happy path + persistence
// =============================================================================

test('PATCH /api/users/:id with ISO timestamp persists and is reflected on /me', async () => {
  await withFreshServer(async (h) => {
    const cookie = await login(h.base, INTERNAL_ADMIN)
    const ts = '2026-07-17T18:30:00.000Z'
    const patch = await fetch(`${h.base}/api/users/user-stephan`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ onboardingCompletedAt: ts }),
    })
    assert.equal(patch.status, 200)
    const updated = (await patch.json()) as Record<string, unknown>
    assert.equal(updated.id, 'user-stephan')
    assert.equal(updated.onboardingCompletedAt, ts)

    // Re-read /me: server value must round-trip.
    const me = await fetch(`${h.base}/api/auth/me`, { headers: { cookie } })
    assert.equal(me.status, 200)
    const body = (await me.json()) as Record<string, unknown>
    assert.equal(body.onboardingCompletedAt, ts)
  })
})

test('PATCH /api/users/:id with null resets the flag (so the tour can replay)', async () => {
  await withFreshServer(async (h) => {
    const cookie = await login(h.base, INTERNAL_ADMIN)
    // First, set a timestamp.
    const ts = '2026-07-17T18:30:00.000Z'
    await fetch(`${h.base}/api/users/user-stephan`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ onboardingCompletedAt: ts }),
    })
    // Now reset it.
    const reset = await fetch(`${h.base}/api/users/user-stephan`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ onboardingCompletedAt: null }),
    })
    assert.equal(reset.status, 200)
    const body = (await reset.json()) as Record<string, unknown>
    assert.equal(body.onboardingCompletedAt, null)

    // /me should also be null.
    const me = await fetch(`${h.base}/api/auth/me`, { headers: { cookie } })
    const meBody = (await me.json()) as Record<string, unknown>
    assert.equal(meBody.onboardingCompletedAt, null)
  })
})

test('PATCH /api/users/:id accepts a no-op empty body and returns the row', async () => {
  await withFreshServer(async (h) => {
    const cookie = await login(h.base, INTERNAL_ADMIN)
    const r = await fetch(`${h.base}/api/users/user-stephan`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({}),
    })
    assert.equal(r.status, 200)
    const body = (await r.json()) as Record<string, unknown>
    assert.equal(body.id, 'user-stephan')
    assert.equal(body.onboardingCompletedAt, null)
  })
})

// =============================================================================
// 3. PATCH validation — ISO 8601 only
// =============================================================================

test('PATCH /api/users/:id with non-ISO string returns 400 validation envelope', async () => {
  await withFreshServer(async (h) => {
    const cookie = await login(h.base, INTERNAL_ADMIN)
    const r = await fetch(`${h.base}/api/users/user-stephan`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ onboardingCompletedAt: 'yesterday' }),
    })
    assert.equal(r.status, 400)
    const env = asEnvelope(await r.json())
    assert.equal(env.error.code, 'validation')
  })
})

test('PATCH /api/users/:id with empty string returns 400 validation envelope', async () => {
  await withFreshServer(async (h) => {
    const cookie = await login(h.base, INTERNAL_ADMIN)
    const r = await fetch(`${h.base}/api/users/user-stephan`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ onboardingCompletedAt: '' }),
    })
    assert.equal(r.status, 400)
    const env = asEnvelope(await r.json())
    assert.equal(env.error.code, 'validation')
  })
})

// =============================================================================
// 4. PATCH authz — self-only, plus tenant boundary as 404
// =============================================================================

test('PATCH on another user in the same tenant returns 404 (self-only)', async () => {
  // INTERNAL_ADMIN (stephan) cannot PATCH INTERNAL_EDITOR (priya), even though
  // both belong to tenant-internal and stephan is an admin. Onboarding state
  // is a personal completion flag, not an admin-editable field.
  await withFreshServer(async (h) => {
    const adminCookie = await login(h.base, INTERNAL_ADMIN)
    const r = await fetch(`${h.base}/api/users/user-internal-editor`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({ onboardingCompletedAt: '2026-07-17T18:30:00.000Z' }),
    })
    assert.equal(r.status, 404)
    const env = asEnvelope(await r.json())
    assert.equal(env.error.code, 'not_found')

    // Confirm the target row was NOT mutated by re-reading /me as that user.
    const editorCookie = await login(h.base, INTERNAL_EDITOR)
    const me = await fetch(`${h.base}/api/auth/me`, {
      headers: { cookie: editorCookie },
    })
    const body = (await me.json()) as Record<string, unknown>
    assert.equal(body.onboardingCompletedAt, null)
  })
})

test('PATCH cross-tenant returns 404 (not 403 — no existence leak)', async () => {
  await withFreshServer(async (h) => {
    const acmeCookie = await login(h.base, ACME_ADMIN)
    const r = await fetch(`${h.base}/api/users/user-stephan`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: acmeCookie },
      body: JSON.stringify({ onboardingCompletedAt: '2026-07-17T18:30:00.000Z' }),
    })
    assert.equal(r.status, 404)
    const env = asEnvelope(await r.json())
    assert.equal(env.error.code, 'not_found')

    // Confirm stephan's row was not mutated.
    const intCookie = await login(h.base, INTERNAL_ADMIN)
    const me = await fetch(`${h.base}/api/auth/me`, { headers: { cookie: intCookie } })
    const body = (await me.json()) as Record<string, unknown>
    assert.equal(body.onboardingCompletedAt, null)
  })
})

test('PATCH on non-existent user id returns 404', async () => {
  await withFreshServer(async (h) => {
    const cookie = await login(h.base, INTERNAL_ADMIN)
    const r = await fetch(`${h.base}/api/users/user-does-not-exist`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ onboardingCompletedAt: '2026-07-17T18:30:00.000Z' }),
    })
    assert.equal(r.status, 404)
    const env = asEnvelope(await r.json())
    assert.equal(env.error.code, 'not_found')
  })
})

// =============================================================================
// 5. PATCH requires auth
// =============================================================================

test('unauthenticated PATCH /api/users/:id returns 401', async () => {
  await withFreshServer(async (h) => {
    const r = await fetch(`${h.base}/api/users/user-stephan`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ onboardingCompletedAt: '2026-07-17T18:30:00.000Z' }),
    })
    assert.equal(r.status, 401)
    const env = asEnvelope(await r.json())
    assert.equal(env.error.code, 'unauthenticated')
  })
})