import type { Tenant, User } from '../types'
import { id } from './ids'

export const tenants: Tenant[] = [
  {
    id: id.tenant('tenant-internal'),
    name: 'Internal — HQ',
    slug: 'internal',
    description: 'Our own corporate infrastructure',
    brandColor: '#3b82f6',
    createdAt: '2024-01-15T09:00:00Z',
  },
  {
    id: id.tenant('tenant-customer-a'),
    name: 'Acme Corp',
    slug: 'acme',
    description: 'Managed services for Acme Corp',
    brandColor: '#10b981',
    createdAt: '2024-08-02T12:30:00Z',
  },
  {
    id: id.tenant('tenant-library'),
    name: 'Device Library',
    slug: 'library',
    description: 'Shared device template library',
    brandColor: '#a855f7',
    createdAt: '2024-01-01T00:00:00Z',
  },
]

export const users: User[] = [
  // Internal — HQ
  {
    id: id.user('user-internal-admin'),
    tenantId: id.tenant('tenant-internal'),
    name: 'Stephan Frank',
    email: 'stephan@internal.example',
    role: 'admin',
    avatarColor: '#3b82f6',
  },
  {
    id: id.user('user-internal-editor'),
    tenantId: id.tenant('tenant-internal'),
    name: 'Priya Mehta',
    email: 'priya@internal.example',
    role: 'editor',
    avatarColor: '#0ea5e9',
  },
  {
    id: id.user('user-internal-viewer'),
    tenantId: id.tenant('tenant-internal'),
    name: 'Jordan Lee',
    email: 'jordan@internal.example',
    role: 'viewer',
    avatarColor: '#64748b',
  },
  // Customer A
  {
    id: id.user('user-acme-admin'),
    tenantId: id.tenant('tenant-customer-a'),
    name: 'Alice Chen',
    email: 'alice@acme.example',
    role: 'admin',
    avatarColor: '#10b981',
  },
  // Library
  {
    id: id.user('user-library-bot'),
    tenantId: id.tenant('tenant-library'),
    name: 'Library Bot',
    email: 'library@example',
    role: 'admin',
    avatarColor: '#a855f7',
  },
]
