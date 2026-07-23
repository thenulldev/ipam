import { db, type Tx } from './db'
import { changeEvents } from './schema'
import type { ChangeAction, EntityType } from '../lib/types'
import { getActor } from './auth'
import type { Context } from 'hono'

/**
 * Server-derived audit-log emission. The actor and tenant are pulled from
 * the Hono request context (`c.get('actor')`) so callers cannot forge them
 * by stuffing fields into a request body. The Zod schemas in `index.ts` no
 * longer accept `tenantId`/`actorId`/`actorName` from the wire — the only
 * way for `actor.tenantId` to differ from the request body's claimed tenant
 * is to forge the cookie, which the HMAC signature prevents.
 */
export interface EmitChangeInput {
  action: ChangeAction
  entityType: EntityType
  entityId: string
  summary: string
}

/**
 * `target` lets write paths run the audit insert inside the same transaction
 * as the data mutation. Default (`db`) writes immediately, which is fine for
 * single-statement changes but risks orphan audit rows if the surrounding
 * mutation rolls back.
 */
export function emitChange(
  c: Context,
  input: EmitChangeInput,
  target: Tx | typeof db = db,
): void {
  const actor = getActor(c)
  const id = `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  target
    .insert(changeEvents)
    .values({
      id,
      tenantId: actor.tenantId,
      actorId: actor.id,
      actorName: actor.name,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      createdAt: new Date().toISOString(),
    })
    .run()
}
