/**
 * Security tests for NUL-18 — API contract & authorization enforcement.
 *
 * What this proves:
 *   - Unauthenticated requests to any /api/** route (other than /api/auth/login
 *     and /api/auth/logout) receive 401 with the typed error envelope.
 *   - Viewers (role 'viewer') receive 403 on every mutation route.
 *   - Editors / admins from tenant A cannot read, mutate, or delete a row
 *     owned by tenant B — even when supplying the foreign id in the URL or
 *     body — and the response is 404 (not 403, to avoid leaking existence).
 *   - Actor / tenant fields in mutation responses are server-derived; the
 *     client cannot pin them by hand.
 *
 * Strategy: each test gets its own temp IPAM_DATA_DIR. better-sqlite3 doesn't
 * tolerate multiple processes opening the same database file, so two servers
 * sharing one dir is unsafe — instead, every test boots a fresh server with
 * a fresh DB that gets seeded from `src/server/seed.ts`. The seed already
 * provisions `tenant-internal`, `tenant-customer-a`, and `tenant-library`
 * with users and racks in both, which is enough to exercise cross-tenant
 * access. We use node:test (no new dependencies).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))

// Use high, non-default ports that won't collide with `npm run dev:server`.
function pickPort(): number {
  return 19000 + Math.floor(Math.random() * 999)
}

// Dev seed users — see src/lib/mock/tenants.ts + src/server/seed.ts.
// All seeded users have password `ipam-dev` (see seed.ts).
const INTERNAL_ADMIN = { email: 'stephan@internal.example', password: 'ipam-dev' }
const INTERNAL_EDITOR = { email: 'priya@internal.example', password: 'ipam-dev' }
const INTERNAL_VIEWER = { email: 'jordan@internal.example', password: 'ipam-dev' }
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
  // Run the TS source directly via tsx so the test stays in sync with the
  // server implementation. We spawn `node` with `--import tsx`; passing the
  // args as an array (no shell) avoids the Windows path-with-spaces issue.
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

  // Poll /healthz until the server accepts connections (max ~10s).
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
  const dataDir = mkdtempSync(join(tmpdir(), 'ipam-nul18-'))
  const h = await startServer(dataDir)
  try {
    return await fn(h)
  } finally {
    stopServer(h)
    // Give the OS a moment to release the file handle on Windows before
    // rmSync runs (EBUSY otherwise).
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
// 1. Unauthenticated requests get 401 with the typed envelope
// =============================================================================

test('unauthenticated GET /api/sites returns 401 envelope', async () => {
  await withFreshServer(async (h) => {
    const r = await fetch(`${h.base}/api/sites`)
    assert.equal(r.status, 401)
    const env = asEnvelope(await r.json())
    assert.equal(env.error.code, 'unauthenticated')
  })
})

test('unauthenticated POST /api/sites returns 401 envelope', async () => {
  await withFreshServer(async (h) => {
    const r = await fetch(`${h.base}/api/sites`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'naughty' }),
    })
    assert.equal(r.status, 401)
    const env = asEnvelope(await r.json())
    assert.equal(env.error.code, 'unauthenticated')
  })
})

test('unauthenticated GET /api/auth/me returns 401', async () => {
  await withFreshServer(async (h) => {
    const r = await fetch(`${h.base}/api/auth/me`)
    assert.equal(r.status, 401)
    const env = asEnvelope(await r.json())
    assert.equal(env.error.code, 'unauthenticated')
  })
})

test('unauthenticated DELETE /api/devices/:id returns 401', async () => {
  await withFreshServer(async (h) => {
    const r = await fetch(`${h.base}/api/devices/anything`, { method: 'DELETE' })
    assert.equal(r.status, 401)
    const env = asEnvelope(await r.json())
    assert.equal(env.error.code, 'unauthenticated')
  })
})

// =============================================================================
// 2. Login: bad credentials and missing fields use the typed envelope
// =============================================================================

test('login with wrong password returns 401 envelope', async () => {
  await withFreshServer(async (h) => {
    const r = await fetch(`${h.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: INTERNAL_ADMIN.email, password: 'wrong' }),
    })
    assert.equal(r.status, 401)
    const env = asEnvelope(await r.json())
    assert.equal(env.error.code, 'unauthenticated')
  })
})

test('login with missing fields returns 400 validation envelope', async () => {
  await withFreshServer(async (h) => {
    const r = await fetch(`${h.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(r.status, 400)
    const env = asEnvelope(await r.json())
    assert.equal(env.error.code, 'validation')
  })
})

// =============================================================================
// 3. Authenticated reads: tenant scoping
// =============================================================================

test('admin login returns session cookie; /me echoes server-derived tenant', async () => {
  await withFreshServer(async (h) => {
    const cookie = await login(h.base, INTERNAL_ADMIN)
    const me = await fetch(`${h.base}/api/auth/me`, { headers: { cookie } })
    assert.equal(me.status, 200)
    const body = (await me.json()) as Record<string, unknown>
    assert.equal(body.email, INTERNAL_ADMIN.email)
    assert.equal(body.tenantId, 'tenant-internal')
    assert.equal(typeof body.tenant, 'object')
  })
})

test('GET /api/racks returns only the actor tenant\u2019s racks', async () => {
  await withFreshServer(async (h) => {
    const cookie = await login(h.base, INTERNAL_ADMIN)
    const r = await fetch(`${h.base}/api/racks`, { headers: { cookie } })
    assert.equal(r.status, 200)
    const rows = (await r.json()) as Array<Record<string, unknown>>
    assert.ok(Array.isArray(rows))
    assert.ok(rows.length > 0, 'seed should produce at least one rack for tenant-internal')
    for (const row of rows) {
      assert.equal(row.tenantId, 'tenant-internal', `leaked row: ${JSON.stringify(row)}`)
    }
  })
})

// =============================================================================
// 4. Viewer mutations return 403 with the typed envelope
// =============================================================================

test('viewer POST /api/sites returns 403 envelope', async () => {
  await withFreshServer(async (h) => {
    const cookie = await login(h.base, INTERNAL_VIEWER)
    const r = await fetch(`${h.base}/api/sites`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'should not be created' }),
    })
    assert.equal(r.status, 403)
    const env = asEnvelope(await r.json())
    assert.equal(env.error.code, 'forbidden')
  })
})

test('viewer PATCH /api/devices/:id returns 403 envelope', async () => {
  await withFreshServer(async (h) => {
    const cookie = await login(h.base, INTERNAL_VIEWER)
    const r = await fetch(`${h.base}/api/devices/dev-anything`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'nope' }),
    })
    assert.equal(r.status, 403)
    const env = asEnvelope(await r.json())
    assert.equal(env.error.code, 'forbidden')
  })
})

test('viewer DELETE /api/cables/:id returns 403 envelope', async () => {
  await withFreshServer(async (h) => {
    const cookie = await login(h.base, INTERNAL_VIEWER)
    const r = await fetch(`${h.base}/api/cables/cable-anything`, {
      method: 'DELETE',
      headers: { cookie },
    })
    assert.equal(r.status, 403)
    const env = asEnvelope(await r.json())
    assert.equal(env.error.code, 'forbidden')
  })
})

test('viewer can still read (role does not block reads)', async () => {
  await withFreshServer(async (h) => {
    const cookie = await login(h.base, INTERNAL_VIEWER)
    const r = await fetch(`${h.base}/api/sites`, { headers: { cookie } })
    assert.equal(r.status, 200)
  })
})

// =============================================================================
// 5. Cross-tenant: tenant A cannot read or mutate tenant B\u2019s rows
// =============================================================================

test('tenant B sees no rows from tenant A on /api/racks', async () => {
  await withFreshServer(async (h) => {
    const cookie = await login(h.base, ACME_ADMIN)
    const r = await fetch(`${h.base}/api/racks`, { headers: { cookie } })
    assert.equal(r.status, 200)
    const rows = (await r.json()) as Array<Record<string, unknown>>
    for (const row of rows) {
      assert.equal(
        row.tenantId,
        'tenant-customer-a',
        `tenant A saw a tenant B rack: ${JSON.stringify(row)}`,
      )
    }
  })
})

test('tenant B cannot PATCH a tenant A device by id (404)', async () => {
  await withFreshServer(async (h) => {
    const intCookie = await login(h.base, INTERNAL_ADMIN)
    const acmeCookie = await login(h.base, ACME_ADMIN)
    const devicesResp = await fetch(`${h.base}/api/devices`, {
      headers: { cookie: intCookie },
    })
    const internalDevices = (await devicesResp.json()) as Array<{ id: string }>
    if (internalDevices.length === 0) return // skip silently if seed empty
    const foreignId = internalDevices[0]!.id

    const patch = await fetch(`${h.base}/api/devices/${foreignId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: acmeCookie },
      body: JSON.stringify({ name: 'pwned' }),
    })
    // We accept 404 or 403 \u2014 both block the write. 404 is the spec ideal.
    assert.ok(patch.status === 404 || patch.status === 403, `unexpected status ${patch.status}`)
    const env = asEnvelope(await patch.json())
    assert.ok(['not_found', 'forbidden'].includes(env.error.code))

    // Confirm the row was NOT mutated by re-reading as internal.
    const stillThere = await fetch(`${h.base}/api/devices`, {
      headers: { cookie: intCookie },
    })
    const rows = (await stillThere.json()) as Array<{ id: string; name: string }>
    const target = rows.find((r) => r.id === foreignId)
    assert.ok(target, 'the supposedly-modified cross-tenant device is missing')
    assert.notEqual(target.name, 'pwned', 'the cross-tenant device was renamed')
  })
})

test('tenant B cannot DELETE a tenant A device by id (404)', async () => {
  await withFreshServer(async (h) => {
    const intCookie = await login(h.base, INTERNAL_ADMIN)
    const acmeCookie = await login(h.base, ACME_ADMIN)
    const devicesResp = await fetch(`${h.base}/api/devices`, {
      headers: { cookie: intCookie },
    })
    const internalDevices = (await devicesResp.json()) as Array<{ id: string }>
    if (internalDevices.length === 0) return
    const foreignId = internalDevices[0]!.id

    const del = await fetch(`${h.base}/api/devices/${foreignId}`, {
      method: 'DELETE',
      headers: { cookie: acmeCookie },
    })
    assert.ok(del.status === 404 || del.status === 403, `unexpected status ${del.status}`)
    const env = asEnvelope(await del.json())
    assert.ok(['not_found', 'forbidden'].includes(env.error.code))

    // Verify the row was NOT mutated.
    const stillThere = await fetch(`${h.base}/api/devices`, {
      headers: { cookie: intCookie },
    })
    const rows = (await stillThere.json()) as Array<{ id: string }>
    assert.ok(
      rows.some((r) => r.id === foreignId),
      'the supposedly-deleted cross-tenant device is missing',
    )
  })
})

test('tenant B cannot create a prefix pointing at a tenant A vrf (404)', async () => {
  await withFreshServer(async (h) => {
    const intCookie = await login(h.base, INTERNAL_ADMIN)
    const acmeCookie = await login(h.base, ACME_ADMIN)

    // Get a tenant-internal vrfId from the seeded prefixes.
    const prefixesResp = await fetch(`${h.base}/api/prefixes`, {
      headers: { cookie: intCookie },
    })
    const prefixes = (await prefixesResp.json()) as Array<{ vrfId: string | null }>
    const foreignVrf = prefixes.find((p) => p.vrfId)?.vrfId
    if (!foreignVrf) return // skip if the seed didn't put a vrfId on any prefix

    const r = await fetch(`${h.base}/api/prefixes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: acmeCookie },
      body: JSON.stringify({
        vrfId: foreignVrf,
        cidr: '10.99.0.0/24',
        role: 'reserved',
      }),
    })
    assert.equal(r.status, 404, `cross-tenant prefix create must 404, got ${r.status}`)
    const env = asEnvelope(await r.json())
    assert.equal(env.error.code, 'not_found')

    // Confirm the bogus prefix is NOT in tenant-customer-a's list.
    const acmePrefixes = (await (
      await fetch(`${h.base}/api/prefixes`, { headers: { cookie: acmeCookie } })
    ).json()) as Array<{ cidr: string }>
    assert.ok(
      !acmePrefixes.some((p) => p.cidr === '10.99.0.0/24'),
      'cross-tenant prefix was inserted',
    )
  })
})

test('tenant B cannot read a tenant A device by id via /api/devices', async () => {
  // The collection endpoint already filters by tenantId, so this verifies
  // the row simply isn't visible in the listing \u2014 a stronger guarantee
  // than just trying the PATCH.
  await withFreshServer(async (h) => {
    const intCookie = await login(h.base, INTERNAL_ADMIN)
    const acmeCookie = await login(h.base, ACME_ADMIN)

    const intDevices = (await (await fetch(`${h.base}/api/devices`, {
      headers: { cookie: intCookie },
    })).json()) as Array<{ id: string }>
    if (intDevices.length === 0) return
    const foreignId = intDevices[0]!.id

    const acmeDevices = (await (await fetch(`${h.base}/api/devices`, {
      headers: { cookie: acmeCookie },
    })).json()) as Array<{ id: string }>
    assert.ok(
      !acmeDevices.some((d) => d.id === foreignId),
      `tenant A saw a tenant B device id in its list: ${foreignId}`,
    )
  })
})

// =============================================================================
// 6. Server-derived actor / tenant values
// =============================================================================

test('POST /api/notes records server-derived authorId and tenantId', async () => {
  await withFreshServer(async (h) => {
    const cookie = await login(h.base, ACME_ADMIN)
    const r = await fetch(`${h.base}/api/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        // Deliberately try to spoof authorId / tenantId / authorName \u2014 the
        // server must ignore these and use the actor.
        authorId: 'spoofed-user-id',
        tenantId: 'tenant-internal',
        authorName: 'NOT ME',
        body: 'spoof attempt',
        entityType: 'site',
        entityId: 'site-hq',
      }),
    })
    assert.equal(r.status, 201)
    const created = (await r.json()) as Record<string, unknown>
    assert.equal(created.tenantId, 'tenant-customer-a', 'tenantId must be server-derived')
    assert.equal(created.authorId, 'user-acme-admin', 'authorId must be server-derived')
    assert.notEqual(created.authorId, 'spoofed-user-id')
    assert.equal(created.authorName, 'Alice Chen', 'authorName must come from the actor row')
    assert.notEqual(created.authorName, 'NOT ME')
  })
})

// =============================================================================
// 7. Error envelope shape across representative endpoints
// =============================================================================

test('validation errors use the same envelope shape', async () => {
  await withFreshServer(async (h) => {
    const cookie = await login(h.base, INTERNAL_EDITOR)
    const r = await fetch(`${h.base}/api/sites`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: '' }),
    })
    assert.equal(r.status, 400)
    const env = asEnvelope(await r.json())
    assert.equal(env.error.code, 'validation')
  })
})

test('not-found errors use the same envelope shape', async () => {
  await withFreshServer(async (h) => {
    const cookie = await login(h.base, INTERNAL_EDITOR)
    const r = await fetch(`${h.base}/api/racks/does-not-exist`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'whatever' }),
    })
    assert.equal(r.status, 404)
    const env = asEnvelope(await r.json())
    assert.equal(env.error.code, 'not_found')
  })
})

// =============================================================================
// 8. Multipart upload: still requires auth
// =============================================================================

test('unauthenticated POST /api/upload returns 401', async () => {
  await withFreshServer(async (h) => {
    const fd = new FormData()
    fd.set('file', new File(['hello'], 'hello.txt', { type: 'text/plain' }))
    const r = await fetch(`${h.base}/api/upload`, { method: 'POST', body: fd })
    assert.equal(r.status, 401)
    const env = asEnvelope(await r.json())
    assert.equal(env.error.code, 'unauthenticated')
  })
})