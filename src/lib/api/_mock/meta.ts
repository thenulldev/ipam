import type {
  ChangeAction,
  ChangeEvent,
  EntityType,
  ImageAttachment,
  Note,
} from '../../types'
import * as db from '../../mock'
import { delay } from '../client'

export async function listNotesForEntity(
  entityType: EntityType,
  entityId: string,
): Promise<Note[]> {
  return delay(
    db.notes.filter((n) => n.entityType === entityType && n.entityId === entityId),
  )
}

export async function listImagesForEntity(
  entityType: EntityType,
  entityId: string,
): Promise<ImageAttachment[]> {
  return delay(
    db.images.filter((i) => i.entityType === entityType && i.entityId === entityId),
  )
}

export async function listChangeEvents(opts?: {
  limit?: number
  tenantId?: string
}): Promise<ChangeEvent[]> {
  let events = db.changeEvents.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  if (opts?.tenantId) events = events.filter((e) => e.tenantId === opts.tenantId)
  if (opts?.limit) events = events.slice(0, opts.limit)
  return delay(events)
}

export async function listChangeEventsForEntity(
  entityType: EntityType,
  entityId: string,
): Promise<ChangeEvent[]> {
  return delay(
    db.changeEvents
      .filter((e) => e.entityType === entityType && e.entityId === entityId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  )
}

// === Mutations ===

let mutationCounter = 0
const nextId = (prefix: string) =>
  `${prefix}-${(++mutationCounter).toString().padStart(6, '0')}`

export async function createNote(input: Omit<Note, 'id' | 'createdAt'>): Promise<Note> {
  const note: Note = {
    ...input,
    id: 'note-' + nextId('note') as Note['id'],
    createdAt: new Date().toISOString(),
  }
  db.notes.push(note)
  await emitChange({
    tenantId: note.tenantId,
    actorId: note.authorId,
    actorName: note.authorName,
    action: 'note',
    entityType: note.entityType,
    entityId: note.entityId,
    summary: `Added a note to ${note.entityType} ${note.entityId}`,
  })
  return delay(note, 40)
}

export async function deleteNote(id: Note['id']): Promise<void> {
  const idx = db.notes.findIndex((n) => n.id === id)
  if (idx >= 0) db.notes.splice(idx, 1)
  return delay(undefined, 40)
}

export async function createImage(
  input: Omit<ImageAttachment, 'id' | 'createdAt'>,
): Promise<ImageAttachment> {
  const image: ImageAttachment = {
    ...input,
    id: 'image-' + nextId('img') as ImageAttachment['id'],
    createdAt: new Date().toISOString(),
  }
  db.images.push(image)
  await emitChange({
    tenantId: image.tenantId,
    actorId: image.authorId,
    actorName: image.authorName,
    action: 'attach',
    entityType: image.entityType,
    entityId: image.entityId,
    summary: `Attached an image to ${image.entityType} ${image.entityId}`,
  })
  return delay(image, 40)
}

export async function deleteImage(id: ImageAttachment['id']): Promise<void> {
  const idx = db.images.findIndex((i) => i.id === id)
  if (idx >= 0) db.images.splice(idx, 1)
  return delay(undefined, 40)
}

interface EmitChangeInput {
  tenantId: Note['tenantId']
  actorId: Note['authorId']
  actorName: Note['authorName']
  action: ChangeAction
  entityType: EntityType
  entityId: string
  summary: string
}

export async function emitChange(input: EmitChangeInput): Promise<ChangeEvent> {
  const event: ChangeEvent = {
    id: 'evt-' + nextId('evt') as ChangeEvent['id'],
    tenantId: input.tenantId,
    actorId: input.actorId,
    actorName: input.actorName,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    createdAt: new Date().toISOString(),
  }
  db.changeEvents.push(event)
  return delay(event, 0)
}


