// Try /ipam which doesn't depend on tenant-scope-floorplans the same way
import { chromium } from 'playwright'

const browser = await chromium.launch({ args: ['--disable-web-security'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
page.on('pageerror', e => console.log('[pageerror]', e.message))

await ctx.request.post('http://localhost:8787/api/auth/login', { data: { email: 'stephan@internal.example', password: 'ipam-dev' } })
const me = await (await ctx.request.get('http://localhost:8787/api/auth/me')).json()
if (me?.id) await ctx.request.patch(`http://localhost:8787/api/users/${me.id}`, { data: { onboardingCompletedAt: null } })

await page.goto('http://localhost:5173/ipam', { waitUntil: 'load' })
await page.waitForTimeout(3000)
console.log('--- url:', page.url())
console.log('--- sidebar visible:', await page.locator('aside').count())
console.log('--- data-tour=ipam count:', await page.locator('[data-tour="ipam"]').count())
console.log('--- tour complete:', await page.evaluate(() => localStorage.getItem('ipam:tour-complete:v1')))
console.log('--- tour step:', await page.evaluate(() => localStorage.getItem('ipam:tour-step:v1')))

await page.screenshot({ path: 'test-results/probe-ipam.png', fullPage: false })
await browser.close()
