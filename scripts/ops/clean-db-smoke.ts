/**
 * Boot the server against a brand-new temporary SQLite directory and verify
 * the readiness contract used by CI and Docker.
 *
 * Checks:
 *   - /healthz returns 200 with an up database and non-zero seed count.
 *   - An authenticated request to /api/tenants returns at least one tenant.
 *
 * The child process and temporary directory are always removed before exit.
 */
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const LOGIN = { email: 'stephan@internal.example', password: 'ipam-dev' }

type Server = { process: ChildProcess; baseUrl: string }

async function freePort(): Promise<number> {
  const probe = net.createServer()
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => resolve())
  })
  const address = probe.address()
  assert.ok(address && typeof address !== 'string')
  const port = address.port
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  return port
}

async function startServer(port: number, dataDir: string): Promise<Server> {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      IPAM_DATA_DIR: dataDir,
      IPAM_SESSION_SECRET: 'clean-db-smoke-secret-32-characters-long',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr?.on('data', (chunk) => { stderr += chunk.toString() })
  const baseUrl = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/healthz`)
      if (response.status === 200) return { process: child, baseUrl }
    } catch {
      // The listener is not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  child.kill()
  throw new Error(`server did not become ready: ${stderr}`)
}

function stopServer(server: Server | undefined): Promise<void> {
  if (!server) return Promise.resolve()
  return new Promise<void>((resolve) => {
    if (server.process.exitCode !== null) return resolve()
    server.process.once('exit', () => resolve())
    server.process.kill()
    // Belt-and-braces: if the child ignores SIGTERM (rare on Linux,
    // common on Windows where tsx keeps the SQLite handle open for a
    // tick after the signal), SIGKILL it after a short grace period
    // so the temp directory can be unlinked.
    setTimeout(() => {
      if (server.process.exitCode === null) {
        try { server.process.kill('SIGKILL') } catch { /* already gone */ }
      }
    }, 500).unref()
  })
}

async function main(): Promise<void> {
  const dataDir = mkdtempSync(join(tmpdir(), 'ipam-clean-db-'))
  let server: Server | undefined
  try {
    server = await startServer(await freePort(), dataDir)

    const healthResponse = await fetch(`${server.baseUrl}/healthz`)
    const health = await healthResponse.json() as {
      ok?: boolean
      db?: string
      seedCounts?: { tenants?: number }
    }
    assert.equal(healthResponse.status, 200)
    assert.equal(health.ok, true)
    assert.equal(health.db, 'up')
    assert.ok((health.seedCounts?.tenants ?? 0) > 0)

    const loginResponse = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(LOGIN),
    })
    assert.equal(loginResponse.status, 200)
    const cookie = loginResponse.headers.get('set-cookie')?.split(';')[0]
    assert.ok(cookie)

    const tenantsResponse = await fetch(`${server.baseUrl}/api/tenants`, {
      headers: { cookie },
    })
    const tenants = await tenantsResponse.json() as unknown
    assert.equal(tenantsResponse.status, 200)
    assert.ok(Array.isArray(tenants) && tenants.length > 0)

    console.log(`CLEAN DB SMOKE: OK (healthz=200, tenants=${tenants.length})`)
  } finally {
    await stopServer(server)
  }
  // Retry the unlink on Windows: SQLite releases its handle lazily after
  // process exit, so a single rmSync can race with the kernel's lock
  // teardown. A handful of short retries is plenty. We do this *after*
  // stopping the server so the rule against throws inside `finally`
  // doesn't force us to choose between swallowing teardown errors and
  // masking the real assertion failure.
  let lastErr: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      rmSync(dataDir, { recursive: true, force: true })
      lastErr = undefined
      break
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 200))
    }
  }
  if (lastErr) throw lastErr
}

await main()
