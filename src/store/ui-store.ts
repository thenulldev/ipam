import { create } from 'zustand'

export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'ipam.theme'

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  return 'system'
}

interface UiState {
  theme: Theme
  sidebarOpen: boolean
  setTheme: (t: Theme) => void
  toggleSidebar: () => void
}

export const useUiStore = create<UiState>((set) => ({
  theme: readStoredTheme(),
  sidebarOpen: true,
  setTheme: (theme) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, theme)
    }
    set({ theme })
  },
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}))

// Pure function: returns whether dark mode should be applied given a theme.
export function isDark(theme: Theme): boolean {
  if (typeof window === 'undefined') return false
  if (theme === 'dark') return true
  if (theme === 'light') return false
  // system
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}