import { useEffect } from 'react'
import { useUiStore, isDark } from '@/store/ui-store'

/**
 * Apply the current theme to <html> by toggling the `dark` class. Listens
 * to system preference changes when theme === 'system'. Mount once near the
 * root (e.g. inside AppShell).
 */
export function ThemeApplier() {
  const theme = useUiStore((s) => s.theme)

  useEffect(() => {
    const apply = () => {
      document.documentElement.classList.toggle('dark', isDark(theme))
    }
    apply()
    if (theme !== 'system') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    mql.addEventListener('change', apply)
    return () => mql.removeEventListener('change', apply)
  }, [theme])

  return null
}