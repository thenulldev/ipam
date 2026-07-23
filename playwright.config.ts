import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for the IPAM end-to-end suite (NUL-61).
 *
 * Boots no servers itself - the dev stack (Vite 5173 + Hono 8787) is
 * expected to be already running on the host. Run `node scripts/dev.mjs`
 * in another terminal first, or let the npm script `test:e2e` do it.
 *
 * Hostname note: the dev stack is reachable on either `127.0.0.1` or
 * `localhost`, but only `localhost` is in the Hono CORS allowlist
 * (NUL-11 — pre-existing dev-server CORS gap). Hitting `127.0.0.1` would
 * silently CORS-block every `/api/*` call, leaving the route-guard
 * splash stuck and every test waiting 60 s for an input that never
 * mounts. Pin `baseURL` + `PLAYWRIGHT_API_URL` to `localhost`.
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
        // NUL-11 dev CORS gap: the Hono server does not return CORS headers,
        // and the Vite dev server has no /api proxy. Real deploys sit behind
        // a same-origin reverse proxy so this is dev-only. `--disable-web-security`
        // is safe here because the dev stack only listens on localhost.
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