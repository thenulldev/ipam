# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: onboarding.spec.ts >> scenario 10 — keyboard-only traversal: Tab from sidebar anchor into popover, Next via Enter, Skip via Tab+Enter
- Location: tests\onboarding.spec.ts:406:1

# Error details

```
TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('input[type="email"]') to be visible

```

# Test source

```ts
  33  |  *     where a scenario only applies to one form factor (e.g. mobile drawer).
  34  |  */
  35  | 
  36  | import { expect, test, type Page } from '@playwright/test'
  37  | 
  38  | const TOUR_KEYS = {
  39  |   complete: 'ipam:tour-complete:v1',
  40  |   step: 'ipam:tour-step:v1',
  41  |   shownOnLogin: 'ipam:tour-shown-on-login:v1',
  42  | } as const
  43  | 
  44  | const STEPS = [
  45  |   { selector: 'dashboard', title: 'Welcome to IPAM', route: '/', cta: 'Next' },
  46  |   { selector: 'dashboard', title: 'Your dashboard', route: '/', cta: 'Next' },
  47  |   { selector: 'ipam', title: 'IP addresses & prefixes', route: '/ipam', cta: 'Next' },
  48  |   { selector: 'racks', title: 'Racks & devices', route: '/racks', cta: 'Next' },
  49  |   { selector: 'patches', title: 'Patch cords', route: '/patches', cta: 'Next' },
  50  |   { selector: 'floorplan', title: 'Floorplans (Konva)', route: '/floorplan', cta: 'Next' },
  51  |   { selector: 'topology', title: 'Topology view', route: '/topology', cta: 'Next' },
  52  |   { selector: 'help', title: 'Templates & shortcuts', route: '/templates', cta: 'Got it' },
  53  | ] as const
  54  | 
  55  | const SEED_USERS = [
  56  |   { email: 'stephan@internal.example', label: 'Stephan Frank' },
  57  |   { email: 'priya@internal.example', label: 'Priya Mehta' },
  58  | ] as const
  59  | 
  60  | const DEV_PASSWORD = 'ipam-dev'
  61  | 
  62  | async function loginAs(page: Page, email: string) {
  63  |   // The route guard renders a skeleton splash while `/api/auth/me` is in
  64  |   // flight, so `goto('/login')` resolves before the form mounts. Wait for
  65  |   // the actual email input — that's the reliable readiness signal.
  66  |   await page.goto('/login')
  67  |   await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 15_000 })
  68  |   await page.locator('input[type="email"]').fill(email)
  69  |   await page.locator('input[type="password"]').fill(DEV_PASSWORD)
  70  |   await Promise.all([
  71  |     page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 }),
  72  |     page.locator('button[type="submit"]').click(),
  73  |   ])
  74  |   // Give the route guard + onboarding auto-launch time to settle.
  75  |   await page.waitForLoadState('networkidle')
  76  | 
  77  |   // Reset the server-side tour-completion flag for this user so the
  78  |   // OnboardingProvider's auto-launch path is deterministic. Without this,
  79  |   // a user who completed the tour on a previous run would be permanently
  80  |   // skipped (`serverDone && !localDone` branch in `onboarding-provider.tsx`).
  81  |   // The API lives at the explicit base URL (see `http-client.ts: resolveBaseUrl`),
  82  |   // not under the Vite origin — so we hit the apiBase directly here.
  83  |   // Pin to `localhost` — see playwright.config.ts for why 127.0.0.1 CORS-fails
  84  |   // in dev. The Hono origin must match the page origin for the cookie +
  85  |   // CORS round-trip to work in headless Chrome.
  86  |   const apiBase = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787'
  87  |   const userId = await page.evaluate(
  88  |     async ({ base }) => {
  89  |       const me = await fetch(`${base}/api/auth/me`, {
  90  |         credentials: 'include',
  91  |       }).then((r) => r.json())
  92  |       return me?.id as string | undefined
  93  |     },
  94  |     { base: apiBase },
  95  |   )
  96  |   if (userId) {
  97  |     await page.evaluate(
  98  |       async ({ base, id }) => {
  99  |         await fetch(`${base}/api/users/${encodeURIComponent(id)}`, {
  100 |           method: 'PATCH',
  101 |           credentials: 'include',
  102 |           headers: { 'Content-Type': 'application/json' },
  103 |           body: JSON.stringify({ onboardingCompletedAt: null }),
  104 |         })
  105 |       },
  106 |       { base: apiBase, id: userId },
  107 |     )
  108 |     // A subsequent full reload re-fetches /me and lets the OnboardingProvider
  109 |     // fire its auto-launch effect against the freshly-cleared flag.
  110 |     await page.reload()
  111 |     await page.waitForLoadState('networkidle')
  112 |   }
  113 | }
  114 | 
  115 | async function waitForPopoverOpen(page: Page, title: string, timeout = 10_000) {
  116 |   const popover = page.getByRole('dialog').or(page.locator(`[aria-label="${title}"]`))
  117 |   await expect(popover.first()).toBeVisible({ timeout })
  118 | }
  119 | 
  120 | async function readStorage(page: Page) {
  121 |   return page.evaluate((keys) => {
  122 |     const out: Record<string, string | null> = {}
  123 |     for (const k of keys) out[k] = localStorage.getItem(k)
  124 |     return out
  125 |   }, Object.values(TOUR_KEYS))
  126 | }
  127 | 
  128 | test.beforeEach(async ({ page }) => {
  129 |   // Belt-and-braces: clear before every scenario so we never inherit a
  130 |   // partial tour state from a previous run.
  131 |   await page.context().clearCookies()
  132 |   await page.goto('/login')
> 133 |   await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 15_000 })
      |                                             ^ TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
  134 |   await page.evaluate(() => {
  135 |     try { localStorage.clear() } catch {}
  136 |     try { sessionStorage.clear() } catch {}
  137 |   })
  138 | })
  139 | 
  140 | // ─────────────────────────────────────────────────────────────────────────
  141 | // 1. Fresh localStorage on `/` -> tour auto-launches
  142 | // ─────────────────────────────────────────────────────────────────────────
  143 | test('scenario 1 — fresh localStorage on `/` auto-launches the tour at step 1', async ({ page }) => {
  144 |   test.skip(test.info().project.name === 'mobile-iphone', 'Desktop-only scenario; mobile is covered in scenario 7.')
  145 | 
  146 |   await loginAs(page, SEED_USERS[0].email)
  147 | 
  148 |   await waitForPopoverOpen(page, STEPS[0].title)
  149 |   await expect(page.getByText('1 / 8').first()).toBeVisible()
  150 |   // The "Next" CTA on step 1 must be present and enabled.
  151 |   await expect(page.getByRole('button', { name: STEPS[0].cta })).toBeEnabled()
  152 |   // Anchor must resolve to the dashboard sidebar link.
  153 |   await expect(page.locator('[data-tour="dashboard"]')).toBeVisible()
  154 | })
  155 | 
  156 | // ─────────────────────────────────────────────────────────────────────────
  157 | // 2. Advance through all 8 steps with mouse
  158 | // ─────────────────────────────────────────────────────────────────────────
  159 | test('scenario 2 — advance through all 8 steps with mouse, final "Got it" closes the tour', async ({ page }) => {
  160 |   test.skip(test.info().project.name === 'mobile-iphone', 'Desktop-only scenario; mobile is covered in scenario 7.')
  161 | 
  162 |   await loginAs(page, SEED_USERS[0].email)
  163 |   await waitForPopoverOpen(page, STEPS[0].title)
  164 | 
  165 |   for (let i = 0; i < STEPS.length; i++) {
  166 |     const step = STEPS[i]
  167 |     await waitForPopoverOpen(page, step.title)
  168 |     // Anchor for this step must be present (sidebar or topbar match).
  169 |     await expect(page.locator(`[data-tour="${step.selector}"]`).first()).toBeVisible()
  170 |     await page.getByRole('button', { name: step.cta }).click()
  171 |     // Either the next popover appears, or - on the last step - it disappears.
  172 |     if (i < STEPS.length - 1) {
  173 |       await waitForPopoverOpen(page, STEPS[i + 1].title)
  174 |     }
  175 |   }
  176 | 
  177 |   // After the final click the popover should be gone.
  178 |   await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5_000 })
  179 | 
  180 |   const stored = await readStorage(page)
  181 |   expect(stored[TOUR_KEYS.complete]).toBe('1')
  182 |   expect(stored[TOUR_KEYS.step]).toBe(String(STEPS.length - 1))
  183 | 
  184 |   // Refresh — tour must NOT re-launch.
  185 |   await page.reload()
  186 |   await page.waitForLoadState('networkidle')
  187 |   await expect(page.getByRole('dialog')).toHaveCount(0)
  188 | })
  189 | 
  190 | // ─────────────────────────────────────────────────────────────────────────
  191 | // 3. Refresh mid-tour resumes at next step
  192 | // ─────────────────────────────────────────────────────────────────────────
  193 | test('scenario 3 — refresh mid-tour resumes at the next step', async ({ page }) => {
  194 |   test.skip(test.info().project.name === 'mobile-iphone', 'Desktop-only scenario.')
  195 | 
  196 |   await loginAs(page, SEED_USERS[0].email)
  197 |   await waitForPopoverOpen(page, STEPS[0].title)
  198 | 
  199 |   // Advance to step 4 (index 3 = "Racks & devices"). The state-machine
  200 |   // (see `use-tour.ts: next()`) persists the next-step index on every
  201 |   // advance, so after 4 clicks from step 0 the user is viewing step 4
  202 |   // (Racks & devices) and localStorage holds "3".
  203 |   for (let i = 0; i < 3; i++) {
  204 |     await waitForPopoverOpen(page, STEPS[i].title)
  205 |     await page.getByRole('button', { name: STEPS[i].cta }).click()
  206 |   }
  207 |   await waitForPopoverOpen(page, STEPS[3].title)
  208 |   // Sanity: storage now carries "3" (the index of the step we are viewing).
  209 |   const midTour = await readStorage(page)
  210 |   expect(midTour[TOUR_KEYS.step]).toBe('3')
  211 |   expect(midTour[TOUR_KEYS.complete]).toBeNull()
  212 | 
  213 |   // Refresh mid-tour.
  214 |   await page.reload()
  215 |   await page.waitForLoadState('networkidle')
  216 | 
  217 |   // Should resume at the SAME step (Racks & devices), not step 1, with the
  218 |   // persisted step index still in localStorage.
  219 |   await waitForPopoverOpen(page, STEPS[3].title)
  220 |   const stored = await readStorage(page)
  221 |   expect(stored[TOUR_KEYS.step]).toBe('3')
  222 |   expect(stored[TOUR_KEYS.complete]).toBeNull()
  223 | })
  224 | 
  225 | // ─────────────────────────────────────────────────────────────────────────
  226 | // 4. Click 'Skip tour' -> complete flag written, no re-launch
  227 | // ─────────────────────────────────────────────────────────────────────────
  228 | test('scenario 4 — Skip tour from step 3 ends the tour and persists the complete flag', async ({ page }) => {
  229 |   test.skip(test.info().project.name === 'mobile-iphone', 'Desktop-only scenario.')
  230 | 
  231 |   await loginAs(page, SEED_USERS[0].email)
  232 |   await waitForPopoverOpen(page, STEPS[0].title)
  233 | 
```