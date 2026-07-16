import type {
  DeviceTemplate,
  DeviceTemplateId,
  Tenant,
  TenantId,
  User,
  UserId,
  UserRole,
} from '../types'
import * as db from '../mock'
import { delay } from './client'

export async function listTenants(): Promise<Tenant[]> {
  return delay(db.tenants)
}

export async function getTenant(id: TenantId): Promise<Tenant | undefined> {
  return delay(db.tenants.find((t) => t.id === id))
}

export async function listUsers(opts?: { tenantId?: TenantId; role?: UserRole }): Promise<User[]> {
  return delay(
    db.users.filter(
      (u) =>
        (!opts?.tenantId || u.tenantId === opts.tenantId) &&
        (!opts?.role || u.role === opts.role),
    ),
  )
}

export async function getUser(id: UserId): Promise<User | undefined> {
  return delay(db.users.find((u) => u.id === id))
}

// Library templates are merged with tenant-specific templates.
export async function listDeviceTemplates(
  tenantId?: TenantId,
): Promise<DeviceTemplate[]> {
  const library = db.deviceTemplates.filter(
    (t) => t.tenantId === ('tenant-library' as TenantId),
  )
  const own = tenantId
    ? db.deviceTemplates.filter((t) => t.tenantId === tenantId)
    : []
  // Deduplicate by id (favor own over library)
  const seen = new Set<string>()
  const merged: DeviceTemplate[] = []
  for (const t of [...own, ...library]) {
    if (!seen.has(t.id)) {
      seen.add(t.id)
      merged.push(t)
    }
  }
  return delay(merged)
}

export async function getDeviceTemplate(
  id: DeviceTemplateId,
): Promise<DeviceTemplate | undefined> {
  return delay(db.deviceTemplates.find((t) => t.id === id))
}
