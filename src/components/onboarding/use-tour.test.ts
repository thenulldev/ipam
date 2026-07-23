/**
 * Tests for the product-tour state machine (NUL-51.B / NUL-58).
 *
 * Drives the framework-agnostic `createTourStore` factory so we can pin
 * deterministic behaviour around localStorage + the logout event without
 * pulling in a DOM. The `useTour` React hook is a thin `useSyncExternalStore`
 * wrapper over the same store; the smoke render at the bottom of the file
 * catches shape regressions on the hook side.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

import {
  TOUR_LOGOUT_EVENT,
  TOUR_STORAGE_KEYS,
  TOUR_TOTAL_STEPS,
  createTourStore,
  useTour,
  type TourEventTarget,
  type TourStorage,
} from './use-tour'

// --- Fakes --------------------------------------------------------------------

/** Tiny in-memory localStorage. Mirrors the real one enough for our reads. */
function fakeStorage(): TourStorage & { dump(): Record<string, string> } {
  const map = new Map<string, string>()
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, String(v))
    },
    removeItem: (k) => {
      map.delete(k)
    },
    dump: () => Object.fromEntries(map.entries()),
  }
}

/** Minimal event target — only handles the 'auth:logout' channel. */
function fakeEvents(): TourEventTarget & { fireLogout(): void } {
  const fns = new Set<() => void>()
  return {
    addEventListener: (_t, fn) => {
      fns.add(fn)
    },
    removeEventListener: (_t, fn) => {
      fns.delete(fn)
    },
    fireLogout: () => {
      for (const fn of fns) fn()
    },
  }
}

function newStore(opts: {
  storage?: TourStorage | null
  events?: TourEventTarget | null
  totalSteps?: number
} = {}) {
  return createTourStore({
    storage: opts.storage === undefined ? fakeStorage() : opts.storage,
    events: opts.events === undefined ? fakeEvents() : opts.events,
    totalSteps: opts.totalSteps,
  })
}

// --- Sanity defaults ----------------------------------------------------------

test('exports the expected storage keys + total step count', () => {
  assert.equal(TOUR_TOTAL_STEPS, 8)
  assert.equal(TOUR_STORAGE_KEYS.complete, 'ipam:tour-complete:v1')
  assert.equal(TOUR_STORAGE_KEYS.step, 'ipam:tour-step:v1')
  assert.equal(TOUR_STORAGE_KEYS.shownOnLogin, 'ipam:tour-shown-on-login:v1')
  assert.equal(TOUR_LOGOUT_EVENT, 'ipam:auth:logout')
})

test('starts inactive with complete=false when storage is empty', () => {
  const store = newStore()
  const snap = store.getSnapshot()
  assert.equal(snap.isActive, false)
  assert.equal(snap.complete, false)
  assert.equal(snap.step, 0)
  assert.equal(snap.total, TOUR_TOTAL_STEPS)
  store.destroy()
})

test('starts inactive when storage is null (SSR safety)', () => {
  const store = createTourStore({ storage: null, events: null })
  assert.equal(store.getSnapshot().isActive, false)
  store.destroy()
})

// --- Required scenario 1: state transitions -----------------------------------
// "start -> next -> next -> skip -> isActive=false"

test('start -> next -> next -> skip returns to inactive', () => {
  const store = newStore()
  let emissions = 0
  store.subscribe(() => {
    emissions += 1
  })

  store.start()
  assert.equal(store.isActive, true)
  assert.equal(store.step, 0)

  store.next()
  assert.equal(store.step, 1)

  store.next()
  assert.equal(store.step, 2)

  store.skip()
  assert.equal(store.isActive, false)
  assert.equal(store.complete, true)
  assert.ok(emissions > 0, 'subscribers should be notified on transitions')
  store.destroy()
})

// --- Required scenario 2: localStorage persistence ----------------------------
// "write complete flag, new hook instance reads it as done"

test('a stored complete flag is picked up by a new store instance', () => {
  const storage = fakeStorage()
  storage.setItem(TOUR_STORAGE_KEYS.complete, '1')

  const store = newStore({ storage })
  const snap = store.getSnapshot()
  assert.equal(snap.complete, true)
  assert.equal(snap.isActive, false)
  store.destroy()
})

// --- Required scenario 3: resume from persisted step --------------------------
// "write step=3, new instance starts at step 4"

test('a stored step index is picked up by a new store', () => {
  const storage = fakeStorage()
  storage.setItem(TOUR_STORAGE_KEYS.step, '3')

  const store = newStore({ storage })
  assert.equal(store.getSnapshot().step, 3)
  // start() should *resume* from 3, not reset.
  store.start()
  assert.equal(store.step, 3)
  assert.equal(store.isActive, true)
  store.destroy()
})

// --- Required scenario 4: restart resets step + clears complete --------------

test('restart resets step to 0 and clears the complete flag', () => {
  const storage = fakeStorage()
  storage.setItem(TOUR_STORAGE_KEYS.complete, '1')
  storage.setItem(TOUR_STORAGE_KEYS.step, '5')

  const store = newStore({ storage })
  assert.equal(store.complete, true)
  store.restart()
  assert.equal(store.step, 0)
  assert.equal(store.complete, false)
  assert.equal(storage.getItem(TOUR_STORAGE_KEYS.complete), null)
  assert.equal(storage.getItem(TOUR_STORAGE_KEYS.step), '0')
  store.destroy()
})

