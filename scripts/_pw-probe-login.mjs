import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true, args: ['--disable-web-security'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
page.on('console', (m) => console.log(`[${m.type()}] ${m.text().slice(0, 300)}`))
page.on('pageerror', (e) => console.log(`[pageerror] ${e}`))
page.on('requestfailed', (r) => console.log(`[req-fail] ${r.method()} ${r.url()} - ${r.failure()?.errorText}`))
page.on('response', (r) => {
  const u = r.url()
  if (u.includes('/api/')) console.log(`[api ${r.status()}] ${u}`)
})

await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
console.log('--- AFTER LOAD ---')
console.log('url:', page.url())
console.log('title:', await page.title())
console.log('email inputs:', await page.locator('input[type="email"]').count())
console.log('body sample:', (await page.locator('body').innerText()).slice(0, 600))
await browser.close()
