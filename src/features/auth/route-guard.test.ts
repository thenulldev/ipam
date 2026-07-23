import assert from 'node:assert/strict'
import test from 'node:test'

import {
  decideRedirect,
  decideSessionExpiredRedirect,
  makeSessionExpiredHandler,
  safePostLoginTarget,
} from './route-guard-logic'

/**
 * Unit tests for the pure `decideRedirect` helper in `route-guard.tsx`.
 *
 * These pin the acceptance criteria from NUL-53:
 *   - Hitting `/` while logged out navigates to `/login?from=/`.
 *   - Hitting `/login` while logged in navigates to `/`.
 *   - Hitting `/ipam?foo=bar` while logged out preserves the search.
 *   - A 401 with an absolute or protocol-relative `from` is sanitised.
 *
 * No DOM / no React — `decideRedirect` is a pure function by design.
 */

test('loading state never redirects', () => {
  assert.equal(
    decideRedirect({
      isLoading: true,
      isAuthenticated: false,
      currentPath: '/',
      currentSearch: '',
      currentSearchObj: {},
    }),
    null,
  )
})

test('anonymous user on / bounces to /login with from=/', () => {
  assert.deepEqual(
    decideRedirect({
      isLoading: false,
      isAuthenticated: false,
      currentPath: '/',
      currentSearch: '',
      currentSearchObj: {},
    }),
    { kind: 'to-login', from: '/' },
  )
})

test('anonymous user on /ipam with search preserves the search string in from', () => {
  assert.deepEqual(
    decideRedirect({
      isLoading: false,
      isAuthenticated: false,
      currentPath: '/ipam',
      currentSearch: '?foo=bar',
      currentSearchObj: { foo: 'bar' },
    }),
    { kind: 'to-login', from: '/ipam?foo=bar' },
  )
})

test('anonymous user on /login does not redirect (login page surfaces 401)', () => {
  assert.equal(
    decideRedirect({
      isLoading: false,
      isAuthenticated: false,
      currentPath: '/login',
      currentSearch: '?from=/ipam',
      currentSearchObj: { from: '/ipam' },
    }),
    null,
  )
})

test('authenticated user on /login with no from bounces to /', () => {
  assert.deepEqual(
    decideRedirect({
      isLoading: false,
      isAuthenticated: true,
      currentPath: '/login',
      currentSearch: '',
      currentSearchObj: {},
    }),
    { kind: 'to-from', to: '/' },
  )
})

test('authenticated user on /login with from=/ipam bounces to /ipam', () => {
  assert.deepEqual(
    decideRedirect({
      isLoading: false,
      isAuthenticated: true,
      currentPath: '/login',
      currentSearch: '?from=%2Fipam',
      currentSearchObj: { from: '/ipam' },
    }),
    { kind: 'to-from', to: '/ipam' },
  )
})

test('authenticated user on a protected route is allowed (no redirect)', () => {
  assert.equal(
    decideRedirect({
      isLoading: false,
      isAuthenticated: true,
      currentPath: '/ipam',
      currentSearch: '?foo=bar',
      currentSearchObj: { foo: 'bar' },
    }),
    null,
  )
})

test('protocol-relative from is rejected and falls back to /', () => {
  assert.deepEqual(
    decideRedirect({
      isLoading: false,
      isAuthenticated: true,
      currentPath: '/login',
      currentSearch: '?from=//evil.example/path',
      currentSearchObj: { from: '//evil.example/path' },
    }),
    { kind: 'to-from', to: '/' },
  )
})

test('absolute URL from is rejected and falls back to /', () => {
  assert.deepEqual(
    decideRedirect({
      isLoading: false,
      isAuthenticated: true,
      currentPath: '/login',
      currentSearch: '',
      currentSearchObj: { from: 'https://evil.example/x' },
    }),
    { kind: 'to-from', to: '/' },
  )
})

test('safePostLoginTarget mirrors decideRedirect sanitisation', () => {
  assert.equal(safePostLoginTarget('/ipam'), '/ipam')
  assert.equal(safePostLoginTarget('//evil.example'), '/')
  assert.equal(safePostLoginTarget('https://evil.example'), '/')
  assert.equal(safePostLoginTarget(undefined), '/')
  assert.equal(safePostLoginTarget(null), '/')
  assert.equal(safePostLoginTarget(42), '/')
  assert.equal(safePostLoginTarget('/ipam?foo=bar'), '/ipam?foo=bar')
  // Custom fallback
  assert.equal(safePostLoginTarget(undefined, '/dashboard'), '/dashboard')
})

/**
 * Tests for the session-expired listener (NUL-50.4).
 *
 * The listener is a `useEffect` that subscribes to the `ipam:session-expired`
 * window event dispatched by `apiFetch` on non-login `/api/**` 401 responses.
 * The decision part (sanitisation, `/login` short-circuit) lives in
 * `decideSessionExpiredRedirect`. The wiring part (event subscription,
 * cache clearing, navigation) lives in the React effect in `route-guard.tsx`
 * and is exercised under node:test via the `_route-guard-shim` loader
 * (see `route-guard.test.tsx`).
 *
 * These tests pin the decision contract. The wiring tests live next to
 * the other component tests in `route-guard.test.tsx` and run under the
 * same shim.
 */

test('session-expired on /racks bounces to /login with from=/racks', () => {
  assert.deepEqual(
    decideSessionExpiredRedirect('/racks', ''),
    { from: '/racks' },
  )
})

