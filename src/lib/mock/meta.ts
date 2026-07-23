import type { ChangeEvent, ImageAttachment, Note } from '../types'
import { id } from './ids'

const day = 24 * 60 * 60 * 1000
const now = Date.now()

export const notes: Note[] = [
  {
    id: id.note('note-0001'),
    tenantId: id.tenant('tenant-internal'),
    authorId: id.user('user-stephan'),
    authorName: 'Stephan Frank',
    body: 'core-sw-01 main power supply replaced last month — verify firmware is on the expected version.',
    createdAt: new Date(now - 3 * day).toISOString(),
    entityType: 'device',
    entityId: 'dev-mdf-core-sw',
  },
  {
    id: id.note('note-0002'),
    tenantId: id.tenant('tenant-internal'),
    authorId: id.user('user-internal-editor'),
    authorName: 'Priya Mehta',
    body: 'Aisle B cooling was upgraded. Racks A1/A2 now run 5°C cooler on average.',
    createdAt: new Date(now - 10 * day).toISOString(),
    entityType: 'rack',
    entityId: 'rack-a1',
  },
  {
    id: id.note('note-0003'),
    tenantId: id.tenant('tenant-internal'),
    authorId: id.user('user-internal-editor'),
    authorName: 'Priya Mehta',
    body: 'mgmt /24 is split 10.0.0.0/25 for clients and 10.0.0.128/25 reserved for OOB switches.',
    createdAt: new Date(now - 14 * day).toISOString(),
    entityType: 'prefix',
    entityId: 'pfx-10-0-0',
  },
  {
    id: id.note('note-0004'),
    tenantId: id.tenant('tenant-customer-a'),
    authorId: id.user('user-acme-admin'),
    authorName: 'Alice Chen',
    body: 'Acme R2 firmware update window: Sundays 02:00-04:00 GMT.',
    createdAt: new Date(now - 2 * day).toISOString(),
    entityType: 'rack',
    entityId: 'rack-acme-2',
  },
]

const placeholderPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

export const images: ImageAttachment[] = [
  {
    id: id.image('image-0001'),
    tenantId: id.tenant('tenant-internal'),
    authorId: id.user('user-internal-editor'),
    authorName: 'Priya Mehta',
    url: placeholderPng,
    caption: 'core-router-01 label (front)',
    createdAt: new Date(now - 5 * day).toISOString(),
    entityType: 'device',
    entityId: 'dev-mdf-core-rtr',
  },
]

export const changeEvents: ChangeEvent[] = [
  {
    id: id.change('evt-0001'),
    tenantId: id.tenant('tenant-internal'),
    actorId: id.user('user-stephan'),
    actorName: 'Stephan Frank',
    action: 'connect',
    entityType: 'cable',
    entityId: 'cable-0001',
    summary: 'Connected cable cable-0001 to dev-mdf-core-rtr port xe-0',
    createdAt: new Date(now - 1 * day).toISOString(),
  },
  {
    id: id.change('evt-0002'),
    tenantId: id.tenant('tenant-internal'),
    actorId: id.user('user-internal-editor'),
    actorName: 'Priya Mehta',
    action: 'note',
    entityType: 'device',
    entityId: 'dev-mdf-core-sw',
    summary: 'Added a note to dev-mdf-core-sw',
    createdAt: new Date(now - 3 * day).toISOString(),
  },
  {
    id: id.change('evt-0003'),
    tenantId: id.tenant('tenant-customer-a'),
    actorId: id.user('user-acme-admin'),
    actorName: 'Alice Chen',
    action: 'create',
    entityType: 'rack',
    entityId: 'rack-acme-2',
    summary: 'Created rack ACME-R2',
    createdAt: new Date(now - 7 * day).toISOString(),
  },
  {
    id: id.change('evt-0004'),
    tenantId: id.tenant('tenant-internal'),
    actorId: id.user('user-stephan'),
    actorName: 'Stephan Frank',
    action: 'place',
    entityType: 'rack',
    entityId: 'rack-a3',
    summary: 'Placed rack MDF-A3 on floorplan fp-mdf',
    createdAt: new Date(now - 8 * day).toISOString(),
  },
  {
    id: id.change('evt-0005'),
    tenantId: id.tenant('tenant-internal'),
    actorId: id.user('user-internal-editor'),
    actorName: 'Priya Mehta',
    action: 'attach',
    entityType: 'device',
    entityId: 'dev-mdf-core-rtr',
    summary: 'Attached 1 image to dev-mdf-core-rtr',
    createdAt: new Date(now - 5 * day).toISOString(),
  },
]
