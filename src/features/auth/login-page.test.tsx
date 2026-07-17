import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { UseFormRegister, FieldErrors } from 'react-hook-form'

import { LoginFormFields } from './login-page'
import { submitLogin } from './login-submit'
import type { CurrentUser } from './use-current-user'

/**
 * Component-level tests for the login page (NUL-50.5 / NUL-56).
 *
 * Two layers of coverage:
 *
 *   1. Static markup — render `<LoginFormFields>` with hand-built `register`
 *      stubs and assert the field names, `autoComplete` hints, button label,
 *      and submit-error rendering. This is the same `react-dom/server`
 *      pattern used by `use-media-query.test.ts` — it avoids standing up
 *      a router and a QueryClient for what is fundamentally a stateless
 *      form.
 *
 *   2. Submission wiring — call `submitLogin` (the pure helper behind the
 *      page) with a stubbed `fetch` and a stubbed query client, and
 *      verify:
 *        - The POST goes to `/api/auth/login` with JSON body +
 *          `credentials: 'include'`.
 *        - On 2xx, the `['me']` cache is invalidated, then re-populated
 *          via `prefetchMe`, then `navigateToTarget('/')` fires.
 *        - On 401, a `LoginHttpError` is thrown (the React page maps
 *          this to "Invalid email or password.").
 *
 * `submitLogin` is the contract — the React page is a thin wrapper
 * around it. By exercising it directly we pin the part that matters
 * without coupling the test to the `useNavigate` / `useQueryClient`
 * hooks.
 */

type LoginInput = { email: string; password: string }

function buildRegisterStub(): {
  register: UseFormRegister<LoginInput>
  registered: Set<string>
} {
  // Minimal RHF register stub. Real `register` returns spread props for
  // an input; the form only consumes `name`, `ref`, `onChange`, `onBlur`.
  // We capture the registered names for assertions and emit benign stubs
  // for the rest.
  const registered = new Set<string>()
  const stub = ((name: keyof LoginInput) => {
    registered.add(String(name))
    return {
      name: String(name),
      onChange: () => undefined,
      onBlur: () => undefined,
      ref: () => undefined,
    }
    // Cast through unknown — the real RHF return type is richer, but the
    // form only reads the four keys above.
  }) as unknown as UseFormRegister<LoginInput>
  return { register: stub, registered }
}

function emptyErrors(): FieldErrors<LoginInput> {
  return {}
}

test('LoginFormFields renders email + password inputs and a submit button', () => {
  const { register, registered } = buildRegisterStub()
  const html = renderToStaticMarkup(
    createElement(LoginFormFields, {
      register,
      errors: emptyErrors(),
      isSubmitting: false,
      submitError: null,
    }),
  )

  // Field labels and inputs are present.
  assert.match(html, /Email/)
  assert.match(html, /Password/)
  assert.match(html, /type="email"/)
  assert.match(html, /type="password"/)
  // `autoComplete` hints ride along with the browser's password manager.
  // (React preserves the camelCase prop in SSR markup.)
  assert.match(html, /autoComplete="email"/)
  assert.match(html, /autoComplete="current-password"/)
  // The submit button starts with "Sign in" and is enabled.
  assert.match(html, /Sign in/)
  assert.match(html, /type="submit"/)
  // Both fields are registered.
  assert.deepEqual([...registered].sort(), ['email', 'password'])
})

test('LoginFormFields shows the submit error when provided', () => {
  const html = renderToStaticMarkup(
    createElement(LoginFormFields, {
      register: buildRegisterStub().register,
      errors: emptyErrors(),
      isSubmitting: false,
      submitError: 'Invalid email or password.',
    }),
  )
  assert.match(html, /Invalid email or password\./)
  assert.match(html, /role="alert"/)
})

test('LoginFormFields flips the button label while submitting', () => {
  const html = renderToStaticMarkup(
    createElement(LoginFormFields, {
      register: buildRegisterStub().register,
      errors: emptyErrors(),
      isSubmitting: true,
      submitError: null,
    }),
  )
  assert.match(html, /Signing in…/)
  // The button is disabled while submitting.
  assert.match(html, /disabled=""?/)
})

