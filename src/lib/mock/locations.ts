import type { Floorplan, Room, Site } from '../types'
import { id } from './ids'

const T_INTERNAL = id.tenant('tenant-internal')
const T_ACME = id.tenant('tenant-customer-a')

export const sites: Site[] = [
  {
    id: id.site('site-hq'),
    tenantId: T_INTERNAL,
    name: 'HQ Data Center',
    address: '410 Townsend St, San Francisco, CA',
    rooms: [id.room('room-mdf'), id.room('room-idf-a')],
    tags: ['primary', 'tier-3'],
  },
  {
    id: id.site('site-acme'),
    tenantId: T_ACME,
    name: 'Acme — Primary DC',
    address: '88 Brick Lane, London, UK',
    rooms: [id.room('room-acme-mdf')],
    tags: ['customer-acme'],
  },
]

export const rooms: Room[] = [
  {
    id: id.room('room-mdf'),
    tenantId: T_INTERNAL,
    siteId: id.site('site-hq'),
    name: 'MDF',
    floorplanId: id.floorplan('fp-mdf'),
    tags: [],
  },
  {
    id: id.room('room-idf-a'),
    tenantId: T_INTERNAL,
    siteId: id.site('site-hq'),
    name: 'IDF — 2nd Floor',
    floorplanId: id.floorplan('fp-idf-a'),
    tags: [],
  },
  {
    id: id.room('room-acme-mdf'),
    tenantId: T_ACME,
    siteId: id.site('site-acme'),
    name: 'Acme MDF',
    floorplanId: id.floorplan('fp-acme'),
    tags: [],
  },
]

export const floorplans: Floorplan[] = [
  {
    id: id.floorplan('fp-mdf'),
    tenantId: T_INTERNAL,
    roomId: id.room('room-mdf'),
    name: 'MDF Floor Plan',
    width: 1600,
    height: 1000,
    imageUrl: floorplanSvg('HQ MDF', 1600, 1000),
    rackPositions: [
      { rackId: id.rack('rack-a1'), x: 180, y: 120, rotation: 0 },
      { rackId: id.rack('rack-a2'), x: 320, y: 120, rotation: 0 },
      { rackId: id.rack('rack-a3'), x: 460, y: 120, rotation: 0 },
    ],
  },
  {
    id: id.floorplan('fp-idf-a'),
    tenantId: T_INTERNAL,
    roomId: id.room('room-idf-a'),
    name: 'IDF-A Floor Plan',
    width: 1200,
    height: 800,
    imageUrl: floorplanSvg('IDF-A', 1200, 800),
    rackPositions: [
      { rackId: id.rack('rack-b1'), x: 200, y: 100, rotation: 0 },
      { rackId: id.rack('rack-b2'), x: 380, y: 100, rotation: 0 },
    ],
  },
  {
    id: id.floorplan('fp-acme'),
    tenantId: T_ACME,
    roomId: id.room('room-acme-mdf'),
    name: 'Acme — London DC',
    width: 1400,
    height: 900,
    imageUrl: floorplanSvg('Acme London', 1400, 900),
    rackPositions: [
      { rackId: id.rack('rack-acme-1'), x: 240, y: 160, rotation: 0 },
      { rackId: id.rack('rack-acme-2'), x: 380, y: 160, rotation: 0 },
    ],
  },
]

// Inline SVG floor plan generator — gives a schematic background without
// needing external image assets.
function floorplanSvg(label: string, w: number, h: number): string {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#f8fafc" />
  <g stroke="#cbd5e1" stroke-width="1" fill="none">
    <rect x="40" y="40" width="${w - 80}" height="${h - 80}" />
    <rect x="80" y="80" width="${w - 160}" height="${h - 160}" stroke-dasharray="6 6" />
    <line x1="40" y1="${h / 2}" x2="${w - 40}" y2="${h / 2}" stroke-dasharray="4 4" />
    <line x1="${w / 2}" y1="40" x2="${w / 2}" y2="${h - 40}" stroke-dasharray="4 4" />
  </g>
  <text x="${w / 2}" y="28" text-anchor="middle" fill="#64748b" font-family="ui-sans-serif" font-size="14">${label}</text>
  <text x="${w - 60}" y="${h - 60}" text-anchor="end" fill="#94a3b8" font-family="ui-mono, monospace" font-size="10">${w} × ${h}</text>
</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
