/**
 * Pure decision logic for the auth route guard (NUL-50.2 / NUL-53).
 *
 * Kept in a separate `.ts` file (no JSX, no React, no aliased imports) so it
 * can be loaded and exercised under `node --test` without dragging in the
 * React rendering tree or the `@/components/...` alias graph.
 */

export type RedirectDecision =
  | { kind: 'to-login'; from: string }
  | { kind: 'to-from'; to: string }
  | null

export interface RedirectInputs {
  isLoading: boolean
  isAuthenticated: boolean
  currentPath: string
  currentSearch: string
  currentSearchObj: unknown
}

/**
 * Decide what (if anything) the auth guard should navigate to.
 *
 * Returns `null` when no navigation is needed (i.e. allow rendering as-is).
 * Pure function — does no I/O, no React, no router.
 *
 * Rules:
 *   - Loading: never redirect.
 *   - Anonymous user on /login: stay (login page handles its own 401 UX).
 *   - Anonymous user on anything else: redirect to /login?from=<current>.
 *   - Authenticated user on /login: send to `from` (or `/`).
 *   - Authenticated user elsewhere: stay.
 */
export function decideRedirect(inputs: RedirectInputs): RedirectDecision {
  if (inputs.isLoading) return null

  if (!inputs.isAuthenticated) {
    if (inputs.currentPath === '/login') return null
    const from = `${inputs.currentPath}${inputs.currentSearch || ''}`
    return { kind: 'to-login', from }
  }

  if (inputs.currentPath === '/login') {
    const fromParam = (inputs.currentSearchObj as { from?: unknown } | null)?.from
    const from =
      typeof fromParam === 'string' &&
      fromParam.startsWith('/') &&
      !fromParam.startsWith('//')
        ? fromParam
        : '/'
    return { kind: 'to-from', to: from }
  }

  return null
}

/**
 * Validate a `from` search-param value: must be a relative in-app path.
 * Exported for use by the login page when bouncing the user back.
 */
export function safePostLoginTarget(
  from: unknown,
  fallback: string = '/',
): string {
  if (typeof from !== 'string') return fallback
  if (!from.startsWith('/')) return fallback
  if (from.startsWith('//')) return fallback
  return from
}

/**
 * Decide what the auth guard should do when the `ipam:session-expired`
 * window event fires (NUL-50.4 — a non-login `/api/**` call returned 401
 * while the user is sitting on a protected page).
 *
 * Returns `null` when no navigation is needed (we're already on
 * `/login`, the destination would be unsafe, or there is no current path).
 * Otherwise returns `{ from }` so the React effect can navigate to
 * `/login?from=<from>` and clear the cached session.
 *
 * Pure function — does no I/O, no React, no router. The caller is
 * responsible for the actual `removeQueries` / `invalidateQueries` calls
 * and the `useNavigate()` dispatch.
 *
 * Behaviour:
 *   - On `/login` → no-op. The user is already at the login form; a
 *     stale 401 from a background mutation shouldn't kick them off it.
 *   - Path with an unsafe `from` (protocol-relative, absolute, etc.) →
 *     fall back to `/` so we can't be tricked into redirecting to an
 *     attacker-controlled host.
 *   - Otherwise preserve the current path/query verbatim (the value
 *     came from `location.pathname + location.searchStr` on the same
 *     origin, so it's already a safe in-app reference).
 */
export function decideSessionExpiredRedirect(
  currentPath: string,
  currentSearch: string,
): { from: string } | null {
  if (currentPath === '/login') return null
  const fromCandidate = `${currentPath}${currentSearch || ''}`
  // safePostLoginTarget always returns a string — unsafe paths collapse
  // to `/` so we can't be tricked into bouncing to an attacker host.
  return { from: safePostLoginTarget(fromCandidate, '/') }
}

/**
 * Minimal interface for the bits of the React Query client the
 * session-expired listener touches. Defined as a structural type so tests
 * don't need the real QueryClient (which drags in the alias graph).
 */
export interface SessionExpiredQueryClient {
  removeQueries: (opts: { queryKey: readonly unknown[] }) => unknown
  invalidateQueries: (opts: { queryKey: readonly unknown[] }) => unknown
}

/**
 * Side-effect interface for the navigation step the listener triggers.
 * Tests pass a spy; production wires this to `useNavigate()` from
 * `@tanstack/react-router`.
 */
export type SessionExpiredNavigate = (opts: {
  to: string
  search: { from: string }
  replace: boolean
}) => Promise<unknown> | void

/**
 * Build the listener for the `ipam:session-expired` window event. The
 * React effect in `route-guard.tsx` is a thin wrapper around this — it
 * exists as a pure function so it can be exercised under `node --test`
 * without rendering the component.
 *
 * Returns a handler that, when invoked:
 *
 *   1. Resolves the redirect target with `decideSessionExpiredRedirect`.
 *   2. On a non-null target, clears the `['me']` query cache (remove +
 *      invalidate, mirroring the logout flow) and navigates to
 *      `/login?from=<target>`.
 *   3. On a null target (we're already on /login), is a no-op.
 *
 * `onNoOp` is an optional hook for tests that want to assert the
 * no-op branch fired.
 */
export function makeSessionExpiredHandler(deps: {
  currentPath: string
  currentSearch: string
  queryClient: SessionExpiredQueryClient
  navigate: SessionExpiredNavigate
  onNoOp?: () => void
}): () => void {
  return () => {
    const decision = decideSessionExpiredRedirect(
      deps.currentPath,
      deps.currentSearch,
    )
    if (!decision) {
      deps.onNoOp?.()
      return
    }
    deps.queryClient.removeQueries({ queryKey: ['me'] })
    deps.queryClient.invalidateQueries({ queryKey: ['me'] })
    void deps.navigate({
      to: '/login',
      search: { from: decision.from },
      replace: true,
    })
  }
}
