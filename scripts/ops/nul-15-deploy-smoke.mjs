/**
 * NUL-15 end-to-end deploy hardening verification.
 *
 * This is the operator's equivalent of `docker compose up` followed by
 * `npm run smoke`. We can't run Docker on this Windows host, but the
 * compose file wraps the same artefacts (compiled server, dist/, IPAM_DATA_DIR
 * mounted to /data), so a clean-room Node verification against an isolated
 * data directory is the strongest in-environment check we can produce.
 *
 * Steps:
 *   1. Build the server bundle (node scripts/build-server.mjs) if missing.
 *   2. Boot the compiled server against an empty temp data dir.
 *   3. GET /healthz must be 200 with { ok:true, db:"up", seedCounts }.
 *   4. POST /api/auth/login as the dev seed user must succeed.
 *   5. GET /api/tenants must return >= 1 row.
 *   6. GET / must serve the Vite index.html (proves dist/ sidecar works).
 *   7. npm run backup writes <data>/backups/<ts>.db.
 *   8. npm run restore into a fresh dir replays the tenants.
 *   9. GET /healthz on the restored DB returns the same seedCounts.
 *
 * Exit 0 on success, 1 on any failed assertion. Output is plain text so it
 * can be captured into a Paperclip comment.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, statSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const STAMP = Date.now()
const LOG = []
const log = (...args) => {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
  console.log(line)
  LOG.push(line)
}

const fail = (msg, extra) => {
  log(`FAIL: ${msg}`)
  if (extra) log(extra)
  log('--- LOG OUTPUT ---')
  for (const l of LOG) console.error(l)
  process.exit(1)
}

function assert(cond, msg) {
  if (!cond) fail(msg)
}

async function freePort() {
  const probe = net.createServer()
  await new Promise((res, rej) => {
    probe.once('error', rej)
    probe.listen(0, '127.0.0.1', () => res())
  })
  const port = probe.address().port
  await new Promise((res) => probe.close(() => res()))
  return port
}

function bootServer(port, dataDir) {
  const child = spawn(process.execPath, ['server-build/server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      IPAM_DATA_DIR: dataDir,
      IPAM_SESSION_SECRET: 'nul15-deploy-smoke-secret-32-chars-long',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  let stdout = ''
  child.stderr.on('data', (c) => { stderr += c.toString() })
  child.stdout.on('data', (c) => { stdout += c.toString() })
  return { process: child, baseUrl: `http://127.0.0.1:${port}`, getStderr: () => stderr, getStdout: () => stdout }
}

async function waitForReady(server, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${server.baseUrl}/healthz`)
      if (r.status === 200) return
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error(`server did not become ready within ${timeoutMs}ms\nstderr:\n${server.getStderr()}\nstdout:\n${server.getStdout()}`)
}

function killServer(s) {
  if (!s) return
  if (s.process.exitCode !== null) return
  s.process.kill()
  // belt-and-braces: kill -9 after grace
  setTimeout(() => {
    if (s.process.exitCode === null) {
      try { s.process.kill('SIGKILL') } catch { /* gone */ }
    }
  }, 1500).unref()
}

function runNpmScript(scriptName, dataDir) {
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', scriptName, '--silent'], {
    cwd: ROOT,
    env: { ...process.env, IPAM_DATA_DIR: dataDir },
    encoding: 'utf8',
    shell: true,
  })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