test('submitLogin: 2xx invalidates + prefetches /me and navigates to "/"', async () => {
  const calls: { method: string; url: string; init?: RequestInit }[] = []
  const queryCalls: { method: string; key: string[] }[] = []
  const navCalls: string[] = []

  const user: CurrentUser = {
    id: 'u-1',
    tenantId: 't-1',
    email: 'stephan@internal.example',
    role: 'admin',
  }

  const queryClient = {
    invalidateQueries(opts: { queryKey: readonly unknown[] }) {
      queryCalls.push({ method: 'invalidate', key: [...opts.queryKey].map(String) })
    },
    fetchQuery(opts: { queryKey: readonly unknown[]; queryFn: () => Promise<CurrentUser> }) {
      queryCalls.push({ method: 'fetch', key: [...opts.queryKey].map(String) })
      return opts.queryFn()
    },
  }

  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({
      method: 'fetch',
      url: typeof input === 'string' ? input : (input as Request).url,
      init,
    })
    // First call is /api/auth/login (200); the prefetchMe follow-up is /api/auth/me.
    if (typeof input === 'string' && input.endsWith('/api/auth/login')) {
      return new Response('{"ok":true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (typeof input === 'string' && input.endsWith('/api/auth/me')) {
      return new Response(JSON.stringify(user), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response('not found', { status: 404 })
  }

  const result = await submitLogin(
    {
      fetchImpl,
      resolveBaseUrl: () => 'http://localhost:8787',
      invalidateMe: () => Promise.resolve(queryClient.invalidateQueries({ queryKey: ['me'] })),
      prefetchMe: () =>
        Promise.resolve(
          queryClient.fetchQuery({
            queryKey: ['me'],
            queryFn: () =>
              fetchImpl('http://localhost:8787/api/auth/me').then((r) => r.json() as Promise<CurrentUser>),
          }),
        ),
      navigateToTarget: (to) => {
        navCalls.push(to)
        return Promise.resolve()
      },
    },
    { email: 'stephan@internal.example', password: 'ipam-dev' },
    '/',
  )

  assert.deepEqual(result, { ok: true, navigatedTo: '/' })
  assert.equal(navCalls.length, 1)
  assert.equal(navCalls[0], '/')

  // POSTed to /api/auth/login with the right shape.
  assert.equal(calls.length, 2, 'login + /me follow-up')
  const loginCall = calls[0]
  assert.equal(loginCall.url, 'http://localhost:8787/api/auth/login')
  assert.equal(loginCall.init?.method, 'POST')
  const headers = loginCall.init?.headers as Record<string, string>
  assert.equal(headers?.['Content-Type'], 'application/json')
  assert.equal((loginCall.init as RequestInit | undefined)?.credentials, 'include')
  const body = JSON.parse(String(loginCall.init?.body))
  assert.deepEqual(body, { email: 'stephan@internal.example', password: 'ipam-dev' })

  // /me cache was invalidated then prefetched.
  assert.deepEqual(queryCalls, [
    { method: 'invalidate', key: ['me'] },
    { method: 'fetch', key: ['me'] },
  ])
})

test('submitLogin: invalid from-target is honoured as a navigation argument', async () => {
  const navCalls: string[] = []
  const fetchImpl: typeof fetch = async () =>
    new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } })

  await submitLogin(
    {
      fetchImpl,
      resolveBaseUrl: () => 'http://localhost:8787',
      invalidateMe: () => Promise.resolve(),
      prefetchMe: () => Promise.resolve(),
      navigateToTarget: (to) => {
        navCalls.push(to)
        return Promise.resolve()
      },
    },
    { email: 'a@b.c', password: 'x' },
    '/racks?tab=devices',
  )

  assert.deepEqual(navCalls, ['/racks?tab=devices'])
})

test('submitLogin: 401 throws LoginHttpError(401) and does not navigate', async () => {
  const navCalls: string[] = []
  const queryCalls: string[] = []

  const fetchImpl: typeof fetch = async () =>
    new Response('{"message":"Unauthorized"}', {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })

  await assert.rejects(
    submitLogin(
      {
        fetchImpl,
        resolveBaseUrl: () => 'http://localhost:8787',
        invalidateMe: () => {
          queryCalls.push('invalidate')
          return Promise.resolve()
        },
        prefetchMe: () => {
          queryCalls.push('prefetch')
          return Promise.resolve()
        },
        navigateToTarget: (to) => {
          navCalls.push(to)
          return Promise.resolve()
        },
      },
      { email: 'a@b.c', password: 'wrong' },
    ),
    (err: unknown) => {
      assert.ok(err instanceof Error)
      assert.equal((err as Error).name, 'LoginHttpError')
      assert.equal((err as { status?: number }).status, 401)
      return true
    },
  )

  // No cache churn, no navigation on auth failure.
  assert.deepEqual(queryCalls, [])
  assert.deepEqual(navCalls, [])
})

test('submitLogin: 429 throws LoginHttpError with retry-after seconds', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response('rate limited', {
      status: 429,
      headers: { 'Content-Type': 'text/plain', 'Retry-After': '42' },
    })

  await assert.rejects(
    submitLogin(
      {
        fetchImpl,
        resolveBaseUrl: () => 'http://localhost:8787',
        invalidateMe: () => Promise.resolve(),
        prefetchMe: () => Promise.resolve(),
        navigateToTarget: () => Promise.resolve(),
      },
      { email: 'a@b.c', password: 'x' },
    ),
    (err: unknown) => {
      const e = err as { status?: number; retryAfterSeconds?: number | null }
      assert.equal(e.status, 429)
      assert.equal(e.retryAfterSeconds, 42)
      return true
    },
  )
})

test('submitLogin: fetch rejection throws LoginNetworkError', async () => {
  const fetchImpl: typeof fetch = async () => {
    throw new TypeError('Failed to fetch')
  }

  await assert.rejects(
    submitLogin(
      {
        fetchImpl,
        resolveBaseUrl: () => 'http://localhost:8787',
        invalidateMe: () => Promise.resolve(),
        prefetchMe: () => Promise.resolve(),
        navigateToTarget: () => Promise.resolve(),
      },
      { email: 'a@b.c', password: 'x' },
    ),
    (err: unknown) => {
      assert.equal((err as Error).name, 'LoginNetworkError')
      return true
    },
  )
})