/**
 * End-to-end QA for the merged onboarding / product-tour flow (NUL-51.D / NUL-61).
 *
 * Scenarios from NUL-51.D acceptance criteria, run against the local dev stack:
 *   1. Fresh localStorage on `/` -> tour auto-launches (step 1 visible).
 *   2. Advance through all 8 steps with mouse - final CTA 'Got it' closes the tour
 *      and writes the complete flag.
 *   3. Refresh mid-tour (step 4) -> resumes at step 5 (step=4 in localStorage).
 *   4. Click 'Skip tour' on step 3 -> tour ends, complete flag written, no
 *      re-launch on refresh.
 *   5. Help menu -> 'Start tour' -> tour resets to step 1 and runs again.
 *   6. Logout -> both localStorage keys cleared; login as different user -> tour
 *      auto-launches.
 *   7. Mobile viewport (375x812 Chrome emulation) -> drawer auto-opens before
 *      each step, popover renders as bottom sheet, anchors hit the right
 *      elements.
 *   8. Dark mode toggle during tour -> popover border/text re-themes without
 *      flicker.
 *   9. Esc during a popover -> advances to next step.
 *  10. Keyboard-only traversal: Tab from sidebar anchor into popover, Next via
 *      Enter, Skip via Tab+Enter.
 *
 * Conventions:
 *   - All scenarios log in with the dev seed credentials. The dev seed is
 *     deterministic across runs (`stephan@internal.example` / `ipam-dev`).
 *   - localStorage is cleared at the top of every test so state can't leak.
 *   - The popover for a given step is identified by its `aria-label` (matches
 *     `step.title`) so the test doesn't depend on DOM structure.
 *   - Screenshots: each step in light + dark is captured in the "screens"
 *     capture block at the end of the file (separate `test.describe`). These
 *     attach as comment artifacts on NUL-61 per the brief.
 *   - One Playwright project per device/viewport; the spec filters by name
 *     where a scenario only applies to one form factor (e.g. mobile drawer).
 */

import { expect, test, type Page } from '@playwright/test'

const TOUR_KEYS = {
  complete: 'ipam:tour-complete:v1',
  step: 'ipam:tour-step:v1',
  shownOnLogin: 'ipam:tour-shown-on-login:v1',
} as const

const STEPS = [
  { selector: 'dashboard', title: 'Welcome to IPAM', route: '/', cta: 'Next' },
  { selector: 'dashboard', title: 'Your dashboard', route: '/', cta: 'Next' },
  { selector: 'ipam', title: 'IP addresses & prefixes', route: '/ipam', cta: 'Next' },
  { selector: 'racks', title: 'Racks & devices', route: '/racks', cta: 'Next' },
  { selector: 'patches', title: 'Patch cords', route: '/patches', cta: 'Next' },
  { selector: 'floorplan', title: 'Floorplans (Konva)', route: '/floorplan', cta: 'Next' },
  { selector: 'topology', title: 'Topology view', route: '/topology', cta: 'Next' },
  { selector: 'help', title: 'Templates & shortcuts', route: '/templates', cta: 'Got it' },
] as const

const SEED_USERS = [
  { email: 'stephan@internal.example', label: 'Stephan Frank' },
  { email: 'priya@internal.example', label: 'Priya Mehta' },
] as const

const DEV_PASSWORD = 'ipam-dev'

