import assert from 'node:assert/strict'
import test from 'node:test'

import { performLogout, LogoutApiError } from './logout-orchestration'

/**
 * Unit tests for the pure `performLogout` helper.
 *
 * The acceptance criterion for NUL-53 is: "Logout button in topbar ends the
 * session and lands on /login." We exercise that sequence with fakes — no DOM,
 * no React, no router.
 */

function makeDeps(overrides: Partial<Parameters<typeof performLogout>[0]> = {}) {
  const calls: { method: string; key: unknown[] }[] = []
  const queryClient = {
    removeQueries: (opts: { queryKey: readonly unknown[] }) => {
      calls.push({ method: 'remove', key: [...opts.queryKey] })
      return undefined
    },
    invalidateQueries: (opts: { queryKey: readonly unknown[] }) => {
      calls.push({ method: 'invalidate', key: [...opts.queryKey] })
      return undefined
    },
  }
  return {
    deps: {
      post: () => Promise.resolve(undefined),
      queryClient,
      navigateToLogin: () => {
        calls.push({ method: 'navigate', key: [] })
      },
      ...overrides,
    },
    calls,
  }
}

test('happy path: post → clear me → navigate', async () => {
  const { deps, calls } = makeDeps()
  await performLogout(deps)
  assert.deepEqual(calls, [
    { method: 'remove', key: ['me'] },
    { method: 'invalidate', key: ['me'] },
    { method: 'navigate', key: [] },
  ])
})

test('post 401 still clears local session and navigates to /login', async () => {
  const { deps, calls } = makeDeps({
    post: () => Promise.reject(new LogoutApiError(401, 'unauthenticated')),
  })
  await performLogout(deps)
  assert.equal(calls.length, 3)
  assert.equal(calls[0].method, 'remove')
  assert.equal(calls[1].method, 'invalidate')
  assert.equal(calls[2].method, 'navigate')
})

test('post 500 still clears local session and navigates to /login', async () => {
  // Server errors shouldn't trap the user on the page.
  const { deps, calls } = makeDeps({
    post: () => Promise.reject(new LogoutApiError(500, 'server error')),
  })
  await performLogout(deps)
  assert.equal(calls.length, 3)
  assert.equal(calls[2].method, 'navigate')
})

test('post network error still clears local session and navigates', async () => {
  const { deps, calls } = makeDeps({
    post: () => Promise.reject(new TypeError('Failed to fetch')),
  })
  await performLogout(deps)
  assert.equal(calls.length, 3)
  assert.equal(calls[2].method, 'navigate')
})

test('queries are removed and invalidated in the correct order', async () => {
  const order: string[] = []
  const deps = {
    post: async () => undefined,
    queryClient: {
      removeQueries: (opts: { queryKey: readonly unknown[] }) => {
        order.push(`remove:${opts.queryKey.join(',')}`)
      },
      invalidateQueries: (opts: { queryKey: readonly unknown[] }) => {
        order.push(`invalidate:${opts.queryKey.join(',')}`)
      },
    },
    navigateToLogin: () => {
      order.push('navigate')
    },
  }
  await performLogout(deps)
  assert.deepEqual(order, [
    'remove:me',
    'invalidate:me',
    'navigate',
  ])
})
