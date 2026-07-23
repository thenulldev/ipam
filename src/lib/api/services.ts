import type {
  DhcpScope,
  DnsZone,
  RackReservation,
  TenantId,
} from '../types'
import { pick } from './adapter'
import { api } from './http-client'
import * as mock from './_mock/services'

const liveListReservations = (opts?: { tenantId?: TenantId }): Promise<RackReservation[]> =>
  api.get<RackReservation[]>('/api/reservations').then((reservations) =>
    opts?.tenantId
      ? reservations.filter((reservation) => reservation.tenantId === opts.tenantId)
      : reservations,
  )

const liveListDhcpScopes = (opts?: { tenantId?: TenantId }): Promise<DhcpScope[]> =>
  api.get<DhcpScope[]>('/api/dhcp-scopes').then((scopes) =>
    opts?.tenantId ? scopes.filter((scope) => scope.tenantId === opts.tenantId) : scopes,
  )

const liveListDnsZones = (opts?: { tenantId?: TenantId }): Promise<DnsZone[]> =>
  api.get<DnsZone[]>('/api/dns-zones').then((zones) =>
    opts?.tenantId ? zones.filter((zone) => zone.tenantId === opts.tenantId) : zones,
  )

const liveCreateReservation: typeof mock.createReservation = (input) =>
  api.post('/api/reservations', {
    ...input,
    expectedBy: input.expectedBy ?? null,
    reservedById: input.actorId,
  })

const liveDeleteReservation: typeof mock.deleteReservation = async (
  id,
  actorId,
  actorName,
  tenantId,
) => {
  await api.delete(`/api/reservations/${encodeURIComponent(id)}`, {
    actorId,
    actorName,
    tenantId,
  })
}

export const listReservations = pick<typeof mock.listReservations>(
  liveListReservations,
  mock.listReservations,
)
export const listDhcpScopes = pick<typeof mock.listDhcpScopes>(
  liveListDhcpScopes,
  mock.listDhcpScopes,
)
export const listDnsZones = pick<typeof mock.listDnsZones>(
  liveListDnsZones,
  mock.listDnsZones,
)
export const createReservation = pick<typeof mock.createReservation>(
  liveCreateReservation,
  mock.createReservation,
)
export const deleteReservation = pick<typeof mock.deleteReservation>(
  liveDeleteReservation,
  mock.deleteReservation,
)

export type { CreateReservationInput } from './_mock/services'
