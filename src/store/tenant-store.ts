import { useEffect } from 'react'
import {
  hashKey,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { create } from 'zustand'
import type { CurrentUser } from '@/features/auth/use-current-user'
import type { TenantId, UserId } from '@/lib/types'

const meQueryKey = ['me'] as const
const meQueryHash = hashKey(meQueryKey)

interface TenantState {
  currentTenantId: TenantId
  currentUserId: UserId
  setTenant: (id: TenantId) => void
  setUser: (id: UserId) => void
}

export const useTenantStore = create<TenantState>((set) => ({
  currentTenantId: '' as TenantId,
  currentUserId: '' as UserId,
  setTenant: (currentTenantId) => set({ currentTenantId }),
  setUser: (currentUserId) => set({ currentUserId }),
}))

function syncMeToTenantStore(queryClient: QueryClient) {
  const me = queryClient.getQueryData<CurrentUser>(meQueryKey)
  useTenantStore.setState({
    currentTenantId: (me?.tenantId ?? '') as TenantId,
    currentUserId: (me?.id ?? '') as UserId,
  })
}

export function subscribeMeToTenantStore(queryClient: QueryClient) {
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.query.queryHash === meQueryHash) {
      syncMeToTenantStore(queryClient)
    }
  })

  syncMeToTenantStore(queryClient)
  return unsubscribe
}

export function useMeSync() {
  const queryClient = useQueryClient()

  useEffect(
    () => subscribeMeToTenantStore(queryClient),
    [queryClient],
  )
}
