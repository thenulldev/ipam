// Try logging in via the API first (sets the cookie) then visiting /login
// to see if the guard correctly redirects to / and we can then test the tour.
import { chromium } from 'playwright'

const browser = await chromium.launch({ args: ['--disable-web-security'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
page.on('console', m => console.log('[browser]', m.type(), m.text()))

// Try direct API login first to set cookie
const loginResp = await ctx.request.post('http://localhost:8787/api/auth/login', {
  data: { email: 'stephan@internal.example', password: 'ipam-dev' },
})
console.log('login status:', loginResp.status())
console.log('login body:', await loginResp.text())

// Now visit the dashboard
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
const html = await page.content()
console.log('--- DASHBOARD HTML SNIPPET ---')
console.log(html.substring(0, 1500))
console.log('--- HAS DASHBOARD CONTENT? ---')
console.log('has "Welcome to IPAM":', html.includes('Welcome to IPAM'))
console.log('has dashboard data-tour:', html.includes('data-tour="dashboard"'))

// Test if tour auto-launched
const popover = await page.locator('[aria-label="Welcome to IPAM"]').count()
console.log('Welcome popover count:', popover)

await browser.close()
