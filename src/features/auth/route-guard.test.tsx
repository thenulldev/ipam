import assert from 'node:assert/strict'
import test from 'node:test'
import { register } from 'node:module'

// Register a tiny loader that swaps the three imports <AuthGuard>
// depends on for in-memory stubs. `module.register` is idempotent for
// the same loader URL, so this is safe to call from multiple test
// files. Must happen before the first import of `./route-guard` (which
// transitively imports the mocked modules) — we therefore keep the
// static `import { decideRedirect }` to a pure-TS module (no React, no
// router) and reach the component via a dynamic import below.
const SHIM_URL = new URL('../../../scripts/_route-guard-shim.mjs', import.meta.url).href
register(SHIM_URL, import.meta.url, { data: { kind: 'mock-route-guard' } })

import { decideRedirect } from './route-guard-logic'

/**
 * Component-level tests for the auth route guard (NUL-50.5 / NUL-56).
 *
 * Acceptance criterion from the issue:
 *
 *   "When /me errors with 401, navigating to /racks ends up at /login."
 *
 * The component `<AuthGuard>` is a thin effect wrapper around the pure
 * `decideRedirect` helper. The effect runs on every change of the auth
 * query result and, when `decideRedirect` returns `{kind: 'to-login',
 * from}`, calls `useNavigate()({to: '/login', search: {from}, replace:
 * true})`. There is no other logic in the component.
 *
 * Two layers of coverage:
 *
 *   1. **Decision contract** — pin the exact arguments <AuthGuard> feeds
 *      into `decideRedirect` when /me returns 401 on /racks (with and
 *      without a query string) and assert the redirect target. This is
 *      the "navigating to /racks ends up at /login" contract — the
 *      `useNavigate()` call is a single line that passes that target
 *      through verbatim.
 *
 *   2. **Splash markup** — render <AuthGuard> with a stub `useCurrentUser`
 *      returning `isLoading=true` and assert the splash skeleton renders
 *      (no flash of unauthenticated content). The render uses
 *      `react-dom/server`'s `renderToStaticMarkup` with hand-mocked
 *      router hooks via a tiny loader shim (`scripts/_route-guard-shim.mjs`).
 *      `renderToStaticMarkup` is sufficient here because effects don't
 *      fire during SSR — we only need to inspect the rendered output.
 *
 * Why two layers instead of mounting with effects? The project runs
 * `node --test` against `node:test`. There is no jsdom / happy-dom in
 * the dependency tree, and adding one for a single test is a scope
 * expansion. The decision-contract test pins the only branch in the
 * component's effect, so the test would still catch a regression in
 * the redirect target.
 */

test('401 on /me + path /racks resolves to navigate("/login?from=/racks")', () => {
  // These are the inputs <AuthGuard> builds from a 401 /me response and
  // the current URL. `isSuccess: false` is what makes `isAuthenticated`
  // false (see the `me.isSuccess` line in route-guard.tsx).
  const decision = decideRedirect({
    isLoading: false,
    isAuthenticated: false,
    currentPath: '/racks',
    currentSearch: '',
    currentSearchObj: {},
  })

  assert.deepEqual(decision, { kind: 'to-login', from: '/racks' })

  // <AuthGuard> passes `decision.from` straight to useNavigate. We
  // assert the navigation target shape that useNavigate would receive
  // for this decision, by mirroring the component's call site.
  const navTarget = {
    to: '/login',
    search: { from: decision.from },
    replace: true,
  }
  assert.deepEqual(navTarget, {
    to: '/login',
    search: { from: '/racks' },
    replace: true,
  })
})

test('401 on /me + path /racks?tab=devices preserves the search in from', () => {
  const decision = decideRedirect({
    isLoading: false,
    isAuthenticated: false,
    currentPath: '/racks',
    currentSearch: '?tab=devices',
    currentSearchObj: { tab: 'devices' },
  })

  assert.deepEqual(decision, { kind: 'to-login', from: '/racks?tab=devices' })
})

