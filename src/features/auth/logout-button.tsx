import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'

import { api, ApiError } from '@/lib/api/http-client'
import { Button } from '@/components/ui/button'
import { TOUR_LOGOUT_EVENT } from '@/components/onboarding/use-tour'
import { performLogout, LogoutApiError } from './logout-orchestration'

/**
 * Logout control (NUL-50.2 / NUL-53).
 *
 * POSTs `/api/auth/logout` (server clears the session cookie + returns 204),
 * drops the `['me']` query cache, broadcasts a logout event so feature-local
 * stores (product tour, etc.) can wipe per-user state, then navigates to
 * `/login`. The route guard picks up from there and renders the login form.
 */
export function LogoutButton({ className }: { className?: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)

  async function onClick() {
    if (pending) return
    setPending(true)
    try {
      await performLogout({
        post: async () => {
          try {
            return await api.post<void>('/api/auth/logout')
          } catch (err) {
            // Normalise to a structural `LogoutApiError` so the orchestrator
            // doesn't need to import from `@/lib/api/http-client` (which
            // would pull in the alias graph during tests).
            if (err instanceof ApiError) throw new LogoutApiError(err.status, err.message)
            throw err
          }
        },
        queryClient: {
          removeQueries: (opts) => queryClient.removeQueries(opts),
          invalidateQueries: (opts) => queryClient.invalidateQueries(opts),
        },
        navigateToLogin: () => {
          void navigate({ to: '/login', replace: true })
        },
        onCleared: () => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(TOUR_LOGOUT_EVENT))
          }
        },
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="tap"
      onClick={onClick}
      disabled={pending}
      aria-label="Sign out"
      title="Sign out"
      className={className}
    >
      <LogOut className="size-4" aria-hidden="true" />
      <span className="hidden sm:inline">{pending ? 'Signing out…' : 'Sign out'}</span>
    </Button>
  )
}
