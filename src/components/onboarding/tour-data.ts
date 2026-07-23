export type TourSelector =
  | 'dashboard'
  | 'ipam'
  | 'racks'
  | 'patches'
  | 'floorplan'
  | 'topology'
  | 'templates'
  | 'help'

export type TourRoute =
  | '/'
  | '/ipam'
  | '/racks'
  | '/patches'
  | '/floorplan'
  | '/topology'
  | '/templates'

export interface TourStep {
  id: string
  selector: TourSelector
  route: TourRoute
  title: string
  body: string
  cta: string
}

export const TOUR_STEPS = [
  {
    id: 'welcome',
    selector: 'dashboard',
    route: '/',
    title: 'Welcome to IPAM',
    body: 'This is your inventory of network addresses, racks, patches, and floorplans. Let me show you around — about 60 seconds, skip anytime.',
    cta: 'Next',
  },
  {
    id: 'dashboard',
    selector: 'dashboard',
    route: '/',
    title: 'Your dashboard',
    body: 'The dashboard summarizes recent changes, top prefixes, and validation warnings across every site. Click anywhere to dive in.',
    cta: 'Next',
  },
  {
    id: 'ipam',
    selector: 'ipam',
    route: '/ipam',
    title: 'IP addresses & prefixes',
    body: 'Browse, search, allocate, and reconcile IPv4/IPv6 space. Tags, VLANs, and CSV import all live here.',
    cta: 'Next',
  },
  {
    id: 'racks',
    selector: 'racks',
    route: '/racks',
    title: 'Racks & devices',
    body: 'Sites → Rooms → Racks. Click a rack to mount devices, patch ports, and see live U-slot occupation.',
    cta: 'Next',
  },
  {
    id: 'patches',
    selector: 'patches',
    route: '/patches',
    title: 'Patch cords',
    body: "Trace every patch from one device port to another, grouped by source. Confirms what's actually cabled, not just configured.",
    cta: 'Next',
  },
  {
    id: 'floorplan',
    selector: 'floorplan',
    route: '/floorplan',
    title: 'Floorplans (Konva)',
    body: 'Drag racks onto an uploaded floorplan image. Positions persist and power Topology view.',
    cta: 'Next',
  },
  {
    id: 'topology',
    selector: 'topology',
    route: '/topology',
    title: 'Topology view',
    body: 'A live graph of every patched link. Click a node to jump to its device.',
    cta: 'Next',
  },
  {
    id: 'templates',
    selector: 'help',
    route: '/templates',
    title: 'Templates & shortcuts',
    body: 'Device templates speed up rack entry. Press ? any time to see keyboard shortcuts, or re-run this tour from the Help menu.',
    cta: 'Got it',
  },
] as const satisfies readonly TourStep[]
