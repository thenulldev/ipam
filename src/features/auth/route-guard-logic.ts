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
