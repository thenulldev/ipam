/**
 * NUL-49 cable-create race-condition audit.
 *
 * Spins up one server against a fresh DB, logs in, and fires N concurrent
 * POST /api/cables where every request asks for the SAME two ports. With
 * `BEGIN DEFERRED` (the drizzle default for better-sqlite3), two writers
 * can both read `cableId = NULL` and both attempt to insert — one wins on
 * the UNIQUE constraint on ports.cableId? (no such index exists) — or, more
 * realistically here, both reads see NULL, both txs proceed to insert, and
 * the second insert into `cables` succeeds because there's no unique
 * constraint preventing two cable rows from pointing at the same port pair.
 *
 * Acceptance: out of N concurrent requests targeting the same ports,
 *   - exactly 1 returns 201 with the cable row,
 *   - the rest return 409 conflict,
 *   - ports.cableId points at the winning cable id (not NULL, not split),
 *   - and `cables` has exactly 1 row for that port pair.
 *
 * Pre-fix this test reproduces the double-insert; post-fix it passes.
 *
 * Process model: one server is enough because better-sqlite3 is synchronous
 * inside one process and multiple Hono handlers running on the event loop
 * still queue sync work via the libuv threadpool the way the DB driver
 * expects — which is exactly the surface where BEGIN DEFERRED races.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))

const INTERNAL_ADMIN = { email: 'stephan@internal.example', password: 'ipam-dev' }

interface ServerHandle {
  proc: ChildProcess
  base: string
  port: number
  dataDir: string
  stderr: string
}

function pickPort(): number {
  return 19500 + Math.floor(Math.random() * 999)
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
        IPAM_SESSION_SECRET: 'cable-race-test-secret-32chars',
        NODE_ENV: 'test',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const handle: ServerHandle = {
    proc, base: `http://127.0.0.1:${port}`, port, dataDir, stderr: '',
  }
  proc.stderr?.on('data', (c) => { handle.stderr += c.toString('utf8') })
  proc.stdout?.on('data', (c) => { handle.stderr += c.toString('utf8') })

  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${handle.base}/healthz`)
      if (r.status === 200) return handle
    } catch { /* not ready */ }
    await new Promise((res) => setTimeout(res, 100))
  }
  proc.kill()
  throw new Error(`server on port ${port} did not become ready in 10s.\nstderr:\n${handle.stderr}`)
}

async function stopServer(h: ServerHandle): Promise<void> {
  h.proc.kill('SIGKILL')
  // Give the child a moment to release the SQLite file handle on Windows.
  await new Promise((res) => setTimeout(res, 200))
}

async function loginAs(base: string, creds: { email: string; password: string }): Promise<string> {
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(creds),
  })
  assert.equal(r.status, 200, `login failed: ${r.status}\n${await r.text()}`)
  const setCookie = r.headers.get('set-cookie') ?? ''
  const cookie = setCookie.split(/,(?=\s*[^;]+=)/).find((c) => c.trim().startsWith('ipam_session='))
  assert.ok(cookie, `no session cookie returned: ${setCookie}`)
  return cookie!.split(';')[0]
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  if (r.status !== 200) {
    const text = await r.text()
    throw new Error(`GET ${url} -> ${r.status}: ${text}`)
  }
  return (await r.json()) as T
}

test('concurrent POST /api/cables to the same ports: exactly one wins', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'ipam-cable-race-'))
  const h = await startServer(dataDir)
  try {
    const cookie = await loginAs(h.base, INTERNAL_ADMIN)
    const ports = await getJson<Array<{ id: string; cableId: string | null }>>(
      `${h.base}/api/ports`, { headers: { cookie } },
    )
    const free = ports.filter((p) => p.cableId === null)
    assert.ok(free.length >= 2, `need at least 2 free ports, found ${free.length}`)
    const portA = free[0]!.id
    const portB = free[1]!.id

    const N = 30
    const requests = Array.from({ length: N }, (_, i) =>
      fetch(`${h.base}/api/cables`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          id: `cable-race-${i}-${Date.now()}`,
          kind: 'cat6',
          portAId: portA,
          portBId: portB,
          label: `race-${i}`,
        }),
      }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })),
    )
    const results = await Promise.all(requests)

    const winners = results.filter((r) => r.status === 201)
    const conflicts = results.filter((r) => r.status === 409)
    const others = results.filter((r) => r.status !== 201 && r.status !== 409)

    assert.equal(others.length, 0, `unexpected statuses: ${JSON.stringify(others)}`)
    assert.equal(winners.length, 1, `expected exactly 1 winner, got ${winners.length}: ${JSON.stringify(results)}`)
    assert.equal(conflicts.length, N - 1, `expected ${N - 1} conflicts, got ${conflicts.length}`)

    // ports must each point at the winning cable id
    const winId = (winners[0]!.body as { id: string }).id
    const portsAfter = await getJson<Array<{ id: string; cableId: string | null }>>(
      `${h.base}/api/ports`, { headers: { cookie } },
    )
    const a = portsAfter.find((p) => p.id === portA)
    const b = portsAfter.find((p) => p.id === portB)
    assert.equal(a?.cableId, winId, `portA.cableId should be ${winId}, got ${a?.cableId}`)
    assert.equal(b?.cableId, winId, `portB.cableId should be ${winId}, got ${b?.cableId}`)

    // exactly one cable row for that port pair
    const cables = await getJson<Array<{ id: string; portAId: string; portBId: string }>>(
      `${h.base}/api/cables`, { headers: { cookie } },
    )
    const matching = cables.filter((c) =>
      (c.portAId === portA && c.portBId === portB) ||
      (c.portAId === portB && c.portBId === portA),
    )
    assert.equal(matching.length, 1, `expected 1 cable row for that port pair, got ${matching.length}`)
    assert.equal(matching[0]!.id, winId)
  } finally {
    await stopServer(h)
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})