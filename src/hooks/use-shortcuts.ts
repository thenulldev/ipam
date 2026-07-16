import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'

/** Global keyboard shortcuts. The hook attaches a single `keydown` listener
 * on `window` and exposes a `useShortcutHint` flag the UI can use to render
 * "press ?" indicators.
 *
 * Supported chords:
 *   - g then i → /ipam
 *   - g then r → /racks
 *   - g then f → /floorplan
 *   - g then t → /templates
 *   - g then s → /settings
 *   - g then d → /
 *   - ? → help dialog (calls `onHelp` callback)
 *   - / → focus the command palette input
 *   - Esc → cancel current chord
 */

const CHORD_TIMEOUT_MS = 900

export interface ShortcutsApi {
  /** True if a chord is awaiting a second key (e.g. user pressed `g`). */
  awaitingChord: boolean
}

export interface ShortcutsOptions {
  onHelp: () => void
  onFocusSearch?: () => void
}

export function useShortcuts(opts: ShortcutsOptions): ShortcutsApi {
  const navigate = useNavigate()
  const [awaitingChord, setAwaitingChord] = useState(false)

  useEffect(() => {
    let chordTimer: ReturnType<typeof setTimeout> | null = null
    const clearChord = () => {
      if (chordTimer) {
        clearTimeout(chordTimer)
        chordTimer = null
      }
      setAwaitingChord(false)
    }

    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in inputs/textareas/contenteditable
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }

      // Modifiers shouldn't trigger shortcuts (except Shift+? for help)
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === 'Escape') {
        clearChord()
        return
      }

      if (awaitingChord) {
        const chordMap: Record<string, () => void> = {
          i: () => navigate({ to: '/ipam' }),
          r: () => navigate({ to: '/racks' }),
          f: () => navigate({ to: '/floorplan' }),
          t: () => navigate({ to: '/templates' }),
          s: () => navigate({ to: '/settings' }),
          d: () => navigate({ to: '/' }),
        }
        const action = chordMap[e.key.toLowerCase()]
        if (action) {
          e.preventDefault()
          action()
        }
        clearChord()
        return
      }

      if (e.key === 'g') {
        e.preventDefault()
        setAwaitingChord(true)
        chordTimer = setTimeout(() => {
          setAwaitingChord(false)
        }, CHORD_TIMEOUT_MS)
        return
      }

      if (e.key === '?') {
        e.preventDefault()
        opts.onHelp()
        return
      }

      if (e.key === '/') {
        e.preventDefault()
        opts.onFocusSearch?.()
        return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearChord()
    }
  }, [navigate, opts])

  return { awaitingChord }
}

export const SHORTCUT_LIST: Array<{
  keys: string[]
  description: string
}> = [
  { keys: ['g', 'i'], description: 'Go to IPAM' },
  { keys: ['g', 'r'], description: 'Go to Racks' },
  { keys: ['g', 'f'], description: 'Go to Floorplan' },
  { keys: ['g', 't'], description: 'Go to Templates' },
  { keys: ['g', 's'], description: 'Go to Settings' },
  { keys: ['g', 'd'], description: 'Go to Dashboard' },
  { keys: ['⌘', 'K'], description: 'Open command palette' },
  { keys: ['/'], description: 'Focus command palette search' },
  { keys: ['?'], description: 'Show this help' },
  { keys: ['Esc'], description: 'Close dialogs' },
]