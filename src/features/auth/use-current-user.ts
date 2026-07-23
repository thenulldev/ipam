import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { api } from '@/lib/api/http-client'

/**
 * The shape returned by `GET /api/auth/me`. Kept narrow on purpose — only the
 * fields the rest of the app currently relies on. Extend as the auth surface
 * grows (the route guard in NUL-50.2 reads `role`; tenant-store refactor in
 * NUL-50.3 reads the same).
 *
 * `onboardingCompletedAt` (NUL-51.E / NUL-59) is the server-side tour-completion
 * timestamp. `null` means "never completed". `OnboardingProvider` consults
 * this value (in addition to the localStorage flag) when deciding whether to
 * auto-launch the tour, and writes back through `PATCH /api/users/:id` when
 * the user finishes or skips.
 */
export interface CurrentUser {
  id: string
  tenantId: string
  email: string
  name?: string
  role: 'admin' | 'editor' | 'viewer' | string
  /**
   * ISO 8601 timestamp the user finished/skipped the NUL-51 product tour,
   * sourced from `users.onboarding_completed_at`. Optional on the type so
   * legacy callers and test stubs that pre-date NUL-59 don't need to set it;
   * `OnboardingProvider` treats `undefined` the same as `null`.
   */
  onboardingCompletedAt?: string | null
}

/**
 * Hook backing the route guard and the post-login `queryClient.getQueryData(['me'])`
 * reads used elsewhere. Invalidated on successful login (see `login-page.tsx`).
 */
export function useCurrentUser(): UseQueryResult<CurrentUser, Error> {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<CurrentUser>('/api/auth/me'),
    staleTime: 60_000,
    retry: (failureCount, error) => {
      // Don't retry 401s — they mean "not logged in", and retrying won't help.
      const status = (error as { status?: number } | null)?.status
      if (status === 401 || status === 403) return false
      return failureCount < 1
    },
  })
}
