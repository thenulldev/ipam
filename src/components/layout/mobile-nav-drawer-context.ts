/**
 * Cross-component handle to the `MobileNavDrawer` open/close state.
 *
 * `<MobileNavDrawer>` always renders the Radix Dialog UI; consumers (the
 * tour provider, the Topbar burger button, etc.) need a tiny imperative
 * API rather than prop-drilling a boolean. The context exposes:
 *
 *   - `open()`,  `close()`,  `toggle()`,  `set(open)` — fire state changes
 *   - `isOpen` — current boolean (useful for `aria-expanded` on the burger)
 *
 * The provider mounts in `AppShell`; the consumer wraps the drawer itself.
 * Both sides read the same `useState` so a tour-driven open from
 * `OnboardingProvider` flips the actual Radix `Dialog` open state.
 */

import { createContext } from 'react'

export interface MobileNavDrawerApi {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
  set: (open: boolean) => void
}

export const MobileNavDrawerContext = createContext<MobileNavDrawerApi | null>(null)
