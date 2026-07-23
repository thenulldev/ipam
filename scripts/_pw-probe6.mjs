// Intercept and trace what's undefined
import { chromium } from 'playwright'

const browser = await chromium.launch({ args: ['--disable-web-security'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()

// Patch Array.prototype.map to log args
await page.addInitScript(() => {
  const origMap = Array.prototype.map
  Array.prototype.map = function (...args) {
    try {
      if (this === undefined) console.log('map called on undefined')
    } catch {}
    return origMap.apply(this, args)
  }
})

await ctx.request.post('http://localhost:8787/api/auth/login', { data: { email: 'stephan@internal.example', password: 'ipam-dev' } })
const me = await (await ctx.request.get('http://localhost:8787/api/auth/me')).json()
if (me?.id) await ctx.request.patch(`http://localhost:8787/api/users/${me.id}`, { data: { onboardingCompletedAt: null } })

const errs = []
page.on('console', m => errs.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', e => errs.push(`[pageerror] ${e.message}\n${e.stack}`))

await page.goto('http://localhost:5173/', { waitUntil: 'load' })
await page.waitForTimeout(3000)
errs.forEach(e => console.log(e))
await browser.close()
