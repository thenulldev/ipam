import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for the IPAM end-to-end suite (NUL-61).
 *
 * Boots no servers itself - the dev stack (Vite 5173 + Hono 8787) is
 * expected to be already running on the host. Run `node scripts/dev.mjs`
 * in another terminal first, or let the npm script `test:e2e` do it.
 *
 * Hostname note: the dev stack is reachable on either `127.0.0.1` or
 * `localhost`. The Hono server deliberately serves no CORS headers
 * (NUL-231 — adding dev CORS would weaken prod), so any browser fetch
 * to http://127.0.0.1:8787 from a page on http://localhost:5173 (or
 * vice versa) is preflight-blocked. Pin `baseURL` + `PLAYWRIGHT_API_URL`
 * to `localhost` so every URL the browser sees has a single origin
 * (after Vite proxies /api through to :8787 server-side).
 *
 * `--disable-web-security` on the projects below is intentionally kept
 * because `tests/onboarding.spec.ts` issues fixture calls
 * (`fetch(http://localhost:8787/...)` for the tour-reset PATCH) from
 * inside the page evaluate; those are deliberately cross-origin and
 * would need their own CORS or proxy rewrite to drop the flag. That
 * refactor is out of scope for NUL-271 and tracked separately.
 *
 * Screenshot output: `test-results/onboarding/` so failures and the
 * deliberate capture step share a directory the CI workflow can archive.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: /onboarding\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0, // Each scenario is deterministic against localStorage; no flakes expected.
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'desktop-light',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        colorScheme: 'light',
        // NUL-231: the prod path is same-origin (nginx serves SPA + /api),
        // and the dev path is now also same-origin through Vite's /api proxy.
        // `--disable-web-security` is still passed because tests/onboarding.spec.ts
        // also issues direct :8787 fixture calls inside page.evaluate() that
        // are deliberately cross-origin; see the file-header comment.
        launchOptions: { args: ['--disable-web-security'] },
      },
    },
    {
      name: 'desktop-dark',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        colorScheme: 'dark',
        launchOptions: { args: ['--disable-web-security'] },
      },
    },
    {
      name: 'mobile-iphone',
      use: {
        ...devices['iPhone 13'],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
        colorScheme: 'light',
        launchOptions: { args: ['--disable-web-security'] },
      },
    },
  ],
})