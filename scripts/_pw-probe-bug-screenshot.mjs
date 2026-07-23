import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true, args: ['--disable-web-security'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.screenshot({ path: 'test-results/nul61-bug-login-never-renders.png' })
console.log('Saved: test-results/nul61-bug-login-never-renders.png')

await browser.close()
