import type {
  DhcpScope,
  DnsZone,
  RackReservation,
  TenantId,
  UserId,
} from '../types'
import * as db from '../mock'
import { delay } from './client'
import { emitChange } from './meta'

export async function listReservations(opts?: { tenantId?: TenantId }): Promise<RackReservation[]> {
  let all = db.rackReservations
  if (opts?.tenantId) all = all.filter((r) => r.tenantId === opts.tenantId)
  return delay(all)
}

export async function listDhcpScopes(opts?: { tenantId?: TenantId }): Promise<DhcpScope[]> {
  let all = db.dhcpScopes
  if (opts?.tenantId) all = all.filter((d) => d.tenantId === opts.tenantId)
  return delay(all)
}

export async function listDnsZones(opts?: { tenantId?: TenantId }): Promise<DnsZone[]> {
  let all = db.dnsZones
  if (opts?.tenantId) all = all.filter((d) => d.tenantId === opts.tenantId)
  return delay(all)
}

let resCounter = 0
const nextResId = () =>
  ('res-' + (++resCounter).toString().padStart(4, '0')) as RackReservation['id']

export interface CreateReservationInput {
  tenantId: TenantId
  rackId: RackReservation['rackId']
  uStart: number
  uHeight: number
  label: string
  color: string
  expectedBy?: string
  actorId: UserId
  actorName: string
}

export async function createReservation(
  input: CreateReservationInput,
): Promise<RackReservation> {
  const res: RackReservation = {
    id: nextResId(),
    tenantId: input.tenantId,
    rackId: input.rackId,
    uStart: input.uStart,
    uHeight: input.uHeight,
    label: input.label,
    color: input.color,
    reservedById: input.actorId,
    reservedAt: new Date().toISOString(),
    expectedBy: input.expectedBy,
  }
  db.rackReservations.push(res)
  await emitChange({
    tenantId: input.tenantId,
    actorId: input.actorId,
    actorName: input.actorName,
    action: 'create',
    entityType: 'rack',
    entityId: input.rackId,
    summary: `Reserved U${input.uStart}–U${input.uStart + input.uHeight - 1} for "${input.label}"`,
  })
  return delay(res, 40)
}

export async function deleteReservation(
  id: RackReservation['id'],
  actorId: UserId,
  actorName: string,
  tenantId: TenantId,
): Promise<void> {
  const idx = db.rackReservations.findIndex((r) => r.id === id)
  if (idx < 0) return delay(undefined, 30)
  const res = db.rackReservations[idx]!
  db.rackReservations.splice(idx, 1)
  await emitChange({
    tenantId,
    actorId,
    actorName,
    action: 'delete',
    entityType: 'rack',
    entityId: res.rackId,
    summary: `Released reservation "${res.label}"`,
  })
  return delay(undefined, 40)
}