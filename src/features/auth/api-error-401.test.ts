import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ApiError,
  SESSION_EXPIRED_EVENT,
  apiFetch,
  dispatchSessionExpired,
} from '../../lib/api/http-client.ts'

/**
 * Unit tests for the 401 → `ipam:session-expired` dispatcher wired into
 * `apiFetch` (NUL-50.4).
 *
 * The auth route guard (NUL-50.2 / NUL-53) listens for the
 * `ipam:session-expired` window event and bounces the user to
 * `/login?from=<current>`. These tests pin the contract from the NUL-50
 * plan:
 *
 *   - Any 401 from a non-login `/api/**` route dispatches the event.
 *   - A 401 from `/api/auth/login` does NOT (login page surfaces its
 *     own error and must not trigger a redirect loop).
 *   - Non-401 errors (403, 404, 500, 503) do NOT dispatch.
 *   - Successful (2xx) responses do NOT dispatch.
 *
 * Strategy: stub `globalThis.fetch` (same pattern as `physical.test.ts`)
 * and stub `globalThis.window` with a minimal object whose
 * `dispatchEvent` records the event types. Node 22 exposes `CustomEvent`
 * globally, so `httpClient.dispatchSessionExpired()` works under the
 * stub without any DOM library.
 */

interface SpyWindow {
  dispatched: string[]
  dispatchEvent(event: Event): boolean
}

function installStubs(plan: { status: number; body?: string }): () => void {
  const originalFetch = globalThis.fetch
  const originalWindow = (globalThis as { window?: unknown }).window

  globalThis.fetch = (async () =>
    new Response(plan.body ?? '', {
      status: plan.status,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch

  const spyWindow: SpyWindow = {
    dispatched: [],
    dispatchEvent(event: Event) {
      this.dispatched.push(event.type)
      return true
    },
  }
  ;(globalThis as { window?: unknown }).window = spyWindow

  return () => {
    globalThis.fetch = originalFetch
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window
    } else {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
  }
}

function currentDispatched(): string[] {
  const w = (globalThis as unknown as { window?: SpyWindow }).window
  return w?.dispatched ?? []
}

test('401 on a non-login /api/** route dispatches ipam:session-expired and throws ApiError', async () => {
  const restore = installStubs({
    status: 401,
    body: '{"message":"Unauthorized"}',
  })
  try {
    await assert.rejects(
      apiFetch('POST', '/api/racks', { name: 'r1' }),
      (err: unknown) => {
        assert.ok(err instanceof ApiError, 'expected ApiError')
        assert.equal((err as ApiError).status, 401)
        return true
      },
    )
    assert.deepEqual(currentDispatched(), [SESSION_EXPIRED_EVENT])
  } finally {
    restore()
  }
})

test('401 on a non-login GET /api/** route dispatches the event', async () => {
  const restore = installStubs({ status: 401, body: '{"message":"Unauthorized"}' })
  try {
    await assert.rejects(
      apiFetch('GET', '/api/racks/rack-a1'),
      (err: unknown) => {
        assert.ok(err instanceof ApiError)
        return true
      },
    )
    assert.deepEqual(currentDispatched(), [SESSION_EXPIRED_EVENT])
  } finally {
    restore()
  }
})

test('401 on /api/auth/login does NOT dispatch (login page handles its own 401)', async () => {
  const restore = installStubs({
    status: 401,
    body: '{"message":"Invalid credentials"}',
  })
  try {
    await assert.rejects(
      apiFetch('POST', '/api/auth/login', { email: 'a@b.c', password: 'x' }),
      (err: unknown) => {
        assert.ok(err instanceof ApiError)
        assert.equal((err as ApiError).status, 401)
        return true
      },
    )
    assert.deepEqual(currentDispatched(), [], 'no event must be dispatched on the login endpoint')
  } finally {
    restore()
  }
})

test('non-401 errors do NOT dispatch', async () => {
  for (const status of [403, 404, 500, 503]) {
    const restore = installStubs({ status, body: '{"message":"err"}' })
    try {
      await assert.rejects(
        apiFetch('GET', '/api/racks'),
        (err: unknown) => {
          assert.ok(err instanceof ApiError)
          assert.equal((err as ApiError).status, status)
          return true
        },
      )
      assert.deepEqual(currentDispatched(), [], `no event must fire for HTTP ${status}`)
    } finally {
      restore()
    }
  }
})

test('200 OK does NOT dispatch', async () => {
  const restore = installStubs({ status: 200, body: '{"ok":true}' })
  try {
    const value = await apiFetch<{ ok: boolean }>('GET', '/api/racks')
    assert.deepEqual(value, { ok: true })
    assert.deepEqual(currentDispatched(), [])
  } finally {
    restore()
  }
})

test('session-expired event name matches the contract', () => {
  assert.equal(SESSION_EXPIRED_EVENT, 'ipam:session-expired')
})

test('dispatchSessionExpired is a safe no-op when window is undefined', () => {
  // The export must short-circuit when no window exists (Node without our
  // stub), so importing http-client.ts in any test file is harmless.
  const originalWindow = (globalThis as { window?: unknown }).window
  delete (globalThis as { window?: unknown }).window
  try {
    assert.doesNotThrow(() => dispatchSessionExpired())
  } finally {
    if (originalWindow !== undefined) {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
  }
})
