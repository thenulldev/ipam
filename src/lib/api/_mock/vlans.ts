import type { TenantId, Vlan } from '../../types'
import * as db from '../../mock'
import { delay } from '../client'

export async function listVlans(opts?: { tenantId?: TenantId }): Promise<Vlan[]> {
  let all = db.vlans
  if (opts?.tenantId) all = all.filter((v) => v.tenantId === opts.tenantId)
  return delay(all)
}

