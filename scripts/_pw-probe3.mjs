// Reproduce: API login → visit / → wait long enough for tour
import { chromium } from 'playwright'

const browser = await chromium.launch({ args: ['--disable-web-security'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
page.on('console', m => { if (!m.text().includes('vite')) console.log('[browser]', m.type(), m.text().substring(0, 200)) })
page.on('pageerror', e => console.log('[pageerror]', e.message.substring(0, 200)))

// Direct API login (sets cookie)
const loginResp = await ctx.request.post('http://localhost:8787/api/auth/login', {
  data: { email: 'stephan@internal.example', password: 'ipam-dev' },
})
console.log('login status:', loginResp.status())

// Reset server-side tour flag (per spec)
const me = await (await ctx.request.get('http://localhost:8787/api/auth/me')).json()
console.log('me:', me)
if (me?.id) {
  const r = await ctx.request.patch(`http://localhost:8787/api/users/${me.id}`, {
    data: { onboardingCompletedAt: null },
  })
  console.log('reset status:', r.status())
}

// Visit dashboard and wait for tour popover
await page.goto('http://localhost:5173/', { waitUntil: 'load' })
await page.waitForTimeout(4000)
console.log('--- has popover "Welcome to IPAM":', await page.locator('[aria-label="Welcome to IPAM"]').count())
console.log('--- has dashboard data-tour:', await page.locator('[data-tour="dashboard"]').count())
console.log('--- url:', page.url())
console.log('--- localStorage ipam:tour-complete:v1:', await page.evaluate(() => localStorage.getItem('ipam:tour-complete:v1')))
console.log('--- localStorage ipam:tour-step:v1:', await page.evaluate(() => localStorage.getItem('ipam:tour-step:v1')))

// Take screenshot
await page.screenshot({ path: 'test-results/probe-after-api-login.png', fullPage: true })
console.log('--- screenshot saved')

await browser.close()
