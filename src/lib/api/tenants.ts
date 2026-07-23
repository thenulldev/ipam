import type {
  DeviceTemplate,
  DeviceTemplateId,
  Tenant,
  TenantId,
  User,
  UserId,
  UserRole,
} from '../types'
import { pick } from './adapter'
import { api } from './http-client'
import * as mock from './_mock/tenants'

async function getOrUndefined<T>(path: string): Promise<T | undefined> {
  try {
    return await api.get<T>(path)
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
      return undefined
    }
    throw error
  }
}

const liveListTenants = (): Promise<Tenant[]> => api.get('/api/tenants')
const liveGetTenant = (id: TenantId): Promise<Tenant | undefined> =>
  getOrUndefined(`/api/tenants/${encodeURIComponent(id)}`)

const liveListUsers = (opts?: { tenantId?: TenantId; role?: UserRole }): Promise<User[]> =>
  api.get<User[]>('/api/users').then((users) =>
    users.filter(
      (user) =>
        (!opts?.tenantId || user.tenantId === opts.tenantId) &&
        (!opts?.role || user.role === opts.role),
    ),
  )
const liveGetUser = (id: UserId): Promise<User | undefined> =>
  getOrUndefined(`/api/users/${encodeURIComponent(id)}`)

const liveListDeviceTemplates = (tenantId?: TenantId): Promise<DeviceTemplate[]> =>
  api.get<DeviceTemplate[]>('/api/device-templates').then((templates) => {
    const libraryTenant = 'tenant-library' as TenantId
    const selected = templates.filter(
      (template) =>
        template.tenantId === libraryTenant ||
        (tenantId !== undefined && template.tenantId === tenantId),
    )
    return [...new Map(selected.map((template) => [template.id, template])).values()]
  })
const liveGetDeviceTemplate = (
  id: DeviceTemplateId,
): Promise<DeviceTemplate | undefined> =>
  getOrUndefined(`/api/device-templates/${encodeURIComponent(id)}`)

export const listTenants = pick<typeof mock.listTenants>(liveListTenants, mock.listTenants)
export const getTenant = pick<typeof mock.getTenant>(liveGetTenant, mock.getTenant)
export const listUsers = pick<typeof mock.listUsers>(liveListUsers, mock.listUsers)
export const getUser = pick<typeof mock.getUser>(liveGetUser, mock.getUser)
export const listDeviceTemplates = pick<typeof mock.listDeviceTemplates>(
  liveListDeviceTemplates,
  mock.listDeviceTemplates,
)
export const getDeviceTemplate = pick<typeof mock.getDeviceTemplate>(
  liveGetDeviceTemplate,
  mock.getDeviceTemplate,
)