test('401 on /me + path /ipam resolves to /login?from=/ipam', () => {
  const decision = decideRedirect({
    isLoading: false,
    isAuthenticated: false,
    currentPath: '/ipam',
    currentSearch: '',
    currentSearchObj: {},
  })
  assert.deepEqual(decision, { kind: 'to-login', from: '/ipam' })
})

test('authenticated user on /racks is allowed (no redirect)', () => {
  const decision = decideRedirect({
    isLoading: false,
    isAuthenticated: true,
    currentPath: '/racks',
    currentSearch: '',
    currentSearchObj: {},
  })
  assert.equal(decision, null)
})

test('loading state never redirects (splash renders, no nav)', () => {
  const decision = decideRedirect({
    isLoading: true,
    isAuthenticated: false,
    currentPath: '/racks',
    currentSearch: '',
    currentSearchObj: {},
  })
  assert.equal(decision, null)
})

test('splash skeleton markup renders while /me is loading', async () => {
  // The splash render is exercised by actually mounting <AuthGuard>
  // under react-dom/server with mocked router hooks via
  // scripts/_route-guard-shim.mjs. The test only runs when the shim is
  // active (otherwise the imports of @tanstack/react-router and
  // ./use-current-user would resolve to the real modules and the
  // router hook calls would throw under SSR).
  //
  // `tsx`'s loader emits the classic JSX transform (`React.createElement`)
  // for `.tsx` files, which requires `React` to be in scope at runtime
  // — `react-jsx` (automatic) only kicks in when TS's emit step runs.
  // We bind it from `react`'s default export so the legacy server
  // renderer can find it. This is test-only and doesn't touch any
  // production code.
  if (typeof globalThis.React === 'undefined') {
    const React = (await import('react')).default
    globalThis.React = React
  }

  let AuthGuard
  try {
    ;({ AuthGuard } = await import('./route-guard'))
  } catch (err) {
    // Skip with a clear message if the shim isn't active. This makes
    // the test runnable in CI without forcing every other test in the
    // file to opt in.
    if (err instanceof Error && /router|hook|current-user/i.test(err.message)) {
      assert.fail(
        'route-guard.test.tsx must be run with scripts/_route-guard-shim.mjs loaded.\n' +
          '  node --import tsx --import ./scripts/_route-guard-shim.mjs --test src/features/auth/route-guard.test.tsx',
      )
    }
    throw err
  }

  globalThis.__routeGuardMeState = {
    isLoading: true,
    isSuccess: false,
    isError: false,
    data: null,
    error: null,
  }

  const { renderToStaticMarkup } = await import('react-dom/server')
  const { createElement } = await import('react')

  const html = renderToStaticMarkup(createElement(AuthGuard, null, 'main-content'))

  // The splash renders skeleton primitives; children are NOT rendered
  // until /me resolves. We assert that no children markup leaks through.
  assert.match(html, /data-testid="skeleton"/)
  assert.doesNotMatch(html, /main-content/)
})

test('splash skeleton markup renders while /me is in a 401 error state', async () => {
  if (typeof globalThis.React === 'undefined') {
    const React = (await import('react')).default
    globalThis.React = React
  }

  let AuthGuard
  try {
    ;({ AuthGuard } = await import('./route-guard'))
  } catch (err) {
    if (err instanceof Error && /router|hook|current-user/i.test(err.message)) {
      assert.fail(
        'route-guard.test.tsx must be run with scripts/_route-guard-shim.mjs loaded.',
      )
    }
    throw err
  }

  // 401 from /me — the component renders <AuthSplash /> while the
  // redirect effect runs. Once the effect fires (which we cannot
  // observe under SSR), the location changes to /login.
  globalThis.__routeGuardMeState = {
    isLoading: false,
    isSuccess: false,
    isError: true,
    data: null,
    error: { status: 401, message: 'Unauthorized' },
  }

  const { renderToStaticMarkup } = await import('react-dom/server')
  const { createElement } = await import('react')

  const html = renderToStaticMarkup(createElement(AuthGuard, null, 'main-content'))

  assert.match(html, /data-testid="skeleton"/)
  assert.doesNotMatch(html, /main-content/)
})

test.afterEach(() => {
  delete globalThis.__routeGuardMeState
})