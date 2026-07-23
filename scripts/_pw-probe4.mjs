import { chromium } from 'playwright'

const browser = await chromium.launch({ args: ['--disable-web-security'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
page.on('console', m => { if (!m.text().includes('vite')) console.log('[browser]', m.type(), m.text().substring(0, 200)) })
page.on('pageerror', e => console.log('[pageerror]', e.message.substring(0, 200)))

await ctx.request.post('http://localhost:8787/api/auth/login', { data: { email: 'stephan@internal.example', password: 'ipam-dev' } })
const me = await (await ctx.request.get('http://localhost:8787/api/auth/me')).json()
if (me?.id) await ctx.request.patch(`http://localhost:8787/api/users/${me.id}`, { data: { onboardingCompletedAt: null } })

await page.goto('http://localhost:5173/', { waitUntil: 'load' })
await page.waitForTimeout(3000)

// Force-dismiss any vite error overlay
await page.evaluate(() => {
  const overlays = document.querySelectorAll('vite-error-overlay')
  overlays.forEach(o => o.remove())
  document.body.style.pointerEvents = ''
})

const popoverCount = await page.locator('[aria-label="Welcome to IPAM"]').count()
const anchorCount = await page.locator('[data-tour="dashboard"]').count()
console.log('--- Welcome popover count:', popoverCount)
console.log('--- dashboard anchor count:', anchorCount)
console.log('--- localStorage tour-complete:', await page.evaluate(() => localStorage.getItem('ipam:tour-complete:v1')))
console.log('--- localStorage tour-step:', await page.evaluate(() => localStorage.getItem('ipam:tour-step:v1')))
console.log('--- localStorage tour-shown-on-login:', await page.evaluate(() => localStorage.getItem('ipam:tour-shown-on-login:v1')))

await page.screenshot({ path: 'test-results/probe-after-api-login-cleaned.png', fullPage: true })
await browser.close()
