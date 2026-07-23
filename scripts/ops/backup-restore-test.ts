/**
 * Verify backup and restore against an isolated, freshly seeded database.
 *
 * This is intentionally an end-to-end operator check rather than a unit test:
 * it starts the real server, takes a backup with scripts/backup.ts, restores
 * that backup into a different empty data directory, then boots the restored
 * database and checks its health and tenant seed count.
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs'
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
      IPAM_SESSION_SECRET: 'backup-restore-test-secret-32-characters',
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
    // so the source DB handle is released and `backup.ts` can open it.
    setTimeout(() => {
      if (server.process.exitCode === null) {
        try { server.process.kill('SIGKILL') } catch { /* already gone */ }
      }
    }, 500).unref()
  })
}

function runScript(script: string, args: string[], dataDir: string): string {
  const result = spawnSync(process.execPath, ['--import', 'tsx', script, ...args], {
    cwd: ROOT,
    env: { ...process.env, IPAM_DATA_DIR: dataDir, NODE_ENV: 'test' },
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(`${script} failed (${result.status})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
  }
  return result.stdout
}

async function main(): Promise<void> {
  const sourceDir = mkdtempSync(join(tmpdir(), 'ipam-backup-source-'))
  const restoredDir = mkdtempSync(join(tmpdir(), 'ipam-backup-restored-'))
  let sourceServer: Server | undefined
  let restoredServer: Server | undefined
  try {
    sourceServer = await startServer(await freePort(), sourceDir)
    const login = await fetch(`${sourceServer.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(LOGIN),
    })
    assert.equal(login.status, 200)
    const sourceCookie = login.headers.get('set-cookie')?.split(';')[0]
    assert.ok(sourceCookie)
    const sourceTenantsResponse = await fetch(`${sourceServer.baseUrl}/api/tenants`, {
      headers: { cookie: sourceCookie },
    })
    const sourceTenants = await sourceTenantsResponse.json() as unknown[]
    assert.equal(sourceTenantsResponse.status, 200)
    assert.ok(sourceTenants.length > 0)
    await stopServer(sourceServer)
    sourceServer = undefined

    const backupOutput = runScript('scripts/backup.ts', [], sourceDir)
    const backupFiles = readdirSync(join(sourceDir, 'backups')).filter((name) => name.endsWith('.db'))
    // Exactly one backup per `backup.ts` invocation: the .db file plus its
    // -wal/-shm sidecars end with .db-wal/.db-shm and are filtered out.
    assert.equal(backupFiles.length, 1, `unexpected backup files: ${JSON.stringify(backupFiles)}\nstdout:\n${backupOutput}`)
    const backupName = backupFiles[0]
    assert.ok(backupName)

    mkdirSync(join(restoredDir, 'backups'), { recursive: true })
    for (const suffix of ['', '-wal', '-shm']) {
      const source = join(sourceDir, 'backups', backupName + suffix)
      try {
        copyFileSync(source, join(restoredDir, 'backups', backupName + suffix))
      } catch (error) {
        if (suffix) continue
        throw error
      }
    }
    runScript('scripts/restore.ts', [backupName], restoredDir)

    restoredServer = await startServer(await freePort(), restoredDir)
    const restoredHealthResponse = await fetch(`${restoredServer.baseUrl}/healthz`)
    const restoredHealth = await restoredHealthResponse.json() as {
      ok?: boolean
      db?: string
      seedCounts?: { tenants?: number }
    }
    assert.equal(restoredHealthResponse.status, 200)
    assert.equal(restoredHealth.ok, true)
    assert.equal(restoredHealth.db, 'up')
    // `seedCounts.tenants` reports the total tenants row count (from
    // /healthz), while `/api/tenants` is tenant-scoped to the actor.
    // Compare the restored server's unfiltered count to the seed total
    // (>=1), not to a single actor's view.
    assert.ok(
      (restoredHealth.seedCounts?.tenants ?? 0) >= sourceTenants.length,
      `restored tenants ${restoredHealth.seedCounts?.tenants} < source actor tenants ${sourceTenants.length}`,
    )

    console.log(
      `BACKUP/RESTORE: OK (tenants seed=${restoredHealth.seedCounts?.tenants}, actor=${sourceTenants.length})`,
    )
  } finally {
    await stopServer(sourceServer)
    await stopServer(restoredServer)
    rmSync(sourceDir, { recursive: true, force: true })
    rmSync(restoredDir, { recursive: true, force: true })
  }
}

await main()
