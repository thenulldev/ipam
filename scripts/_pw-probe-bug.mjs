import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true, args: ['--disable-web-security'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
page.on('console', (m) => { if (m.type() === 'error') console.log(`[err] ${m.text()}`) })
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`))

// Case 1: anonymous -> /login -> expect form
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
const formInputs = await page.locator('input').count()
console.log('Case 1 (anon /login) inputs:', formInputs, 'FORM?', await page.locator('form').count())
// HTML: skeleton or form?
const rootHtml = await page.locator('#root').innerHTML()
console.log('Case 1 root has skeleton:', rootHtml.includes('animate-pulse'))
console.log('Case 1 root has form:', rootHtml.includes('<form'))

// Case 2: anonymous -> / -> expect redirect to /login
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
console.log('Case 2 (anon /) final url:', page.url())
const inp2 = await page.locator('input').count()
console.log('Case 2 inputs:', inp2)

await browser.close()
