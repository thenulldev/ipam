import assert from 'node:assert/strict'
import test from 'node:test'

import { decideRedirect, safePostLoginTarget } from './route-guard-logic'

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
