/**
 * Onboarding product-tour state machine (NUL-51.B / NUL-58).
 *
 * Tracks where the user is in the 8-step product tour, persists progress +
 * completion to `localStorage`, and resets everything on logout so the next
 * login sees a clean slate.
 *
 * Storage keys (per NUL-51 plan §4):
 *   ipam:tour-complete:v1        — '1' if the user finished or skipped; absent otherwise
 *   ipam:tour-step:v1            — last-completed step index (stringified int)
 *   ipam:tour-shown-on-login:v1  — session-scoped flag, '1' if the auto-launch already fired this login
 *
 * The hook itself is a thin `useSyncExternalStore` wrapper over `createTourStore`,
 * which is exported separately so tests can drive the state machine without React.
 *
 * Server-side persistent progress is a follow-up (NUL-51.E); v1 is localStorage-only.
 */

import { useSyncExternalStore } from 'react'

export const TOUR_TOTAL_STEPS = 8

export const TOUR_STORAGE_KEYS = {
  complete: 'ipam:tour-complete:v1',
  step: 'ipam:tour-step:v1',
  shownOnLogin: 'ipam:tour-shown-on-login:v1',
} as const

export const TOUR_LOGOUT_EVENT = 'ipam:auth:logout'

/** Minimal localStorage shape — isolated so tests can swap a fake in. */
export interface TourStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Minimal event-target shape so SSR + tests don't need a real `window`. */
export interface TourEventTarget {
  addEventListener(type: 'auth:logout', listener: () => void): void
  removeEventListener(type: 'auth:logout', listener: () => void): void
}

export interface TourState {
  step: number
  total: number
  isActive: boolean
  complete: boolean
}

export interface TourApi extends TourState {
  /** Begin the tour at step 0 (or resume from persisted `step` when present). */
  start(): void
  /** Advance to the next step; completes the tour on the final `next()`. */
  next(): void
  /** Move backward one step; no-op at step 0. */
  prev(): void
  /** Mark the tour complete + persist the flag; does not throw if inactive. */
  skip(): void
  /** Reset step to 0, clear the complete flag, persist both. */
  restart(): void
}

export interface TourStoreOptions {
  totalSteps?: number
  storage?: TourStorage | null
  events?: TourEventTarget | null
  /** 'auth:logout' listener will dispatch `clear()`; can be overridden in tests. */
  logoutEventName?: 'auth:logout'
}

export interface TourStore extends TourApi {
  /** Test-only: subscribe to changes; returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void
  /** Test-only: the current snapshot. */
  getSnapshot(): TourState
  /** Test-only / logout path: wipe keys + return to idle so the next login is fresh. */
  clear(): void
  /** Test-only: tear down the storage/event listeners (used by React unmount). */
  destroy(): void
}

