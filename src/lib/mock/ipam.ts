import type { IpAddress, Prefix, Vrf } from '../types'
import { id } from './ids'

export const vrfs: Vrf[] = [
  {
    id: id.vrf('vrf-default'),
    name: 'default',
    description: 'Global routing table',
  },
  {
    id: id.vrf('vrf-mgmt'),
    name: 'mgmt',
    rd: '65000:10',
    description: 'Out-of-band management network',
  },
  {
    id: id.vrf('vrf-guest'),
    name: 'guest',
    rd: '65000:20',
    description: 'Guest/visitor Wi-Fi VLAN termination',
  },
]

export const prefixes: Prefix[] = [
  // RFC1918 spine
  {
    id: id.prefix('pfx-10'),
    cidr: '10.0.0.0/8',
    role: 'reserved',
    description: 'RFC1918 private space (spine)',
    tags: ['rfc1918'],
  },
  {
    id: id.prefix('pfx-10-0'),
    parentId: id.prefix('pfx-10'),
    cidr: '10.0.0.0/16',
    role: 'infra',
    description: 'MDF infrastructure',
    tags: [],
  },
  {
    id: id.prefix('pfx-10-0-0'),
    parentId: id.prefix('pfx-10-0'),
    cidr: '10.0.0.0/24',
    role: 'mgmt',
    description: 'OOB management VLAN',
    vrfId: id.vrf('vrf-mgmt'),
    dhcpScopeId: id.dhcp('dhcp-mgmt'),
    dnsForwardZoneId: id.dns('zone-corp'),
    dnsReverseZoneId: id.dns('zone-rev-100'),
    tags: ['oob'],
  },
  {
    id: id.prefix('pfx-10-0-1'),
    parentId: id.prefix('pfx-10-0'),
    cidr: '10.0.1.0/24',
    role: 'lan',
    description: 'Servers / hypervisor VLAN',
    dhcpScopeId: id.dhcp('dhcp-srv'),
    tags: ['servers'],
  },
  {
    id: id.prefix('pfx-10-0-2'),
    parentId: id.prefix('pfx-10-0'),
    cidr: '10.0.2.0/24',
    role: 'lan',
    description: 'Kubernetes nodes VLAN',
    tags: ['k8s'],
  },
  {
    id: id.prefix('pfx-10-0-10'),
    parentId: id.prefix('pfx-10-0'),
    cidr: '10.0.10.0/24',
    role: 'lan',
    description: 'Office users VLAN',
    dhcpScopeId: id.dhcp('dhcp-office'),
    tags: ['office'],
  },
  {
    id: id.prefix('pfx-10-0-99'),
    parentId: id.prefix('pfx-10-0'),
    cidr: '10.0.99.0/24',
    role: 'reserved',
    description: 'Future expansion',
    tags: ['reserved', 'expansion'],
  },

  // p2p / transit
  {
    id: id.prefix('pfx-172-16'),
    cidr: '172.16.0.0/16',
    role: 'reserved',
    description: 'p2p transit space',
    tags: [],
  },
  {
    id: id.prefix('pfx-172-16-1'),
    parentId: id.prefix('pfx-172-16'),
    cidr: '172.16.1.0/24',
    role: 'p2p',
    description: 'Core ↔ firewall',
    tags: [],
  },
  {
    id: id.prefix('pfx-172-16-2'),
    parentId: id.prefix('pfx-172-16'),
    cidr: '172.16.2.0/24',
    role: 'p2p',
    description: 'Core ↔ IDF',
    tags: [],
  },

  // Guest VLAN
  {
    id: id.prefix('pfx-guest'),
    cidr: '192.168.50.0/24',
    role: 'lan',
    description: 'Guest Wi-Fi',
    vrfId: id.vrf('vrf-guest'),
    dnsForwardZoneId: id.dns('zone-acme'),
    tags: [],
  },

  // Loopbacks
  {
    id: id.prefix('pfx-lo'),
    cidr: '10.255.0.0/16',
role: 'loopback',
    description: 'Router/loopback addresses',
    tags: ['loopback'],
  },
]