async function main() {
  log('=== NUL-15 deploy hardening smoke ===')
  log('Root:', ROOT)

  // ── Step 1: build the server bundle if missing/stale ──
  const serverEntry = join(ROOT, 'server-build', 'server', 'index.js')
  if (!existsSync(serverEntry)) {
    log('[1/9] server-build/ missing, building...')
    const b = runNpmScript('build:server', ROOT)
    if (b.status !== 0) fail('npm run build:server failed', b.stderr + '\n' + b.stdout)
    log('  build:server OK')
  } else {
    log('[1/9] server-build/server/index.js present, skipping rebuild')
  }

  // ── Step 2: boot the compiled server on a clean data dir ──
  const dataDir = mkdtempSync(join(tmpdir(), 'nul15-deploy-'))
  log('[2/9] data dir:', dataDir)
  const port = await freePort()
  let server = bootServer(port, dataDir)
  try {
    await waitForReady(server)
    log(`  server up on ${server.baseUrl}`)

    // ── Step 3: /healthz contract ──
    const healthRes = await fetch(`${server.baseUrl}/healthz`)
    const health = await healthRes.json()
    log('[3/9] /healthz ->', JSON.stringify(health))
    assert(healthRes.status === 200, `healthz status ${healthRes.status} (expected 200)`)
    assert(health.ok === true, 'healthz ok !== true')
    assert(health.db === 'up', `healthz db ${health.db} (expected "up")`)
    assert(health.seedCounts && typeof health.seedCounts === 'object', 'healthz missing seedCounts')
    assert((health.seedCounts.tenants ?? 0) > 0, `healthz seedCounts.tenants ${health.seedCounts.tenants} (expected > 0)`)

    // ── Step 4: login as the dev seed user ──
    const loginRes = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'stephan@internal.example', password: 'ipam-dev' }),
    })
    assert(loginRes.status === 200, `login status ${loginRes.status} (expected 200)`)
    const cookie = loginRes.headers.get('set-cookie')?.split(';')[0]
    assert(cookie, 'login did not return a Set-Cookie header')

    // ── Step 5: /api/tenants must be > 0 ──
    const tenantsRes = await fetch(`${server.baseUrl}/api/tenants`, { headers: { cookie } })
    const tenants = await tenantsRes.json()
    log('[5/9] /api/tenants count =', tenants.length)
    assert(tenantsRes.status === 200, `tenants status ${tenantsRes.status}`)
    assert(Array.isArray(tenants) && tenants.length > 0, `tenants length ${tenants.length} (expected > 0)`)

    // ── Step 6: GET / serves dist/ index.html (compose sidecar) ──
    const rootRes = await fetch(`${server.baseUrl}/`)
    const rootText = await rootRes.text()
    assert(rootRes.status === 200, `GET / status ${rootRes.status}`)
    assert(/<div id="root">/i.test(rootText) || /<title>.*ipam/i.test(rootText), 'GET / did not return the Vite index.html')
    log('[6/9] GET / served the Vite index.html')

    // ── Step 7: backup ──
    // Stop the server first so SQLite releases the file lock and the backup
    // is a consistent snapshot (WAL gets checkpointed).
    killServer(server); server = undefined
    await new Promise((r) => setTimeout(r, 300))

    const backup = runNpmScript('backup', dataDir)
    log('[7/9] npm run backup ->', backup.status, backup.stdout.trim())
    assert(backup.status === 0, `backup exit ${backup.status}: ${backup.stderr}`)
    const backupsDir = join(dataDir, 'backups')
    assert(existsSync(backupsDir), `backups dir missing at ${backupsDir}`)
    const backupFiles = readdirSync(backupsDir).filter((n) => n.endsWith('.db'))
    assert(backupFiles.length === 1, `expected 1 backup file, found ${backupFiles.length}: ${backupFiles.join(',')}`)
    const backupName = backupFiles[0]
    const backupSize = statSync(join(backupsDir, backupName)).size
    assert(backupSize > 0, `backup file ${backupName} is empty`)
    log(`  backup file: ${backupName} (${backupSize} bytes)`)

    // ── Step 8: restore into a different empty data dir ──
    const restoredDir = mkdtempSync(join(tmpdir(), 'nul15-restored-'))
    mkdirSync(join(restoredDir, 'backups'), { recursive: true })
    // Copy backup + sidecars into restoredDir/backups so restore.ts resolves it.
    for (const suffix of ['', '-wal', '-shm']) {
      const src = join(backupsDir, backupName + suffix)
      if (existsSync(src)) copyFileSync(src, join(restoredDir, 'backups', backupName + suffix))
    }
    // The restore script reads `process.argv[2]` for the backup name; invoke
    // it directly with tsx so we can pass the arg without going through npm.
    const restore = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsx', 'scripts/restore.ts', backupName], {
      cwd: ROOT, env: { ...process.env, IPAM_DATA_DIR: restoredDir, NODE_ENV: 'production' }, encoding: 'utf8', shell: true,
    })
    log('[8/9] tsx scripts/restore.ts ->', restore.status, restore.stdout.trim())
    assert(restore.status === 0, `restore exit ${restore.status}: ${restore.stderr || restore.stdout}`)
    assert(existsSync(join(restoredDir, 'ipam.db')), 'restored ipam.db missing')

    // ── Step 9: boot the restored DB, confirm healthz + tenants survive ──
    // seedCounts on /healthz is the global tenants row count (the seed
    // total). /api/tenants is tenant-scoped to the actor. Compare the
    // restored DB against the same global metric on the original boot,
    // not the actor-scoped view, otherwise a tenant-scoped actor will
    // see < seedCounts.tenants and the assertion fails even though the
    // restored DB is identical.
    const originalHealth = { ok: health.ok, db: health.db, tenants: health.seedCounts?.tenants ?? 0 }
    const port2 = await freePort()
    const restoredServer = bootServer(port2, restoredDir)
    try {
      await waitForReady(restoredServer)
      const h2 = await fetch(`${restoredServer.baseUrl}/healthz`).then((r) => r.json())
      log('[9/9] restored /healthz ->', JSON.stringify(h2))
      assert(h2.ok === true && h2.db === 'up', `restored healthz: ok=${h2.ok} db=${h2.db}`)
      assert(
        h2.seedCounts?.tenants === originalHealth.tenants,
        `restored tenants ${h2.seedCounts?.tenants} !== original ${originalHealth.tenants}`,
      )

      // login on the restored DB and confirm the actor still sees the
      // same scoped tenant list (sanity, not a structural invariant).
      const login2 = await fetch(`${restoredServer.baseUrl}/api/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'stephan@internal.example', password: 'ipam-dev' }),
      })
      assert(login2.status === 200, `restored login status ${login2.status}`)
      const cookie2 = login2.headers.get('set-cookie')?.split(';')[0]
      const tenants2 = await fetch(`${restoredServer.baseUrl}/api/tenants`, { headers: { cookie: cookie2 } }).then((r) => r.json())
      assert(tenants2.length === tenants.length, `restored actor tenants ${tenants2.length} !== ${tenants.length}`)
      log(`  restored DB: seed tenants=${h2.seedCounts.tenants} (matches original), actor tenants=${tenants2.length}`)
    } finally {
      killServer(restoredServer)
    }
  } finally {
    killServer(server)
  }

  // ── Summary ──
  log('')
  log('=== NUL-15 SMOKE: OK ===')
  log('All acceptance gates green:')
  log('  - GET /healthz returns { ok:true, db:"up", seedCounts }')
  log('  - GET /api/tenants returns > 0 rows (after login)')
  log('  - GET / serves dist/index.html (compose sidecar contract)')
  log('  - npm run backup writes <data>/backups/<ts>.db')
  log('  - npm run restore replays tenants into a fresh data dir')
  log('  - Restored DB boots green and matches the original seed count')

  // Dump the log to a file so we can attach it to the Paperclip comment.
  writeFileSync(join(ROOT, 'data', `nul-15-smoke-${STAMP}.log`), LOG.join('\n') + '\n')
  log(`Log file: data/nul-15-smoke-${STAMP}.log`)
}

main().catch((err) => {
  console.error('UNCAUGHT:', err)
  process.exit(1)
})