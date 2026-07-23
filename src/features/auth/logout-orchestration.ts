/**
 * Pure logout orchestration logic (NUL-50.2 / NUL-53).
 *
 * Kept in a separate `.ts` file (no React, no JSX, no aliased imports) so it
 * can be loaded and exercised under `node --test`. The React component in
 * `logout-button.tsx` is a thin wrapper that wires `api.post`,
 * `useQueryClient`, and `useNavigate` into these pure functions.
 */

export class LogoutApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'LogoutApiError'
    this.status = status
  }
}

/**
 * Minimal shape of the bits of `@tanstack/react-query` we depend on. Defined
 * as a structural type so tests don't need to pull in the real QueryClient
 * (which uses aliased paths internally).
 */
export interface LogoutQueryClient {
  removeQueries: (opts: { queryKey: readonly unknown[] }) => unknown
  invalidateQueries: (opts: { queryKey: readonly unknown[] }) => unknown
}

export interface LogoutDeps {
  post: () => Promise<unknown>
  queryClient: LogoutQueryClient
  navigateToLogin: () => void
  /**
   * Optional hook for side-effects (e.g. wiping per-user browser state). The
   * production `LogoutButton` passes a callback that dispatches a
   * `TOUR_LOGOUT_EVENT` CustomEvent so the product tour and any future
   * feature-local stores can listen without an import cycle. Tests default
   * to a no-op so behaviour stays opt-in.
   */
  onCleared?: () => void
}

/**
 * Run the logout orchestration:
 *
 *   1. POST /api/auth/logout.
 *   2. Drop the `['me']` cache (remove + invalidate — invalidate forces a
 *      fresh fetch the next time the guard mounts, which is what we want
 *      after a session is gone).
 *   3. Notify any listeners that local session state should be cleared.
 *   4. Navigate to /login.
 *
 * Errors from step 1 are tolerated (logged + swallowed) unless they're a
 * non-401 ApiError — the user's intent is clear and we'd rather not trap
 * them on a page that just rejected the logout. A 401 actually means "you
 * weren't logged in to begin with" — also the ideal outcome.
 *
 * `console.warn` is called for non-401 failures; we use `globalThis.console`
 * so a test environment that overrides `console` (or lacks it) still works.
 */
export async function performLogout(deps: LogoutDeps): Promise<void> {
  try {
    await deps.post()
  } catch (err) {
    const status =
      err instanceof LogoutApiError
        ? err.status
        : (err as { status?: unknown } | null)?.status
    const isAlready401 = status === 401
    if (!isAlready401) {
      // Use globalThis.console so test harnesses that swap it are respected.
      globalThis.console?.warn?.(
        '[ipam] logout request failed; clearing local session anyway',
        err,
      )
    }
  }

  deps.queryClient.removeQueries({ queryKey: ['me'] })
  deps.queryClient.invalidateQueries({ queryKey: ['me'] })
  deps.onCleared?.()
  deps.navigateToLogin()
}
