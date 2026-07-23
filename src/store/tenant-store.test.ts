import assert from 'node:assert/strict'
import test from 'node:test'
import { QueryClient } from '@tanstack/react-query'

import type { CurrentUser } from '@/features/auth/use-current-user'
import {
  subscribeMeToTenantStore,
  useTenantStore,
} from './tenant-store'
import type { TenantId, UserId } from '@/lib/types'

const firstUser: CurrentUser = {
  id: 'session-viewer',
  tenantId: 'tenant-a',
  email: 'viewer@example.test',
  role: 'viewer',
}

const secondUser: CurrentUser = {
  id: 'session-editor',
  tenantId: 'tenant-b',
  email: 'editor@example.test',
  role: 'editor',
}

test('the tenant-store mirrors the current me query and every later cache change', () => {
  const queryClient = new QueryClient()
  useTenantStore.setState({
    currentTenantId: 'initial-tenant' as TenantId,
    currentUserId: 'initial-user' as UserId,
  })
  queryClient.setQueryData(['me'], firstUser)

  const unsubscribe = subscribeMeToTenantStore(queryClient)

  assert.equal(useTenantStore.getState().currentTenantId, firstUser.tenantId)
  assert.equal(useTenantStore.getState().currentUserId, firstUser.id)

  queryClient.setQueryData(['me'], secondUser)

  assert.equal(useTenantStore.getState().currentTenantId, secondUser.tenantId)
  assert.equal(useTenantStore.getState().currentUserId, secondUser.id)

  unsubscribe()
  queryClient.setQueryData(['me'], firstUser)
  assert.equal(useTenantStore.getState().currentUserId, secondUser.id)
})
