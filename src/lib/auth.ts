import type { User, UserRole } from '@/lib/types'

/**
 * Returns whether the current user (selected in tenant-store) can perform
 * write/admin actions. Viewers cannot mutate.
 */
export function canWrite(role: UserRole): boolean {
  return role === 'admin' || role === 'editor'
}

export function canAdmin(role: UserRole): boolean {
  return role === 'admin'
}

/** Convenience guards used throughout feature code. */
export const RoleGate = {
  canWrite,
  canAdmin,
} as const

export function avatarInitials(user: Pick<User, 'name'>): string {
  return user.name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
