import { db } from './db'
import { changeEvents } from './schema'
import type {
  ChangeAction,
  EntityType,
} from '../lib/types'

export interface EmitChangeInput {
  tenantId: string
  actorId: string
  actorName: string
  action: ChangeAction
  entityType: EntityType
  entityId: string
  summary: string
}

export function emitChange(input: EmitChangeInput): void {
  const id = `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  db.insert(changeEvents)
    .values({
      id,
      tenantId: input.tenantId,
      actorId: input.actorId,
      actorName: input.actorName,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      createdAt: new Date().toISOString(),
    })
    .run()
}
