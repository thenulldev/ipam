import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true, args: ['--disable-web-security'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
page.on('console', (m) => console.log(`[${m.type()}] ${m.text().slice(0, 400)}`))
page.on('pageerror', (e) => console.log(`[pageerror] ${e.stack ?? e}`))

await page.goto('http://localhost:5173/login', { waitUntil: 'load' })
// wait specifically for /api/auth/me to complete
await page.waitForResponse((r) => r.url().includes('/api/auth/me'))
await page.waitForTimeout(1500)
console.log('--- AFTER ---')
console.log('innerHTML len:', (await page.locator('body').innerHTML()).length)
console.log('input counts:')
console.log('  email:', await page.locator('input[type="email"]').count())
console.log('  password:', await page.locator('input[type="password"]').count())
console.log('  text:', await page.locator('input[type="text"]').count())
console.log('  any input:', await page.locator('input').count())
console.log('  any form:', await page.locator('form').count())
console.log('root html len:', (await page.locator('#root').innerHTML()).length)
console.log('root child tag:', await page.evaluate(() => document.querySelector('#root')?.firstElementChild?.tagName ?? null))
const html = await page.locator('#root').innerHTML()
console.log('root html (first 1500 chars):', html.slice(0, 1500))

await browser.close()
