/**
 * Onboarding / product-tour provider (NUL-51.C / NUL-60).
 *
 * Owns the tour runtime. Mounted once in `AppShell`, it:
 *
 *   1. Reads the current tour state from `useTour()` (NUL-51.B).
 *   2. Auto-launches the tour the first time `/api/auth/me` resolves a user
 *      AND neither the server (`onboardingCompletedAt`) nor localStorage
 *      (`ipam:tour-complete:v1`) say the tour has already been finished.
 *      Server value wins when the two disagree (NUL-51.E / NUL-59).
 *   3. For each step, navigates to `step.route` (`@tanstack/react-router`)
 *      and waits for the route match to settle before resolving the
 *      anchor element with `[data-tour="${selector}"]`.
 *   4. On mobile (< 768 px), opens the nav drawer first so the user can
 *      see the link the popover is pointing at; then renders the
 *      `TourPopover` (which itself switches to a bottom-sheet Dialog on
 *      mobile).
 *   5. Exposes the imperative `restart()` call the Topbar "Help" menu uses.
 *   6. On completion (last `next()` or `skip()`) fires a fire-and-forget
 *      `PATCH /api/users/:id` so the server records the timestamp. UI does
 *      NOT block on the PATCH — localStorage is the on-device source of
 *      truth; the server copy is for cross-device continuity + admin
 *      visibility (NUL-51.E / NUL-59).
 *
 * No new top-level dependencies. `Radix Popover` + `Radix Dialog` were
 * already in the manifest (NUL-51 plan §3).
 */

import { useRouter } from '@tanstack/react-router'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'

import { MobileNavDrawerContext } from '@/components/layout/mobile-nav-drawer-context'
import { api } from '@/lib/api/http-client'
import { useIsMobile } from '@/hooks/use-media-query'

import { TourPopover } from './tour-popover'
import { TOUR_STEPS } from './tour-data'
import { useTour } from './use-tour'
import { useCurrentUser } from '@/features/auth/use-current-user'

interface OnboardingContextValue {
  /** True while the tour is running. UI can hide decorative elements. */
  isActive: boolean
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null)

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext)
  if (!ctx) {
    throw new Error('useOnboarding() must be used inside <OnboardingProvider>')
  }
  return ctx
}

interface OnboardingProviderProps {
  children: React.ReactNode
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  const tour = useTour()
  const router = useRouter()
  const isMobile = useIsMobile()
  const drawer = useContext(MobileNavDrawerContext)

  const currentUser = useCurrentUser()
  // Only the very first successful /api/auth/me should trigger the auto-launch.
  const autoLaunchedRef = useRef(false)
  // Guard so we don't PATCH twice when both the final-next and skip paths fire.
  const persistedRef = useRef(false)

  // === Auto-launch on first authenticated load =============================
  useEffect(() => {
    if (autoLaunchedRef.current) return
    if (currentUser.isLoading) return
    const user = currentUser.data
    if (!user) return
    autoLaunchedRef.current = true

    // NUL-51.E / NUL-59 — prefer the server's `onboardingCompletedAt` over
    // the localStorage flag. If the server says the tour is done, sync the
    // localStorage flag so the rest of the state machine (which reads
    // localStorage) stays consistent. If they disagree in the other
    // direction (server: not done, localStorage: done) we trust the server
    // — the user's completion happened on another device and we want to
    // honour it.
    const serverDone = Boolean(user.onboardingCompletedAt)
    const localDone = tour.complete
    if (serverDone && !localDone) {
      tour.skip()
      return
    }
    if (!serverDone && localDone) {
      // Server reset (e.g. admin cleared the column). Force a replay.
      tour.restart()
    }
    if (tour.complete) return
    tour.start()
  }, [currentUser.isLoading, currentUser.data, tour])

  // === Persist completion when the tour finishes ===========================
  // `tour.complete` flips to true either on the final `next()` (the popover
  // clicks "Got it" on the last step) or on `skip()`. We watch the flag and
  // PATCH once per session — `persistedRef` guards against double-fire
  // (StrictMode re-runs effects in dev; React 18 also re-runs them on
  // suspense + transitions).
  useEffect(() => {
    if (!tour.complete) {
      // When `restart()` clears the flag, re-arm the PATCH for the next
      // completion in the same session.
      persistedRef.current = false
      return
    }
    if (persistedRef.current) return
    const user = currentUser.data
    if (!user) return
    persistedRef.current = true
    const ts = new Date().toISOString()
    // Fire-and-forget: errors are swallowed below. localStorage is the
    // on-device source of truth; the server copy is best-effort and
    // self-heals on the next /me refresh.
    void api
      .patch(`/api/users/${encodeURIComponent(user.id)}`, {
        onboardingCompletedAt: ts,
      })
      .catch((err: unknown) => {
        console.warn('[ipam] failed to persist onboardingCompletedAt', err)
      })
  }, [tour.complete, currentUser.data])

  // === Anchor resolution per step ==========================================
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  const waitForRoute = useCallback((pathname: string) => {
    if (router.state.resolvedLocation?.pathname === pathname) {
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      const unsubscribe = router.subscribe('onResolved', ({ toLocation }) => {
        if (toLocation.pathname !== pathname) return
        unsubscribe()
        resolve()
      })
    })
  }, [router])

  useEffect(() => {
    if (!tour.isActive) {
      setAnchor(null)
      return
    }

    const current = TOUR_STEPS[tour.step]
    if (!current) {
      setAnchor(null)
      return
    }

    let cancelled = false

    async function resolveAnchor() {
      try {
        // Navigate first (desktop may already be there; harmless), then
        // wait for the new route to settle so the matching sidebar link is
        // rendered before we attach.
        await router.navigate({ to: current.route })
        await waitForRoute(current.route)
      } catch {
        // Navigation can throw if the route is already active; that's fine.
      }

      // On mobile we want the nav drawer open so the anchor — a sidebar
      // link rendered inside it — is on screen before the popover shows.
      if (isMobile) {
        drawer?.open()
      }

      // Poll briefly for the anchor — the route transition is async and
      // the link element appears after React commits the new tree.
      const deadline = Date.now() + 750
      let found: HTMLElement | null = null
      while (!cancelled && Date.now() < deadline) {
        found = document.querySelector<HTMLElement>(
          `[data-tour="${current.selector}"]`,
        )
        if (found) break
        await new Promise((r) => setTimeout(r, 32))
      }

      if (!cancelled) {
        setAnchor(found)
      }
    }

    void resolveAnchor()

    return () => {
      cancelled = true
    }
  }, [tour.isActive, tour.step, router, waitForRoute, isMobile, drawer])

  // === Handlers passed to TourPopover ======================================
  const handleNext = useCallback(() => {
    tour.next()
  }, [tour])

  const handleSkip = useCallback(() => {
    tour.skip()
  }, [tour])

  const showPopover = tour.isActive

  return (
    <OnboardingContext.Provider value={{ isActive: tour.isActive }}>
      {children}
      {showPopover ? (
        <TourPopover
          step={tour.step}
          anchor={anchor}
          onSkip={handleSkip}
          onNext={handleNext}
        />
      ) : null}
    </OnboardingContext.Provider>
  )
}
