import type {
  IpAddress,
  Prefix,
  PrefixId,
  Vrf,
} from '../types'
import { pick } from './adapter'
import { api } from './http-client'
import * as mock from './_mock/ipam'

const liveListVrfs = (): Promise<Vrf[]> => api.get('/api/vrfs')
const liveListPrefixes = (): Promise<Prefix[]> => api.get('/api/prefixes')
const liveGetPrefix = (id: PrefixId): Promise<Prefix | undefined> =>
  liveListPrefixes().then((prefixes) => prefixes.find((prefix) => prefix.id === id))
const liveListAddresses = (): Promise<IpAddress[]> => api.get('/api/ip-addresses')
const liveListAddressesByPrefix: typeof mock.listAddressesByPrefix = (prefixId) =>
  liveListAddresses().then((addresses) =>
    addresses.filter((address) => address.prefixId === prefixId),
  )
const liveAssignAddress: typeof mock.assignAddress = (input) =>
  api.post('/api/ip-addresses', input)
const liveUnassignAddress: typeof mock.unassignAddress = async (input) => {
  await api.delete(`/api/ip-addresses/${encodeURIComponent(input.addressId)}`, input)
  const address = (await liveListAddresses()).find((candidate) => candidate.id === input.addressId)
  if (!address) throw new Error('Address not found after unassign')
  return address
}

export const listVrfs = pick<typeof mock.listVrfs>(liveListVrfs, mock.listVrfs)
export const listPrefixes = pick<typeof mock.listPrefixes>(liveListPrefixes, mock.listPrefixes)
export const getPrefix = pick<typeof mock.getPrefix>(liveGetPrefix, mock.getPrefix)
export const listAddresses = pick<typeof mock.listAddresses>(
  liveListAddresses,
  mock.listAddresses,
)
export const listAddressesByPrefix = pick<typeof mock.listAddressesByPrefix>(
  liveListAddressesByPrefix,
  mock.listAddressesByPrefix,
)
export const assignAddress = pick<typeof mock.assignAddress>(
  liveAssignAddress,
  mock.assignAddress,
)
export const unassignAddress = pick<typeof mock.unassignAddress>(
  liveUnassignAddress,
  mock.unassignAddress,
)

export type { AssignAddressInput, UnassignAddressInput } from './_mock/ipam'
