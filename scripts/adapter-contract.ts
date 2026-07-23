import assert from 'node:assert/strict'
import type { Vlan } from '../src/lib/types'
import { listVlans } from '../src/lib/api/vlans'

const liveVlan = {
  id: 'vlan-live',
  tenantId: 'tenant-internal',
  vid: 4094,
  name: 'Live API VLAN',
  description: 'Returned by the HTTP adapter contract test',
} as Vlan

const requests: Array<{ url: string; method: string }> = []
const originalFetch = globalThis.fetch

globalThis.fetch = async (input, init) => {
  requests.push({
    url: input instanceof Request ? input.url : String(input),
    method: init?.method ?? (input instanceof Request ? input.method : 'GET'),
  })
  return new Response(JSON.stringify([liveVlan]), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

try {
  const vlans = await listVlans({ tenantId: liveVlan.tenantId })
  assert.deepEqual(vlans, [liveVlan])
  assert.deepEqual(requests, [
    { url: 'http://localhost:8787/api/vlans', method: 'GET' },
  ])
  console.log('ADAPTER CONTRACT: OK')
} finally {
  globalThis.fetch = originalFetch
}