function buildAddresses(
  prefix: Prefix,
  entries: Array<[string, IpAddress['status'], string?, string?, string?]>,
): IpAddress[] {
  // entries: [lastOctet, status, dnsName?, description?, assignedDeviceSlug?]
  const [network] = prefix.cidr.split('/')
  const base = network!.split('.').slice(0, 3).join('.')
  return entries.map(([octet, status, dnsName, description], idx) => {
    const ip = id.ip(`${prefix.id}-${idx.toString().padStart(4, '0')}`)
    const addr =
      status === 'gateway' && idx === 0 ? `${base}.1` : `${base}.${octet ?? '0'}`
    return {
      id: ip,
      prefixId: prefix.id,
      address: addr,
      status,
      dnsName,
      description,
      lastSeenAt:
        status === 'assigned'
          ? new Date(Date.now() - Math.random() * 1e9).toISOString()
          : undefined,
    } satisfies IpAddress
  })
}

void buildAddresses // ensures helper is included in build

// We initialize the array explicitly to keep deterministic ordering.
export const addresses: IpAddress[] = [
  // mgmt /24
  ...buildAddresses(prefixes[2]!, [
    ['1', 'gateway', 'gw-mgmt', 'OOB default gateway'],
    ['2', 'assigned', 'core-rtr-mgmt', 'core-router-01 mgmt'],
    ['3', 'assigned', 'core-sw-mgmt', 'core-sw-01 mgmt'],
    ['4', 'assigned', 'fw-mgmt', 'edge-fw-01 mgmt'],
    ['5', 'assigned', 'idf-sw-01-mgmt', 'idf-acc-sw-01 mgmt'],
    ['10', 'reserved', undefined, 'spare management'],
    ['11', 'free'],
    ['12', 'free'],
  ]),
  // servers /24
  ...buildAddresses(prefixes[3]!, [
    ['1', 'gateway', 'gw-srv', 'servers default gateway'],
    ['10', 'assigned', 'srv-app-01', 'srv-app-01 VLAN 1'],
    ['11', 'assigned', 'srv-app-02', 'srv-app-02 VLAN 1'],
    ['12', 'assigned', 'srv-db-01', 'srv-db-01 VLAN 1'],
    ['13', 'assigned', 'srv-db-02', 'srv-db-02 VLAN 1'],
    ['20', 'dhcp', undefined, 'DHCP: 10.0.1.100-200'],
    ['21', 'free'],
    ['22', 'free'],
  ]),
  // k8s /24
  ...buildAddresses(prefixes[4]!, [
    ['1', 'gateway', 'gw-k8s', 'Kubernetes gateway'],
    ['10', 'assigned', 'k8s-node-01', 'k8s node 1'],
    ['11', 'assigned', 'k8s-node-02', 'k8s node 2'],
    ['12', 'free'],
  ]),
  // office /24
  ...buildAddresses(prefixes[5]!, [
    ['1', 'gateway', 'gw-office', 'office gateway'],
    ['2', 'free'],
    ['3', 'free'],
    ['100', 'dhcp', undefined, 'Office DHCP range'],
  ]),
  // p2p
  ...buildAddresses(prefixes[8]!, [
    ['1', 'gateway', undefined, 'core-rtr end'],
    ['2', 'assigned', undefined, 'edge-fw end'],
  ]),
  ...buildAddresses(prefixes[9]!, [
    ['1', 'gateway', undefined, 'core-rtr end'],
    ['2', 'assigned', undefined, 'idf-sw-01 end'],
  ]),
  // guest
  ...buildAddresses(prefixes[10]!, [
    ['1', 'gateway', 'gw-guest', 'Guest gateway'],
    ['10', 'free'],
    ['100', 'dhcp', undefined, 'Guest DHCP'],
  ]),
  // loopbacks
  ...buildAddresses(prefixes[11]!, [
    ['1', 'assigned', 'core-rtr-lo0', 'core-router-01 loopback'],
    ['2', 'assigned', 'edge-fw-lo0', 'edge-fw-01 loopback'],
    ['3', 'assigned', 'core-sw-lo0', 'core-sw-01 loopback'],
    ['10', 'assigned', 'idf-sw-01-lo0', 'idf-acc-sw-01 loopback'],
  ]),
]