// --- Required scenario 5: logout event clears all three keys -----------------

test('logout event clears every tour key and resets state', () => {
  const storage = fakeStorage()
  const events = fakeEvents()
  storage.setItem(TOUR_STORAGE_KEYS.complete, '1')
  storage.setItem(TOUR_STORAGE_KEYS.step, '4')
  storage.setItem(TOUR_STORAGE_KEYS.shownOnLogin, '1')

  const store = newStore({ storage, events })
  // Simulate the user mid-tour so we can see the snap move.
  store.start()
  assert.equal(store.isActive, true)

  events.fireLogout()

  assert.equal(storage.getItem(TOUR_STORAGE_KEYS.complete), null)
  assert.equal(storage.getItem(TOUR_STORAGE_KEYS.step), null)
  assert.equal(storage.getItem(TOUR_STORAGE_KEYS.shownOnLogin), null)
  const snap = store.getSnapshot()
  assert.equal(snap.isActive, false)
  assert.equal(snap.complete, false)
  assert.equal(snap.step, 0)
  store.destroy()
})

// --- Regression: prev() never goes below zero ---------------------------------

test('prev() at step 0 is a no-op', () => {
  const store = newStore()
  store.start()
  assert.equal(store.step, 0)
  store.prev()
  assert.equal(store.step, 0)
  assert.equal(store.isActive, true)
  store.destroy()
})

// --- Regression: stepping past the end marks the tour complete ----------------

test('final next() completes the tour and writes the last step', () => {
  const storage = fakeStorage()
  const store = newStore({ storage, totalSteps: 3 })
  store.start()
  store.next() // step 0 → 1
  store.next() // step 1 → 2 (last)
  store.next() // step 2 → complete

  assert.equal(store.isActive, false)
  assert.equal(store.complete, true)
  assert.equal(store.getSnapshot().step, 2)
  assert.equal(storage.getItem(TOUR_STORAGE_KEYS.complete), '1')
  store.destroy()
})

// --- Regression: persisted step is clamped to total --------------------------

test('persisted step beyond total is clamped on store construction', () => {
  const storage = fakeStorage()
  storage.setItem(TOUR_STORAGE_KEYS.step, '999')

  const store = newStore({ storage, totalSteps: 4 })
  assert.equal(store.getSnapshot().step, 3) // 4 - 1
  store.destroy()
})

// --- Regression: negative / non-numeric persisted step falls back to 0 -------

test('negative stored step falls back to 0 on construction', () => {
  const storage = fakeStorage()
  storage.setItem(TOUR_STORAGE_KEYS.step, '-7')

  const store = newStore({ storage })
  assert.equal(store.getSnapshot().step, 0)
  store.destroy()
})

test('non-numeric stored step falls back to 0 on construction', () => {
  const storage = fakeStorage()
  storage.setItem(TOUR_STORAGE_KEYS.step, 'banana')

  const store = newStore({ storage })
  assert.equal(store.getSnapshot().step, 0)
  store.destroy()
})

// --- Regression: skip() while inactive still records completion --------------

test('skip() without an active tour writes the complete flag', () => {
  const storage = fakeStorage()
  const store = newStore({ storage })
  assert.equal(store.isActive, false)
  store.skip()
  assert.equal(storage.getItem(TOUR_STORAGE_KEYS.complete), '1')
  store.destroy()
})

// --- Regression: start() marks the "shown on login" flag ---------------------

test('start() writes the shown-on-login flag once', () => {
  const storage = fakeStorage()
  const store = newStore({ storage })
  store.start()
  assert.equal(storage.getItem(TOUR_STORAGE_KEYS.shownOnLogin), '1')
  store.destroy()
})

// --- Regression: destroy() detaches the logout listener ----------------------

test('destroy() removes the logout listener so a later fire is a no-op', () => {
  const storage = fakeStorage()
  const events = fakeEvents()
  const store = newStore({ storage, events })
  storage.setItem(TOUR_STORAGE_KEYS.step, '6')
  store.destroy()
  storage.setItem(TOUR_STORAGE_KEYS.step, '7') // would be wiped if listener still attached
  events.fireLogout()
  assert.equal(storage.getItem(TOUR_STORAGE_KEYS.step), '7')
})

// --- React hook smoke render (parity with use-media-query.test.ts) -----------

test('useTour() returns the expected shape during SSR with empty storage', () => {
  // No window.matchMedia needed: useTour just reads the store snapshot.
  function Harness() {
    const tour = useTour()
    return createElement(
      'div',
      null,
      `step=${tour.step};total=${tour.total};active=${tour.isActive ? 1 : 0};complete=${tour.complete ? 1 : 0}`,
    )
  }

  // Render with no window — useTour's store construction needs to be SSR-safe
  // because the singleton is built lazily inside the hook body.
  const originalWindow = (globalThis as { window?: unknown }).window
  Reflect.deleteProperty(globalThis as object, 'window')

  try {
    const html = renderToString(createElement(Harness))
    assert.match(html, /step=0/)
    assert.match(html, /total=8/)
    assert.match(html, /active=0/)
    assert.match(html, /complete=0/)
  } finally {
    if (originalWindow !== undefined) {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
  }
})
