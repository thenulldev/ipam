import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dataDir = mkdtempSync(join(tmpdir(), 'ipam-debug-'))
const PORT = 18299
const proc = spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts'], {
  cwd: 'C:/Users/stephenf/Programming/IPAM',
  env: {
    ...process.env, PORT: String(PORT), IPAM_DATA_DIR: dataDir,
    IPAM_SESSION_SECRET: 'test-secret-do-not-use-in-prod-32chars-minimum',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let stderr = ''
proc.stderr?.on('data', c => stderr += c.toString())
proc.stdout?.on('data', c => stderr += c.toString())

for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/healthz`)
    if (r.status === 200) break
  } catch {}
  await new Promise(r => setTimeout(r, 200))
}

// Hammer the login endpoint like the test does
for (let i = 0; i < 15; i++) {
  const r = await fetch(`http://127.0.0.1:${PORT}/api/auth/login`, {
    method: 'POST', headers: {'content-type':'application/json'},
    body: JSON.stringify({email:'stephan@internal.example', password:'wrong'})
  })
  console.log(`attempt ${i+1}: ${r.status}`)
  if (r.status >= 500) {
    console.log('  body:', await r.text())
    break
  }
}

console.log('\n--- server stderr (last 3000) ---')
console.log(stderr.slice(-3000))

proc.kill()
setTimeout(() => rmSync(dataDir, {recursive: true, force: true}), 200)