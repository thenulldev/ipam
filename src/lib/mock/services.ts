import type { DhcpScope, DnsZone, RackReservation } from '../types'
import { id } from './ids'

const day = 24 * 60 * 60 * 1000
const now = Date.now()

export const dhcpScopes: DhcpScope[] = [
  {
    id: id.dhcp('dhcp-mgmt'),
    tenantId: id.tenant('tenant-internal'),
    name: 'mgmt-vlan',
    rangeStart: '10.0.0.100',
    rangeEnd: '10.0.0.200',
    leaseSeconds: 4 * 3600,
    gateway: '10.0.0.1',
    dnsServers: ['10.0.0.1', '1.1.1.1'],
    options: [
      { name: 'domain-name', value: 'corp.internal' },
      { name: 'ntp-server', value: '10.0.0.1' },
    ],
  },
  {
    id: id.dhcp('dhcp-srv'),
    tenantId: id.tenant('tenant-internal'),
    name: 'servers-vlan',
    rangeStart: '10.0.1.100',
    rangeEnd: '10.0.1.200',
    leaseSeconds: 24 * 3600,
    gateway: '10.0.1.1',
    dnsServers: ['10.0.0.1'],
    options: [{ name: 'domain-name', value: 'corp.internal' }],
  },
  {
    id: id.dhcp('dhcp-office'),
    tenantId: id.tenant('tenant-internal'),
    name: 'office-vlan',
    rangeStart: '10.0.10.100',
    rangeEnd: '10.0.10.250',
    leaseSeconds: 8 * 3600,
    gateway: '10.0.10.1',
    dnsServers: ['10.0.0.1'],
    options: [
      { name: 'domain-name', value: 'corp.internal' },
      { name: 'proxy-auto', value: 'http://proxy.corp.internal:3128' },
    ],
  },
]

export const dnsZones: DnsZone[] = [
  {
    id: id.dns('zone-corp'),
    tenantId: id.tenant('tenant-internal'),
    name: 'corp.internal',
    kind: 'forward',
    primaryNs: 'ns1.corp.internal',
    adminEmail: 'admin.corp.internal',
    ttl: 3600,
  },
  {
    id: id.dns('zone-rev-100'),
    tenantId: id.tenant('tenant-internal'),
    name: '10.in-addr.arpa',
    kind: 'reverse',
    primaryNs: 'ns1.corp.internal',
    adminEmail: 'admin.corp.internal',
    ttl: 3600,
  },
  {
    id: id.dns('zone-acme'),
    tenantId: id.tenant('tenant-customer-a'),
    name: 'acme.example',
    kind: 'forward',
    primaryNs: 'ns1.acme.example',
    adminEmail: 'admin.acme.example',
    ttl: 3600,
  },
]

export const rackReservations: RackReservation[] = [
  {
    id: id.reservation('res-0001'),
    tenantId: id.tenant('tenant-internal'),
    rackId: id.rack('rack-a1'),
    uStart: 20,
    uHeight: 4,
    label: 'Spare slots (planned: 2x Cisco C9300)',
    color: '#fbbf24',
    reservedById: id.user('user-internal-editor'),
    reservedAt: new Date(now - 5 * day).toISOString(),
    expectedBy: new Date(now + 14 * day).toISOString(),
  },
  {
    id: id.reservation('res-0002'),
    tenantId: id.tenant('tenant-internal'),
    rackId: id.rack('rack-a2'),
    uStart: 10,
    uHeight: 2,
    label: 'Reserved: DR test server',
    color: '#a855f7',
    reservedById: id.user('user-stephan'),
    reservedAt: new Date(now - 12 * day).toISOString(),
  },
  {
    id: id.reservation('res-0003'),
    tenantId: id.tenant('tenant-customer-a'),
    rackId: id.rack('rack-acme-2'),
    uStart: 6,
    uHeight: 3,
    label: 'Pending: firewall upgrade',
    color: '#fb923c',
    reservedById: id.user('user-acme-admin'),
    reservedAt: new Date(now - 2 * day).toISOString(),
    expectedBy: new Date(now + 21 * day).toISOString(),
  },
]