test('session-expired on /racks?tab=devices preserves the search string', () => {
  assert.deepEqual(
    decideSessionExpiredRedirect('/racks', '?tab=devices'),
    { from: '/racks?tab=devices' },
  )
})

test('session-expired on /ipam?foo=bar&baz=1 preserves the full query', () => {
  assert.deepEqual(
    decideSessionExpiredRedirect('/ipam', '?foo=bar&baz=1'),
    { from: '/ipam?foo=bar&baz=1' },
  )
})

test('session-expired on /login is a no-op (login form stays put)', () => {
  assert.equal(
    decideSessionExpiredRedirect('/login', '?from=/racks'),
    null,
  )
})

test('session-expired on /login (no search) is a no-op', () => {
  assert.equal(decideSessionExpiredRedirect('/login', ''), null)
})

test('session-expired sanitises an unsafe from by collapsing to /', () => {
  // In practice `currentPath` is `location.pathname` (always starts with
  // `/`), so this is defensive: if a future refactor ever swaps in a
  // raw value the listener still can't be tricked into an open redirect.
  assert.deepEqual(
    decideSessionExpiredRedirect('//evil.example', ''),
    { from: '/' },
  )
  assert.deepEqual(
    decideSessionExpiredRedirect('https://evil.example/x', ''),
    { from: '/' },
  )
  assert.deepEqual(
    decideSessionExpiredRedirect('', ''),
    { from: '/' },
  )
})

/**
 * Wiring tests for the session-expired listener (NUL-50.4).
 *
 * The handler created by `makeSessionExpiredHandler` is the function the
 * `<AuthGuard>` effect registers on the `ipam:session-expired` window
 * event. These tests drive it directly with fakes for the React Query
 * client and the router's `navigate()` — so the listener's side-effect
 * ordering is pinned without needing a DOM.
 */

interface StubQueryClient {
  calls: { method: string; key: unknown[] }[]
  removeQueries: (opts: { queryKey: readonly unknown[] }) => unknown
  invalidateQueries: (opts: { queryKey: readonly unknown[] }) => unknown
}

function makeStubQueryClient(): StubQueryClient {
  const calls: { method: string; key: unknown[] }[] = []
  return {
    calls,
    removeQueries(opts) {
      calls.push({ method: 'remove', key: [...opts.queryKey] })
      return undefined
    },
    invalidateQueries(opts) {
      calls.push({ method: 'invalidate', key: [...opts.queryKey] })
      return undefined
    },
  }
}

test('handler: clears the me cache and navigates to /login with the preserved from', () => {
  const queryClient = makeStubQueryClient()
  const navCalls: unknown[] = []
  const handler = makeSessionExpiredHandler({
    currentPath: '/racks',
    currentSearch: '?tab=devices',
    queryClient,
    navigate: (opts) => {
      navCalls.push(opts)
    },
  })

  handler()

  // Cache is wiped (remove then invalidate, mirroring the logout flow).
  assert.deepEqual(queryClient.calls, [
    { method: 'remove', key: ['me'] },
    { method: 'invalidate', key: ['me'] },
  ])
  // Navigate fires exactly once with the preserved destination.
  assert.equal(navCalls.length, 1)
  assert.deepEqual(navCalls[0], {
    to: '/login',
    search: { from: '/racks?tab=devices' },
    replace: true,
  })
})

test('handler: no-op when already on /login (login form stays put)', () => {
  const queryClient = makeStubQueryClient()
  const navCalls: unknown[] = []
  let noOpCount = 0
  const handler = makeSessionExpiredHandler({
    currentPath: '/login',
    currentSearch: '?from=/racks',
    queryClient,
    navigate: (opts) => {
      navCalls.push(opts)
    },
    onNoOp: () => {
      noOpCount += 1
    },
  })

  handler()

  assert.equal(noOpCount, 1, 'onNoOp must fire on the no-op branch')
  assert.equal(queryClient.calls.length, 0, 'cache must not be touched')
  assert.equal(navCalls.length, 0, 'no navigation must fire')
})

test('handler: passes an unsafe from through safePostLoginTarget, collapsing to /', () => {
  const queryClient = makeStubQueryClient()
  const navCalls: unknown[] = []
  const handler = makeSessionExpiredHandler({
    currentPath: '//evil.example',
    currentSearch: '',
    queryClient,
    navigate: (opts) => {
      navCalls.push(opts)
    },
  })

  handler()

  assert.deepEqual(navCalls[0], {
    to: '/login',
    search: { from: '/' },
    replace: true,
  })
})

test('handler: every invocation resets the cache before navigating', () => {
  // Pin the ordering — the React effect relies on the cache being
  // wiped *before* navigation so `decideRedirect` sees an anonymous
  // viewer on the next render rather than a stale success.
  const order: string[] = []
  const queryClient = {
    removeQueries() {
      order.push('remove')
    },
    invalidateQueries() {
      order.push('invalidate')
    },
  }
  const navCalls: string[] = []
  const handler = makeSessionExpiredHandler({
    currentPath: '/racks',
    currentSearch: '',
    queryClient,
    navigate: (opts) => {
      navCalls.push(`navigate:${opts.to}:${opts.search.from}`)
    },
  })

  handler()
  handler()

  // Two invocations → two complete clear-then-navigate cycles.
  assert.deepEqual(order, ['remove', 'invalidate', 'remove', 'invalidate'])
  assert.deepEqual(navCalls, [
    'navigate:/login:/racks',
    'navigate:/login:/racks',
  ])
})
