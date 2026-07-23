const paths = [
  'GET /api/vlans',
  'GET /api/vrfs',
  'GET /api/prefixes',
  'GET /api/ip-addresses',
  'GET /api/tenants',
  'GET /api/users',
  'GET /api/sites',
  'GET /api/rooms',
  'GET /api/floorplans',
  'GET /api/racks',
  'GET /api/devices',
  'GET /api/ports',
  'GET /api/cables',
  'GET /api/notes',
  'GET /api/images',
  'GET /api/change-events',
  'GET /api/reservations',
  'GET /api/dhcp-scopes',
  'GET /api/dns-zones',
  'GET /api/device-templates',
  'GET /api/sites/site-1',
  'GET /api/rooms/room-1',
  'GET /api/floorplans/fp-1',
  'GET /api/racks/rack-1',
  'GET /api/devices/dev-1',
  'GET /api/ports/port-1',
  'GET /api/cables/cable-1',
  'GET /api/tenants/tenant-internal',
  'GET /api/users/user-1',
  'GET /api/device-templates/dpl-core-router',
]
const results = await Promise.all(
  paths.map(async (p) => {
    const [m, path] = p.split(' ')
    try {
      const r = await fetch('http://localhost:8787' + path, { method: m })
      const text = await r.text()
      const preview =
        text.length > 60 ? `[${text.length}B]` : text.slice(0, 60).replace(/\n/g, ' ')
      return `${r.status} ${p.padEnd(38)} ${preview}`
    } catch (e) {
      return `ERR  ${p} ${(e as Error).message}`
    }
  }),
)
for (const r of results) console.log(r)
const missing = results.filter((r) => r.startsWith('404'))
console.log(`\n${missing.length} missing of ${results.length}`)