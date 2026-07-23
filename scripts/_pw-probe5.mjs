// Trace exact crash location by walking the call stack
import { chromium } from 'playwright'

const browser = await chromium.launch({ args: ['--disable-web-security'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
page.on('pageerror', e => console.log('[pageerror]', e.message, '\n', e.stack))

await ctx.request.post('http://localhost:8787/api/auth/login', { data: { email: 'stephan@internal.example', password: 'ipam-dev' } })

await page.goto('http://localhost:5173/', { waitUntil: 'load' })
await page.waitForTimeout(3000)
await browser.close()
