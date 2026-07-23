import type { TenantId, Vlan } from '../types'
import { pick } from './adapter'
import { api } from './http-client'
import * as mock from './_mock/vlans'

const liveListVlans = (opts?: { tenantId?: TenantId }): Promise<Vlan[]> =>
  api.get<Vlan[]>('/api/vlans').then((vlans) =>
    opts?.tenantId ? vlans.filter((vlan) => vlan.tenantId === opts.tenantId) : vlans,
  )

export const listVlans = pick<typeof mock.listVlans>(liveListVlans, mock.listVlans)
