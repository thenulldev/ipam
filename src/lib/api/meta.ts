import type {
  ChangeEvent,
  EntityType,
  ImageAttachment,
  Note,
} from '../types'
import { pick } from './adapter'
import { api } from './http-client'
import * as mock from './_mock/meta'

const liveListNotesForEntity = (entityType: EntityType, entityId: string): Promise<Note[]> =>
  api.get<Note[]>('/api/notes').then((notes) =>
    notes.filter((note) => note.entityType === entityType && note.entityId === entityId),
  )
const liveListImagesForEntity = (
  entityType: EntityType,
  entityId: string,
): Promise<ImageAttachment[]> =>
  api.get<ImageAttachment[]>('/api/images').then((images) =>
    images.filter((image) => image.entityType === entityType && image.entityId === entityId),
  )
const liveListChangeEvents: typeof mock.listChangeEvents = (opts) =>
  api.get<ChangeEvent[]>('/api/change-events').then((events) => {
    let selected = events
      .slice()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    if (opts?.tenantId) {
      selected = selected.filter((event) => event.tenantId === opts.tenantId)
    }
    return opts?.limit ? selected.slice(0, opts.limit) : selected
  })
const liveListChangeEventsForEntity: typeof mock.listChangeEventsForEntity = (
  entityType,
  entityId,
) =>
  liveListChangeEvents().then((events) =>
    events.filter((event) => event.entityType === entityType && event.entityId === entityId),
  )
const liveCreateNote: typeof mock.createNote = (input) => api.post('/api/notes', input)
const liveDeleteNote: typeof mock.deleteNote = async (id) => {
  await api.delete(`/api/notes/${encodeURIComponent(id)}`)
}
const liveCreateImage: typeof mock.createImage = (input) => api.post('/api/images', input)
const liveDeleteImage: typeof mock.deleteImage = async (id) => {
  await api.delete(`/api/images/${encodeURIComponent(id)}`)
}
const liveEmitChange: typeof mock.emitChange = (input) =>
  api.post('/api/change-events', input)

export const listNotesForEntity = pick<typeof mock.listNotesForEntity>(
  liveListNotesForEntity,
  mock.listNotesForEntity,
)
export const listImagesForEntity = pick<typeof mock.listImagesForEntity>(
  liveListImagesForEntity,
  mock.listImagesForEntity,
)
export const listChangeEvents = pick<typeof mock.listChangeEvents>(
  liveListChangeEvents,
  mock.listChangeEvents,
)
export const listChangeEventsForEntity = pick<typeof mock.listChangeEventsForEntity>(
  liveListChangeEventsForEntity,
  mock.listChangeEventsForEntity,
)
export const createNote = pick<typeof mock.createNote>(liveCreateNote, mock.createNote)
export const deleteNote = pick<typeof mock.deleteNote>(liveDeleteNote, mock.deleteNote)
export const createImage = pick<typeof mock.createImage>(liveCreateImage, mock.createImage)
export const deleteImage = pick<typeof mock.deleteImage>(liveDeleteImage, mock.deleteImage)
export const emitChange = pick<typeof mock.emitChange>(liveEmitChange, mock.emitChange)