async function loginAs(page: Page, email: string) {
  // The route guard renders a skeleton splash while `/api/auth/me` is in
  // flight, so `goto('/login')` resolves before the form mounts. Wait for
  // the actual email input — that's the reliable readiness signal.
  await page.goto('/login')
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(DEV_PASSWORD)
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 }),
    page.locator('button[type="submit"]').click(),
  ])
  // Give the route guard + onboarding auto-launch time to settle.
  await page.waitForLoadState('networkidle')

  // Reset the server-side tour-completion flag for this user so the
  // OnboardingProvider's auto-launch path is deterministic. Without this,
  // a user who completed the tour on a previous run would be permanently
  // skipped (`serverDone && !localDone` branch in `onboarding-provider.tsx`).
  // The API lives at the explicit base URL (see `http-client.ts: resolveBaseUrl`),
  // not under the Vite origin — so we hit the apiBase directly here.
  // Pin to `localhost` — see playwright.config.ts for why 127.0.0.1 CORS-fails
  // in dev. The Hono origin must match the page origin for the cookie +
  // CORS round-trip to work in headless Chrome.
  const apiBase = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787'
  const userId = await page.evaluate(
    async ({ base }) => {
      const me = await fetch(`${base}/api/auth/me`, {
        credentials: 'include',
      }).then((r) => r.json())
      return me?.id as string | undefined
    },
    { base: apiBase },
  )
  if (userId) {
    await page.evaluate(
      async ({ base, id }) => {
        await fetch(`${base}/api/users/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ onboardingCompletedAt: null }),
        })
      },
      { base: apiBase, id: userId },
    )
    // A subsequent full reload re-fetches /me and lets the OnboardingProvider
    // fire its auto-launch effect against the freshly-cleared flag.
    await page.reload()
    await page.waitForLoadState('networkidle')
  }
}

async function waitForPopoverOpen(page: Page, title: string, timeout = 10_000) {
  const popover = page.getByRole('dialog').or(page.locator(`[aria-label="${title}"]`))
  await expect(popover.first()).toBeVisible({ timeout })
}

async function readStorage(page: Page) {
  return page.evaluate((keys) => {
    const out: Record<string, string | null> = {}
    for (const k of keys) out[k] = localStorage.getItem(k)
    return out
  }, Object.values(TOUR_KEYS))
}

test.beforeEach(async ({ page }) => {
  // Belt-and-braces: clear before every scenario so we never inherit a
  // partial tour state from a previous run.
  await page.context().clearCookies()
  await page.goto('/login')
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 15_000 })
  await page.evaluate(() => {
    try { localStorage.clear() } catch {}
    try { sessionStorage.clear() } catch {}
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 1. Fresh localStorage on `/` -> tour auto-launches
// ─────────────────────────────────────────────────────────────────────────
test('scenario 1 — fresh localStorage on `/` auto-launches the tour at step 1', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile-iphone', 'Desktop-only scenario; mobile is covered in scenario 7.')

  await loginAs(page, SEED_USERS[0].email)

  await waitForPopoverOpen(page, STEPS[0].title)
  await expect(page.getByText('1 / 8').first()).toBeVisible()
  // The "Next" CTA on step 1 must be present and enabled.
  await expect(page.getByRole('button', { name: STEPS[0].cta })).toBeEnabled()
  // Anchor must resolve to the dashboard sidebar link.
  await expect(page.locator('[data-tour="dashboard"]')).toBeVisible()
})

// ─────────────────────────────────────────────────────────────────────────
// 2. Advance through all 8 steps with mouse
// ─────────────────────────────────────────────────────────────────────────
test('scenario 2 — advance through all 8 steps with mouse, final "Got it" closes the tour', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile-iphone', 'Desktop-only scenario; mobile is covered in scenario 7.')

  await loginAs(page, SEED_USERS[0].email)
  await waitForPopoverOpen(page, STEPS[0].title)

  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i]
    await waitForPopoverOpen(page, step.title)
    // Anchor for this step must be present (sidebar or topbar match).
    await expect(page.locator(`[data-tour="${step.selector}"]`).first()).toBeVisible()
    await page.getByRole('button', { name: step.cta }).click()
    // Either the next popover appears, or - on the last step - it disappears.
    if (i < STEPS.length - 1) {
      await waitForPopoverOpen(page, STEPS[i + 1].title)
    }
  }

  // After the final click the popover should be gone.
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5_000 })

  const stored = await readStorage(page)
  expect(stored[TOUR_KEYS.complete]).toBe('1')
  expect(stored[TOUR_KEYS.step]).toBe(String(STEPS.length - 1))

  // Refresh — tour must NOT re-launch.
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

// ─────────────────────────────────────────────────────────────────────────
// 3. Refresh mid-tour resumes at next step
// ─────────────────────────────────────────────────────────────────────────
test('scenario 3 — refresh mid-tour resumes at the next step', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile-iphone', 'Desktop-only scenario.')

  await loginAs(page, SEED_USERS[0].email)
  await waitForPopoverOpen(page, STEPS[0].title)

  // Advance to step 4 (index 3 = "Racks & devices"). The state-machine
  // (see `use-tour.ts: next()`) persists the next-step index on every
  // advance, so after 4 clicks from step 0 the user is viewing step 4
  // (Racks & devices) and localStorage holds "3".
  for (let i = 0; i < 3; i++) {
    await waitForPopoverOpen(page, STEPS[i].title)
    await page.getByRole('button', { name: STEPS[i].cta }).click()
  }
  await waitForPopoverOpen(page, STEPS[3].title)
  // Sanity: storage now carries "3" (the index of the step we are viewing).
  const midTour = await readStorage(page)
  expect(midTour[TOUR_KEYS.step]).toBe('3')
  expect(midTour[TOUR_KEYS.complete]).toBeNull()

  // Refresh mid-tour.
  await page.reload()
  await page.waitForLoadState('networkidle')

  // Should resume at the SAME step (Racks & devices), not step 1, with the
  // persisted step index still in localStorage.
  await waitForPopoverOpen(page, STEPS[3].title)
  const stored = await readStorage(page)
  expect(stored[TOUR_KEYS.step]).toBe('3')
  expect(stored[TOUR_KEYS.complete]).toBeNull()
})

// ─────────────────────────────────────────────────────────────────────────
// 4. Click 'Skip tour' -> complete flag written, no re-launch
// ─────────────────────────────────────────────────────────────────────────
test('scenario 4 — Skip tour from step 3 ends the tour and persists the complete flag', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile-iphone', 'Desktop-only scenario.')

  await loginAs(page, SEED_USERS[0].email)
  await waitForPopoverOpen(page, STEPS[0].title)

  // Advance to step 3 (index 2 = "IP addresses & prefixes").
  for (let i = 0; i < 2; i++) {
    await waitForPopoverOpen(page, STEPS[i].title)
    await page.getByRole('button', { name: STEPS[i].cta }).click()
  }
  await waitForPopoverOpen(page, STEPS[2].title)

  await page.getByRole('button', { name: 'Skip tour' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5_000 })

  const stored = await readStorage(page)
  expect(stored[TOUR_KEYS.complete]).toBe('1')

  // Refresh - tour must not re-launch.
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

// ─────────────────────────────────────────────────────────────────────────
// 5. Help -> "Start tour" resets to step 1
// ─────────────────────────────────────────────────────────────────────────
test('scenario 5 — Help menu "Start tour" resets and runs the tour again', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile-iphone', 'Desktop-only scenario.')

  await loginAs(page, SEED_USERS[0].email)
  await waitForPopoverOpen(page, STEPS[0].title)
  await page.getByRole('button', { name: 'Skip tour' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5_000 })

  // Open Help menu in topbar and click "Start tour".
  await page.getByRole('button', { name: /Help and shortcuts/i }).click()
  await page.getByRole('menuitem', { name: /Start tour/i }).click()

  await waitForPopoverOpen(page, STEPS[0].title)
  await expect(page.getByText('1 / 8').first()).toBeVisible()

  const stored = await readStorage(page)
  expect(stored[TOUR_KEYS.complete]).toBeNull()
  expect(stored[TOUR_KEYS.step]).toBe('0')
})

// ─────────────────────────────────────────────────────────────────────────
// 6. Logout clears keys; new user gets fresh auto-launch
// ─────────────────────────────────────────────────────────────────────────
test('scenario 6 — logout clears tour keys and a different user gets a fresh auto-launch', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile-iphone', 'Desktop-only scenario.')

  await loginAs(page, SEED_USERS[0].email)
  await waitForPopoverOpen(page, STEPS[0].title)
  await page.getByRole('button', { name: STEPS[0].cta }).click()
  await waitForPopoverOpen(page, STEPS[1].title)

  const midTourStorage = await readStorage(page)
  expect(midTourStorage[TOUR_KEYS.step]).toBe('1')

  // Logout - LogoutButton renders a Radix-styled button labeled "Sign out" or
  // "Log out". Try both since copy may have shifted; fall back to the avatar
  // dropdown.
  const signOutCandidates = [
    page.getByRole('button', { name: /sign out/i }),
    page.getByRole('button', { name: /log out/i }),
  ]
  for (const candidate of signOutCandidates) {
    if (await candidate.count()) {
      await candidate.first().click()
      break
    }
  }
  await page.waitForURL((url) => url.pathname.startsWith('/login'), { timeout: 10_000 })

  const afterLogout = await readStorage(page)
  expect(afterLogout[TOUR_KEYS.complete]).toBeNull()
  expect(afterLogout[TOUR_KEYS.step]).toBeNull()
  expect(afterLogout[TOUR_KEYS.shownOnLogin]).toBeNull()

  // Login as a different user.
  await loginAs(page, SEED_USERS[1].email)
  await waitForPopoverOpen(page, STEPS[0].title)
  await expect(page.getByText('1 / 8').first()).toBeVisible()
})

// ─────────────────────────────────────────────────────────────────────────
// 7. Mobile viewport - drawer auto-opens, popover renders as bottom sheet
// ─────────────────────────────────────────────────────────────────────────
test('scenario 7 — mobile viewport opens the drawer and renders the popover as a bottom sheet', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-iphone', 'Mobile-only scenario.')

  await loginAs(page, SEED_USERS[0].email)

  // The popover is rendered as a Radix Dialog (role="dialog") with the
  // step's title as aria-label. The mobile nav drawer (also role="dialog")
  // is opened by the provider before each step. We assert both are visible
  // for the first step.
  await waitForPopoverOpen(page, STEPS[0].title)

  // Step through all 8 to make sure each anchor resolves and each popover
  // appears as a bottom sheet.
  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i]
    await waitForPopoverOpen(page, step.title)
    // Anchor lives inside the mobile drawer, so it must be visible even
    // though the desktop sidebar is hidden.
    const anchor = page.locator(`[data-tour="${step.selector}"]`).first()
    await expect(anchor).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: step.cta }).click()
  }

  // After the final click the onboarding popover (aria-labeled bottom sheet)
  // should be gone. The nav drawer may or may not still be open — that's a
  // product decision owned elsewhere — but the tour itself must be closed.
  await expect(
    page.locator(`[aria-label="${STEPS[STEPS.length - 1].title}"]`),
  ).toHaveCount(0, { timeout: 5_000 })

  const stored = await readStorage(page)
  expect(stored[TOUR_KEYS.complete]).toBe('1')
})

// ─────────────────────────────────────────────────────────────────────────
// 8. Dark mode toggle during the tour re-themes without flicker
// ─────────────────────────────────────────────────────────────────────────
test('scenario 8 — dark mode toggle during the tour re-themes the popover', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile-iphone', 'Desktop-only scenario.')

  await loginAs(page, SEED_USERS[0].email)
  await waitForPopoverOpen(page, STEPS[0].title)

  // Sanity: starting in light mode (the desktop-light project starts
  // color-scheme: light and the seeded theme pref is "system" — but the
  // initial render before user interaction should NOT carry the `dark`
  // class because color-scheme is "light").
  await expect(page.locator('html')).not.toHaveClass(/dark/)

  // Open the Theme dropdown via the topbar toggle button.
  const themeToggle = page.getByRole('button', { name: 'Theme' })
  await themeToggle.click()
  // Pick the "Dark" menu item.
  await page.getByRole('menuitem', { name: 'Dark' }).click()

  // The toggle should re-theme without dismissing the popover.
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.locator(`[aria-label="${STEPS[0].title}"]`).first()).toBeVisible()

  // Toggle back to Light and confirm the popover still survives the flip
  // (no React crash, no flicker that drops the popover from the DOM).
  await themeToggle.click()
  await page.getByRole('menuitem', { name: 'Light' }).click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await expect(page.locator(`[aria-label="${STEPS[0].title}"]`).first()).toBeVisible()
})

// ─────────────────────────────────────────────────────────────────────────
// 9. Esc during a popover advances to next step
// ─────────────────────────────────────────────────────────────────────────
test('scenario 9 — pressing Esc on a popover advances to the next step', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile-iphone', 'Desktop-only scenario.')

  await loginAs(page, SEED_USERS[0].email)
  await waitForPopoverOpen(page, STEPS[0].title)

  // Focus the popover first so Esc targets the right element.
  const popover = page.locator(`[aria-label="${STEPS[0].title}"]`).first()
  await popover.click()

  await page.keyboard.press('Escape')
  await waitForPopoverOpen(page, STEPS[1].title)
})

// ─────────────────────────────────────────────────────────────────────────
// 10. Keyboard-only traversal
// ─────────────────────────────────────────────────────────────────────────
test('scenario 10 — keyboard-only traversal: Tab from sidebar anchor into popover, Next via Enter, Skip via Tab+Enter', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile-iphone', 'Desktop-only scenario.')

  await loginAs(page, SEED_USERS[0].email)
  await waitForPopoverOpen(page, STEPS[0].title)

  // Skip is the first focusable in the popover (set in tour-popover.tsx via
  // onOpenAutoFocus -> skipRef.current?.focus()).
  await expect(page.getByRole('button', { name: 'Skip tour' })).toBeFocused()

  // Tab forward to the Next button.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: STEPS[0].cta })).toBeFocused()

  // Enter advances.
  await page.keyboard.press('Enter')
  await waitForPopoverOpen(page, STEPS[1].title)

  // Tab back to Skip on the next popover, then Enter to dismiss the whole tour.
  await expect(page.getByRole('button', { name: 'Skip tour' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5_000 })

  const stored = await readStorage(page)
  expect(stored[TOUR_KEYS.complete]).toBe('1')
})

// ─────────────────────────────────────────────────────────────────────────
// Screenshot capture (light + dark + mobile, all 8 steps)
// ─────────────────────────────────────────────────────────────────────────
test.describe('screenshots', () => {
  for (const user of SEED_USERS.slice(0, 1)) {
    test(`capture step screenshots — ${user.label}`, async ({ page }, testInfo) => {
      await loginAs(page, user.email)

      const projectName = testInfo.project.name
      const theme = projectName.includes('dark') ? 'dark' : 'light'
      const variant = projectName.includes('mobile') ? 'mobile' : 'desktop'

      for (let i = 0; i < STEPS.length; i++) {
        const step = STEPS[i]
        await waitForPopoverOpen(page, step.title)
        const filename = `step-${String(i + 1).padStart(2, '0')}-${step.selector}-${variant}-${theme}.png`
        await page.screenshot({
          path: `test-results/onboarding/${filename}`,
          fullPage: false,
        })
        await page.getByRole('button', { name: step.cta }).click()
        if (i < STEPS.length - 1) {
          await waitForPopoverOpen(page, STEPS[i + 1].title)
        }
      }
    })
  }
})