function readNumber(storage: TourStorage | null, key: string): number | null {
  if (!storage) return null
  const raw = storage.getItem(key)
  if (raw === null || raw === '') return null
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function readFlag(storage: TourStorage | null, key: string): boolean {
  if (!storage) return false
  return storage.getItem(key) === '1'
}

function clampStep(step: number, total: number): number {
  if (!Number.isFinite(step) || step < 0) return 0
  if (step >= total) return total - 1
  return Math.floor(step)
}

/**
 * Build a tour state-machine bound to a given storage + event target.
 *
 * If `storage` is `null`, persistence is skipped (useful for SSR and tests
 * that want a clean in-memory run).
 */
export function createTourStore(opts: TourStoreOptions = {}): TourStore {
  const total = opts.totalSteps ?? TOUR_TOTAL_STEPS
  const storage = opts.storage === undefined
    ? (typeof window !== 'undefined' ? window.localStorage : null)
    : opts.storage
  const events = opts.events === undefined
    ? (typeof window !== 'undefined' ? window : null)
    : opts.events
  const logoutEventName = opts.logoutEventName ?? 'auth:logout'

  // We dispatch a CustomEvent when the app wants to log the user out. We bind
  // by string so tests can pass a fake that only listens for 'auth:logout'.
  const logoutListener = () => store.clear()

  let state: TourState = {
    step: readNumber(storage, TOUR_STORAGE_KEYS.step) ?? 0,
    total,
    isActive: false,
    complete: readFlag(storage, TOUR_STORAGE_KEYS.complete),
  }
  state.step = clampStep(state.step, total)

  const listeners = new Set<() => void>()

  const emit = () => {
    for (const l of listeners) l()
  }

  function persistStep(step: number) {
    if (!storage) return
    storage.setItem(TOUR_STORAGE_KEYS.step, String(step))
  }

  function persistComplete(flag: boolean) {
    if (!storage) return
    if (flag) {
      storage.setItem(TOUR_STORAGE_KEYS.complete, '1')
    } else {
      storage.removeItem(TOUR_STORAGE_KEYS.complete)
    }
  }

  function markShownOnLogin() {
    if (!storage) return
    storage.setItem(TOUR_STORAGE_KEYS.shownOnLogin, '1')
  }

  function setState(next: Partial<TourState>) {
    const merged: TourState = { ...state, ...next }
    merged.step = clampStep(merged.step, merged.total)
    if (
      merged.step === state.step &&
      merged.total === state.total &&
      merged.isActive === state.isActive &&
      merged.complete === state.complete
    ) {
      return
    }
    state = merged
    emit()
  }

  const store: TourStore = {
    get step() { return state.step },
    get total() { return state.total },
    get isActive() { return state.isActive },
    get complete() { return state.complete },

    getSnapshot() {
      return state
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    start() {
      // Resume from a persisted mid-tour step instead of resetting; only the
      // explicitly persisted `complete` flag forces a clean run.
      const resumedStep = readNumber(storage, TOUR_STORAGE_KEYS.step)
      const step = state.complete ? 0 : (resumedStep ?? 0)
      markShownOnLogin()
      setState({ step, isActive: true })
    },

    next() {
      if (!state.isActive) return
      const nextStep = state.step + 1
      if (nextStep >= total) {
        // Final step → complete the tour.
        setState({ step: total - 1, isActive: false, complete: true })
        persistStep(total - 1)
        persistComplete(true)
        return
      }
      setState({ step: nextStep })
      persistStep(nextStep)
    },

    prev() {
      if (!state.isActive || state.step === 0) return
      setState({ step: state.step - 1 })
      persistStep(state.step - 1)
    },

    skip() {
      if (!state.isActive && state.complete) return
      setState({ isActive: false, complete: true })
      persistComplete(true)
    },

    restart() {
      setState({ step: 0, isActive: true, complete: false })
      persistStep(0)
      persistComplete(false)
    },

    clear() {
      // Wipe storage and reset to fresh defaults so the next login starts clean.
      if (storage) {
        storage.removeItem(TOUR_STORAGE_KEYS.complete)
        storage.removeItem(TOUR_STORAGE_KEYS.step)
        storage.removeItem(TOUR_STORAGE_KEYS.shownOnLogin)
      }
      // Suppress the re-emit if we're already at the idle, incomplete state —
      // avoids spurious renders while the React tree is being torn down.
      setState({ step: 0, isActive: false, complete: false })
      // Force emit regardless of equality so subscribers reset their refs.
      if (listeners.size > 0) emit()
    },

    destroy() {
      if (events) {
        events.removeEventListener(logoutEventName, logoutListener)
      }
      listeners.clear()
    },
  }

  if (events) {
    events.addEventListener(logoutEventName, logoutListener)
  }

  return store
}

/**
 * Module-level singleton so the whole app shares one tour state machine.
 * Built lazily on first React render to avoid touching `window` during SSR.
 */
let singleton: TourStore | null = null
function getStore(): TourStore {
  if (!singleton) {
    singleton = createTourStore()
  }
  return singleton
}

export function useTour(): TourApi {
  const store = getStore()
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return {
    step: snapshot.step,
    total: snapshot.total,
    isActive: snapshot.isActive,
    complete: snapshot.complete,
    start: store.start,
    next: store.next,
    prev: store.prev,
    skip: store.skip,
    restart: store.restart,
  }
}
