import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dataDir = mkdtempSync(join(tmpdir(), 'ipam-debug-'))

async function start(port) {
  const proc = spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts'], {
    cwd: 'C:/Users/stephenf/Programming/IPAM',
    env: {
      ...process.env, PORT: String(port), IPAM_DATA_DIR: dataDir,
      IPAM_SESSION_SECRET: 'test-secret-do-not-use-in-prod-32chars-minimum',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  proc.stderr?.on('data', c => stderr += c.toString())
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/healthz`); if (r.status === 200) break } catch {}
    await new Promise(r => setTimeout(r, 200))
  }
  return { proc, stderr }
}

const a = await start(18299)
console.log('server A up')
const r1 = await fetch('http://127.0.0.1:18299/api/sites', {
  method: 'POST', headers: {'content-type':'application/json'},
  body: JSON.stringify({name:'naughty'})
})
console.log('unauth POST A:', r1.status, await r1.text())

const b = await start(18300)
console.log('server B up')
const r2 = await fetch('http://127.0.0.1:18300/api/sites', {
  method: 'POST', headers: {'content-type':'application/json'},
  body: JSON.stringify({name:'naughty'})
})
console.log('unauth POST B:', r2.status, await r2.text())

console.log('\n--- A stderr ---')
console.log(a.stderr.slice(-2000))
console.log('\n--- B stderr ---')
console.log(b.stderr.slice(-2000))

a.proc.kill(); b.proc.kill()
setTimeout(() => rmSync(dataDir, {recursive: true, force: true}), 200)