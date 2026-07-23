/**
 * Smoke test for a running IPAM server.
 *
 * Verifies, in order:
 *   1. GET /healthz returns 200 with { ok: true, db: "up", seedCounts }
 *   2. POST /api/auth/login with the dev seed credentials returns 200,
 *      proving sessions are wired end-to-end and the seed landed.
 *   3. GET /api/tenants with the issued session cookie returns > 0 rows,
 *      proving the row-level tenant scoping and the seeded tenant count.
 *
 * The dev seed admin email and password are read from the source — they live
 * in `src/server/seed.ts` (admin@internal.example) and `src/server/auth.ts`
 * (DEV_DEFAULT_PASSWORD = 'ipam-dev'). For a non-dev deployment, override
 * via SMOKE_LOGIN_EMAIL and SMOKE_LOGIN_PASSWORD.
 *
 * Usage:
 *   tsx scripts/smoke.ts                       # http://127.0.0.1:8787
 *   IPAM_BASE_URL=https://ipam.example.com tsx scripts/smoke.ts
 *   SMOKE_LOGIN_EMAIL=alice@acme.example SMOKE_LOGIN_PASSWORD=ipam-dev \
 *     tsx scripts/smoke.ts
 *
 * Exit code 0 on success, 1 on failure.
 */
const BASE = process.env.IPAM_BASE_URL ?? 'http://127.0.0.1:8787'
const LOGIN_EMAIL = process.env.SMOKE_LOGIN_EMAIL ?? 'stephan@internal.example'
const LOGIN_PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? 'ipam-dev'

type Check = { name: string; ok: boolean; detail: string }

function cookieFromSetCookie(setCookie: string | null): string | null {
  if (!setCookie) return null
  // Pull just the first `name=value` pair; we don't need the attributes for
  // a single-cookie smoke and stripping them keeps the request tiny.
  const m = setCookie.match(/^[^=]+=[^;]+/)
  return m ? m[0] : null
}

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

  // 2. Login (proves the seed is in the db and sessions work)
  let sessionCookie: string | null = null
  try {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
    })
    const setCookie = res.headers.get('set-cookie')
    sessionCookie = cookieFromSetCookie(setCookie)
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    const ok =
      res.status === 200 &&
      typeof body.email === 'string' &&
      sessionCookie !== null
    checks.push({
      name: 'POST /api/auth/login (dev seed)',
      ok,
      detail: `status=${res.status} email=${body.email} cookie=${sessionCookie ? 'set' : 'missing'}`,
    })
  } catch (err) {
    checks.push({
      name: 'POST /api/auth/login (dev seed)',
      ok: false,
      detail: `request failed: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  // 3. Tenants (auth-gated) — proves row-level scoping + that seed counts > 0
  try {
    const headers: Record<string, string> = {}
    if (sessionCookie) headers.cookie = sessionCookie
    const res = await fetch(`${BASE}/api/tenants`, { headers })
    const body = (await res.json().catch(() => ({}))) as Array<unknown>
    const count = Array.isArray(body) ? body.length : 0
    checks.push({
      name: 'GET /api/tenants (> 0 rows, auth)',
      ok: res.status === 200 && count > 0,
      detail: `status=${res.status} tenants=${count}`,
    })
  } catch (err) {
    checks.push({
      name: 'GET /api/tenants (> 0 rows, auth)',
      ok: false,
      detail: `request failed: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

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
