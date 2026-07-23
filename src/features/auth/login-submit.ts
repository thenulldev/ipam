/**
 * Pure login submission logic (NUL-50.2 / NUL-53 / NUL-56).
 *
 * Kept in a separate `.ts` file (no React, no JSX, no aliased imports) so it
 * can be loaded and exercised under `node --test` without dragging in the
 * React rendering tree, the `@/components/...` alias graph, or the TanStack
 * Router runtime. The React component in `login-page.tsx` is a thin wrapper
 * that wires `fetch`, `useQueryClient`, and `useNavigate` into these pure
 * functions.
 *
 * The submission goes through `fetch` directly (not the `apiFetch` wrapper
 * from `@/lib/api/http-client.ts`) because we need to read the `Retry-After`
 * response header on a 429 — `apiFetch` discards response headers.
 *
 * Mirrors the structure of `logout-orchestration.ts`: a pure function plus a
 * small dependency-injection seam for tests.
 */

export class LoginNetworkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LoginNetworkError'
  }
}

export class LoginHttpError extends Error {
  readonly status: number
  readonly retryAfterSeconds: number | null
  constructor(status: number, message: string, retryAfterSeconds: number | null) {
    super(message)
    this.name = 'LoginHttpError'
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export interface LoginSubmitDeps {
  /**
   * Performs the actual HTTP call. Defaults to `globalThis.fetch` with the
   * base URL resolved from `VITE_API_URL` (or `http://localhost:8787`).
   * Tests inject a stub.
   */
  fetchImpl?: typeof fetch
  /**
   * Resolves the API base URL. Defaults to `http://localhost:8787` (or
   * `VITE_API_URL` from `import.meta.env` when running under Vite). Tests
   * inject a stub so they don't need the Vite shim.
   */
  resolveBaseUrl?: () => string
  /**
   * Invalidates the `['me']` query so the next read triggers a refetch. The
   * page also calls `prefetchMe` afterwards (via the caller) so the cache is
   * populated immediately rather than waiting for a downstream component to
   * mount and re-query.
   */
  invalidateMe: () => Promise<unknown>
  /**
   * Refetches and populates the `['me']` cache. Run after `invalidateMe` so
   * `queryClient.getQueryData(['me'])` is the current user right away.
   */
  prefetchMe: () => Promise<unknown>
  /**
   * Navigates the router to the post-login target. Pure side-effect —
   * `login-page.tsx` wires this to `useNavigate()`. Tests pass a spy.
   */
  navigateToTarget: (to: string) => Promise<unknown> | void
}

export interface LoginSubmitInput {
  email: string
  password: string
}

export interface LoginSubmitResult {
  ok: true
  navigatedTo: string
}

const DEFAULT_BASE_URL = 'http://localhost:8787'

function defaultResolveBaseUrl(): string {
  const env = (globalThis as { import?: { meta?: { env?: Record<string, string | undefined> } } })
    .import?.meta?.env
  return (env?.VITE_API_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null
  const seconds = Number.parseInt(header, 10)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return seconds
}

/**
 * Submit the login form.
 *
 * Returns either `{ ok: true, navigatedTo }` on a 200 (the caller is then
 * responsible for re-rendering) or throws:
 *   - `LoginNetworkError` when `fetch` rejects (no connection).
 *   - `LoginHttpError` on any non-2xx response, with `status` and
 *     `retryAfterSeconds` populated when applicable.
 *
 * The caller (the React page) translates those into a user-facing message
 * and renders it. Keeping the message strings in the page keeps this module
 * dependency-free.
 */
export async function submitLogin(
  deps: LoginSubmitDeps,
  values: LoginSubmitInput,
  postLoginTarget: string = '/',
): Promise<LoginSubmitResult> {
  const baseUrl = (deps.resolveBaseUrl ?? defaultResolveBaseUrl)()
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch.bind(globalThis)

  let response: Response
  try {
    response = await fetchImpl(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(values),
    })
  } catch (err) {
    throw new LoginNetworkError(
      err instanceof Error ? err.message : 'Could not reach the server',
    )
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new LoginHttpError(401, 'Invalid email or password.', null)
    }
    if (response.status === 429) {
      throw new LoginHttpError(
        429,
        'Too many attempts.',
        parseRetryAfter(response.headers.get('Retry-After')),
      )
    }
    throw new LoginHttpError(response.status, 'Sign-in failed.', null)
  }

  // 2xx — refresh the /me cache so getQueryData(['me']) returns the user
  // immediately for any downstream reader (Topbar, route guard, etc).
  await deps.invalidateMe()
  await deps.prefetchMe()
  await deps.navigateToTarget(postLoginTarget)

  return { ok: true, navigatedTo: postLoginTarget }
}
