import assert from 'node:assert/strict'
import test from 'node:test'

import * as db from '../mock/index.ts'
import type { DeviceId, PortId, RackId, RoomId, SiteId } from '../types.ts'
import {
  getDevice,
  getFloorplan,
  getPort,
  getRack,
  getRoom,
  getSite,
} from './physical'

test('collection-backed entity lookups find records and return undefined for missing IDs', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  const collections = new Map<string, unknown[]>([
    ['/api/sites', db.sites],
    ['/api/rooms', db.rooms],
    ['/api/floorplans', db.floorplans],
    ['/api/racks', db.racks],
    ['/api/devices', db.devices],
    ['/api/ports', db.ports],
  ])
  const requested: string[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    requested.push(url.pathname)
    const collection = collections.get(url.pathname)
    return collection
      ? new Response(JSON.stringify(collection), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      : new Response('', { status: 404 })
  }) as typeof fetch

  const [site, room, floorplan, rack, device, port] = await Promise.all([
    getSite(db.sites[0]!.id),
    getRoom(db.rooms[0]!.id),
    getFloorplan(db.floorplans[0]!.id),
    getRack(db.racks[0]!.id),
    getDevice(db.devices[0]!.id),
    getPort(db.ports[0]!.id),
  ])

  assert.equal(site?.id, db.sites[0]!.id)
  assert.equal(room?.id, db.rooms[0]!.id)
  assert.equal(floorplan?.id, db.floorplans[0]!.id)
  assert.equal(rack?.id, db.racks[0]!.id)
  assert.equal(device?.id, db.devices[0]!.id)
  assert.equal(port?.id, db.ports[0]!.id)

  const missing = await Promise.all([
    getSite('missing' as SiteId),
    getRoom('missing' as RoomId),
    getFloorplan('missing' as (typeof db.floorplans)[number]['id']),
    getRack('missing' as RackId),
    getDevice('missing' as DeviceId),
    getPort('missing' as PortId),
  ])
  assert.deepEqual(missing, [undefined, undefined, undefined, undefined, undefined, undefined])
  assert.deepEqual(new Set(requested), new Set(collections.keys()))
})
