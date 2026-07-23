import type {
  IpAddress,
  IpAddressId,
  PortId,
  Prefix,
  PrefixId,
  TenantId,
  UserId,
  Vrf,
} from '../../types'
import * as db from '../../mock'
import { delay } from '../client'
import { emitChange } from './meta'

export async function listVrfs(): Promise<Vrf[]> {
  return delay(db.vrfs)
}

export async function listPrefixes(): Promise<Prefix[]> {
  return delay(db.prefixes)
}

export async function getPrefix(id: PrefixId): Promise<Prefix | undefined> {
  return delay(db.prefixes.find((p) => p.id === id))
}

export async function listAddresses(): Promise<IpAddress[]> {
  return delay(db.addresses)
}

export async function listAddressesByPrefix(
  prefixId: PrefixId,
): Promise<IpAddress[]> {
  return delay(db.addresses.filter((a) => a.prefixId === prefixId))
}

export interface AssignAddressInput {
  tenantId: TenantId
  addressId: IpAddressId
  portId: PortId
  actorId: UserId
  actorName: string
}

export async function assignAddress(input: AssignAddressInput): Promise<IpAddress> {
  const addr = db.addresses.find((a) => a.id === input.addressId)
  if (!addr) throw new Error('Address not found')
  const port = db.ports.find((p) => p.id === input.portId)
  if (!port) throw new Error('Port not found')
  // If the port already has an IP, free it first.
  const previousForPort = db.addresses.find((a) => a.assignedPortId === input.portId)
  if (previousForPort && previousForPort.id !== addr.id) {
    previousForPort.assignedPortId = undefined
    previousForPort.status = 'free'
  }
  // If the address was assigned elsewhere, unassign that port.
  if (addr.assignedPortId && addr.assignedPortId !== input.portId) {
    const prevPort = db.ports.find((p) => p.id === addr.assignedPortId)
    if (prevPort) prevPort.ipAddressId = undefined
  }
  addr.assignedPortId = input.portId
  addr.status = 'assigned'
  addr.lastSeenAt = new Date().toISOString()
  port.ipAddressId = addr.id

  await emitChange({
    tenantId: input.tenantId,
    actorId: input.actorId,
    actorName: input.actorName,
    action: 'update',
    entityType: 'address',
    entityId: addr.id,
    summary: `Assigned ${addr.address} to port ${port.label}`,
  })

  return delay(addr, 40)
}

export interface UnassignAddressInput {
  tenantId: TenantId
  addressId: IpAddressId
  actorId: UserId
  actorName: string
}

export async function unassignAddress(
  input: UnassignAddressInput,
): Promise<IpAddress> {
  const addr = db.addresses.find((a) => a.id === input.addressId)
  if (!addr) throw new Error('Address not found')
  if (addr.assignedPortId) {
    const port = db.ports.find((p) => p.id === addr.assignedPortId)
    if (port) port.ipAddressId = undefined
  }
  addr.assignedPortId = undefined
  addr.status = 'free'

  await emitChange({
    tenantId: input.tenantId,
    actorId: input.actorId,
    actorName: input.actorName,
    action: 'update',
    entityType: 'address',
    entityId: addr.id,
    summary: `Unassigned ${addr.address} (now free)`,
  })

  return delay(addr, 40)
}


