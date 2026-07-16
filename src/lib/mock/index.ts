// Single import surface for the in-memory fixture DB.
// Each domain lives in its own file under /src/lib/mock/.

export { sites, rooms, floorplans } from './locations'
export { racks, devices, ports, cables } from './physical'
export { vrfs, prefixes, addresses } from './ipam'
export { tenants, users } from './tenants'
export { deviceTemplates } from './templates'
export { notes, images, changeEvents } from './meta'
export { vlans } from './vlans'
export { dhcpScopes, dnsZones, rackReservations } from './services'
