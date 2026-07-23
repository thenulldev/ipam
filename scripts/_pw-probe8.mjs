// Try /racks which doesn't use tenant-scope-heavy dashboard layout
import { chromium } from 'playwright'

const browser = await chromium.launch({ args: ['--disable-web-security'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
page.on('pageerror', e => console.log('[pageerror]', e.message))

await ctx.request.post('http://localhost:8787/api/auth/login', { data: { email: 'stephan@internal.example', password: 'ipam-dev' } })
const me = await (await ctx.request.get('http://localhost:8787/api/auth/me')).json()
if (me?.id) await ctx.request.patch(`http://localhost:8787/api/users/${me.id}`, { data: { onboardingCompletedAt: null } })

for (const route of ['/racks', '/templates', '/settings']) {
  page.removeAllListeners('pageerror')
  page.on('pageerror', e => console.log(`[${route}] pageerror:`, e.message))
  await page.goto(`http://localhost:5173${route}`, { waitUntil: 'load' }).catch(e => console.log(`[${route}] nav err:`, e.message))
  await page.waitForTimeout(2000)
  console.log(`[${route}] url=${page.url()} sidebar=${await page.locator('aside').count()} data-tour-dashboard=${await page.locator('[data-tour="dashboard"]').count()}`)
}

await browser.close()
