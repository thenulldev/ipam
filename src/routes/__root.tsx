import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import { AppShell } from '@/components/layout/app-shell'
import { AuthGuard } from '@/features/auth/route-guard'
import { useMeSync } from '@/store/tenant-store'
import type { QueryClient } from '@tanstack/react-query'

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  useMeSync()

  return (
    <AuthGuard>
      <AppShell>
        <Outlet />
      </AppShell>
    </AuthGuard>
  )
}
