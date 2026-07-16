import { create } from 'zustand'
import type { TenantId, UserId } from '@/lib/types'

interface TenantState {
  currentTenantId: TenantId
  currentUserId: UserId
  setTenant: (id: TenantId) => void
  setUser: (id: UserId) => void
}

export const useTenantStore = create<TenantState>((set) => ({
  currentTenantId: 'tenant-internal' as TenantId,
  currentUserId: 'user-internal-admin' as UserId,
  setTenant: (currentTenantId) => set({ currentTenantId }),
  setUser: (currentUserId) => set({ currentUserId }),
}))
