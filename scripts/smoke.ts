/**
 * Smoke test for a running IPAM server.
 *
 * Verifies:
 *   - GET /healthz returns 200 with { ok: true, db: "up", seedCounts }
 *   - GET /api/tenants returns > 0 rows
 *
 * Usage:
 *   tsx scripts/smoke.ts                       # http://127.0.0.1:8787
 *   IPAM_BASE_URL=https://ipam.example.com tsx scripts/smoke.ts
 *
 * Exit code 0 on success, 1 on failure.
 */
const BASE = process.env.IPAM_BASE_URL ?? 'http://127.0.0.1:8787'

type Check = { name: string; ok: boolean; detail: string }

async function main(): Promise<number> {
  const checks: Check[] = []

  // 1. Healthz
  try {
    const res = await fetch(`${BASE}/healthz`)
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    const ok = res.status === 200 && body.ok === true && body.db === 'up'
    checks.push({
      name: 'GET /healthz',
      ok,
      detail: `status=${res.status} ok=${body.ok} db=${body.db} seedCounts=${JSON.stringify(body.seedCounts)}`,
    })
  } catch (err) {
    checks.push({
      name: 'GET /healthz',
      ok: false,
      detail: `request failed: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  // 2. Tenants count > 0
  try {
    const res = await fetch(`${BASE}/api/tenants`)
    const body = (await res.json().catch(() => ({}))) as Array<unknown>
    const count = Array.isArray(body) ? body.length : 0
    checks.push({
      name: 'GET /api/tenants (> 0 rows)',
      ok: res.status === 200 && count > 0,
      detail: `status=${res.status} tenants=${count}`,
    })
  } catch (err) {
    checks.push({
      name: 'GET /api/tenants (> 0 rows)',
      ok: false,
      detail: `request failed: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  // Print results
  let allOk = true
  for (const c of checks) {
    const tag = c.ok ? 'OK ' : 'FAIL'
    console.log(`[${tag}] ${c.name} -- ${c.detail}`)
    if (!c.ok) allOk = false
  }
  console.log(allOk ? '\nSMOKE: OK' : '\nSMOKE: FAILED')
  return allOk ? 0 : 1
}

process.exit(await main())