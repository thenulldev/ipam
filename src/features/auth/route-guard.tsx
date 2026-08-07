import { useEffect, type ReactNode } from 'react'
import { useNavigate, useLocation } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'

import { useCurrentUser } from './use-current-user'
import {
  decideRedirect,
  makeSessionExpiredHandler,
  type RedirectInputs,
} from './route-guard-logic'
import { SESSION_EXPIRED_EVENT } from '@/lib/api/http-client'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Top-level auth gate (NUL-50.2 / NUL-53).
 *
 * Wraps the routed outlet so every navigation runs through the same session
 * check. The decision logic lives in `./route-guard-logic.ts` (a pure TS
 * module with no React/JSX/aliased imports) so it can be exercised under
 * `node --test`. The component here is a thin effect + render wrapper.
 *
 * Behaviour:
 *
 *   1. While `/api/auth/me` is still loading, render a splash skeleton so the
 *      user doesn't see a flash of the wrong page.
 *   2. On 401, bounce to `/login` with `?from=<current>`.
 *   3. While on `/login` with a valid session, send them to `from` (or `/`).
 *   4. Otherwise render children.
 *
 * The NUL-50 plan mentioned both a `<AuthGuard>` component and a `beforeLoad`
 * on the root route. We use the component form because TanStack Router
 * `beforeLoad` runs before data fetching and we want a single shared `/me`
 * query — multiple guards would each fire their own request.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const me = useCurrentUser()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()

  const currentPath = location.pathname
  const currentSearch = location.searchStr ?? ''

  useEffect(() => {
    const decision = decideRedirect({
      isLoading: me.isLoading,
      isAuthenticated: me.isSuccess,
      currentPath,
      currentSearch,
      currentSearchObj: location.search,
    } satisfies RedirectInputs)
    if (!decision) return

    if (decision.kind === 'to-login') {
      void navigate({
        to: '/login',
        search: { from: decision.from },
        replace: true,
      })
      return
    }

    if (decision.kind === 'to-from') {
      void navigate({ to: decision.to, replace: true })
    }
  }, [
    me.isLoading,
    me.isSuccess,
    currentPath,
    currentSearch,
    location.search,
    navigate,
  ])

  // NUL-50.4 — listen for the `ipam:session-expired` event dispatched by
  // `apiFetch` on any non-login `/api/**` 401. The user is sitting on a
  // protected page (probably with stale data); we need to:
  //
  //   1. Drop the cached `['me']` so the next read refetches (and the
  //      `decideRedirect` effect above sees `isAuthenticated: false`).
  //   2. Bounce to `/login?from=<current>` so the destination is
  //      preserved across the round-trip.
  //
  // The listener logic (sanitisation, /login short-circuit, cache wipe,
  // navigation) lives in `makeSessionExpiredHandler` in
  // `route-guard-logic.ts` so it can be exercised under node --test
  // without rendering React. The effect here is just the event wiring.
  //
  // The listener is `replace: true` so the stale page doesn't pollute
  // history. We deliberately don't `e.preventDefault()` — there is no
  // default browser behaviour for a `CustomEvent`.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = makeSessionExpiredHandler({
      currentPath,
      currentSearch,
      queryClient,
      navigate: (opts) => navigate(opts),
    })
    window.addEventListener(SESSION_EXPIRED_EVENT, handler)
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handler)
    }
  }, [currentPath, currentSearch, navigate, queryClient])

  if (me.isLoading && currentPath !== '/login') {
    return <AuthSplash />
  }

  if (me.isError && currentPath !== '/login') {
    const status = (me.error as { status?: number } | null)?.status
    if (status === 401) return <AuthSplash />
  }

  return <>{children}</>
}

/**
 * Splash shown while the session is being resolved. Matches the visual
 * language of the existing skeleton primitives so it doesn't feel like an
 * error state.
 */
function AuthSplash() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  )
}
