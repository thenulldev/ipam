import type {
  Cable,
  CableId,
  Device,
  DeviceId,
  DeviceKind,
  Port,
  PortId,
  PortKind,
  Rack,
  RackId,
} from '../types'
import { id } from './ids'

const portSpecs: Array<{ deviceId: DeviceId; port: Port }> = []
const deviceRecords: Device[] = []
let portCounter = 0

interface PortGroupSpec {
  kind: PortKind
  count: number
  labelPrefix: string
  startIndex?: number
  pad?: number
}

interface DeviceSpec {
  id: string
  rackId: RackId
  name: string
  kind: DeviceKind
  model?: string
  vendor?: string
  uStart: number
  uHeight: number
  face?: 'front' | 'rear'
  ports: PortGroupSpec[]
  assetTag?: string
  serialNumber?: string
  warrantyEol?: string
  wattage?: number
  tags?: string[]
  customFields?: Record<string, string>
}

function buildDevices(specs: DeviceSpec[]) {
  for (const spec of specs) {
    const ports: Port['id'][] = []
    let posCounter = 1
    for (const group of spec.ports) {
      const pad = group.pad ?? 2
      const startIndex = group.startIndex ?? 1
      for (let i = 0; i < group.count; i++) {
        const idx = startIndex + i
        portCounter += 1
        const label = `${group.labelPrefix}${idx.toString().padStart(pad, '0')}`
        const portId = id.port(`port-${portCounter.toString().padStart(6, '0')}`)
        ports.push(portId)
        portSpecs.push({
          deviceId: id.device(spec.id),
          port: {
            id: portId,
            deviceId: id.device(spec.id),
            label,
            kind: group.kind,
            position: posCounter++,
          },
        })
      }
    }

    deviceRecords.push({
      id: id.device(spec.id),
      rackId: spec.rackId,
      name: spec.name,
      kind: spec.kind,
      model: spec.model,
      vendor: spec.vendor,
      uStart: spec.uStart,
      uHeight: spec.uHeight,
      face: spec.face ?? 'front',
      ports,
      assetTag: spec.assetTag,
      serialNumber: spec.serialNumber,
      warrantyEol: spec.warrantyEol,
      wattage: spec.wattage,
      tags: spec.tags ?? [],
      customFields: spec.customFields ?? {},
    })
  }
}

// === LAYOUT ===
// A1 (MDF, 42U): U42 top → U1 bottom.
buildDevices([
  {
    id: 'dev-mdf-core-rtr',
    rackId: id.rack('rack-a1'),
    name: 'core-router-01',
    kind: 'router',
    model: 'MX-204',
    vendor: 'Juniper',
    uStart: 40,
    uHeight: 2,
    wattage: 650,
    tags: ['core', 'wan'],
    customFields: { mgmtIp: '10.0.0.2', asn: '65000' },
    ports: [
      { kind: 'qsfp28-100g', count: 4, labelPrefix: 'xe-', startIndex: 0, pad: 1 },
      { kind: 'console-rj45', count: 1, labelPrefix: 'con' },
      { kind: 'power-c19', count: 2, labelPrefix: 'pwr' },
    ],
  },
  {
    id: 'dev-mdf-fw',
    rackId: id.rack('rack-a1'),
    name: 'edge-fw-01',
    kind: 'firewall',
    model: 'PA-3220',
    vendor: 'Palo Alto',
    uStart: 37,
    uHeight: 1,
    wattage: 470,
    tags: ['security'],
    ports: [
      { kind: 'sfp-plus-10g', count: 12, labelPrefix: 'Eth' },
      { kind: 'qsfp28-100g', count: 2, labelPrefix: 'H' },
      { kind: 'console-rj45', count: 1, labelPrefix: 'con' },
      { kind: 'power-c13', count: 2, labelPrefix: 'pwr' },
    ],
  },
  {
    id: 'dev-mdf-core-sw',
    rackId: id.rack('rack-a1'),
    name: 'core-sw-01',
    kind: 'switch',
    model: 'Catalyst 9500-48Y4C',
    vendor: 'Cisco',
    uStart: 35,
    uHeight: 1,
    wattage: 320,
    tags: ['core'],
    ports: [
      { kind: 'sfp-plus-10g', count: 48, labelPrefix: 'Te1/' },
      { kind: 'qsfp28-100g', count: 4, labelPrefix: 'Hu1/' },
      { kind: 'console-rj45', count: 1, labelPrefix: 'con' },
      { kind: 'power-c13', count: 2, labelPrefix: 'pwr' },
    ],
  },
  {
    id: 'dev-mdf-acc-sw',
    rackId: id.rack('rack-a1'),
    name: 'mdf-acc-sw-01',
    kind: 'switch',
    model: 'C9300-48P',
    vendor: 'Cisco',
    uStart: 33,
    uHeight: 1,
    wattage: 240,
    tags: ['access'],
    ports: [
      { kind: 'rj45-1g', count: 48, labelPrefix: 'Gi1/' },
      { kind: 'sfp-plus-10g', count: 4, labelPrefix: 'Te1/' },
      { kind: 'console-rj45', count: 1, labelPrefix: 'con' },
      { kind: 'power-c13', count: 2, labelPrefix: 'pwr' },
    ],
  },
  {
    id: 'dev-mdf-pp-lc',
    rackId: id.rack('rack-a1'),
    name: 'fiber-pp-01',
    kind: 'patch-panel',
    model: '1U 24x LC Duplex',
    vendor: 'Generic',
    uStart: 31,
    uHeight: 1,
    tags: [],
    ports: [
      { kind: 'fiber-lc', count: 24, labelPrefix: 'A', startIndex: 1, pad: 2 },
      { kind: 'fiber-lc', count: 24, labelPrefix: 'B', startIndex: 1, pad: 2 },
    ],
  },
  {
    id: 'dev-mdf-pp-rj45',
    rackId: id.rack('rack-a1'),
    name: 'copper-pp-01',
    kind: 'patch-panel',
    model: '1U 48x RJ45',
    vendor: 'Generic',
    uStart: 29,
    uHeight: 1,
    tags: [],
    ports: [{ kind: 'rj45-1g', count: 48, labelPrefix: 'P', startIndex: 1, pad: 2 }],
  },
  {
    id: 'dev-mdf-pdu-a',
    rackId: id.rack('rack-a1'),
    name: 'pdu-a',
    kind: 'pdu',
    model: 'APC AP8881',
    vendor: 'APC',
    uStart: 27,
    uHeight: 1,
    wattage: 0,
    tags: [],
    ports: [
      { kind: 'power-c13', count: 24, labelPrefix: 'C', startIndex: 1, pad: 2 },
      { kind: 'power-c19', count: 6, labelPrefix: 'C', startIndex: 1, pad: 2 },
    ],
  },
])

// A2 (MDF, 42U): servers
buildDevices([
  {
    id: 'dev-mdf-srv-01',
    rackId: id.rack('rack-a2'),
    name: 'srv-app-01',
    kind: 'server',
    model: 'Dell R750',
    vendor: 'Dell',
    uStart: 36,
    uHeight: 2,
    wattage: 750,
    tags: ['app', 'production'],
    assetTag: 'ASSET-0001',
    serialNumber: 'DLR750-AA001',
    warrantyEol: '2027-04-15',
    customFields: { hostname: 'srv-app-01.corp.internal', env: 'prod' },
    ports: [
      { kind: 'rj45-1g', count: 4, labelPrefix: 'nic' },
      { kind: 'sfp-plus-10g', count: 2, labelPrefix: 'nic' },
      { kind: 'power-c13', count: 2, labelPrefix: 'psu' },
      { kind: 'usb-a', count: 2, labelPrefix: 'usb' },
      { kind: 'console-rj45', count: 1, labelPrefix: 'con' },
    ],
  },
  {
    id: 'dev-mdf-srv-02',
    rackId: id.rack('rack-a2'),
    name: 'srv-app-02',
    kind: 'server',
    model: 'Dell R750',
    vendor: 'Dell',
    uStart: 34,
    uHeight: 2,
    wattage: 750,
    tags: ['app', 'production'],
    assetTag: 'ASSET-0002',
    serialNumber: 'DLR750-AA002',
    warrantyEol: '2027-04-15',
    ports: [
      { kind: 'rj45-1g', count: 4, labelPrefix: 'nic' },
      { kind: 'sfp-plus-10g', count: 2, labelPrefix: 'nic' },
      { kind: 'power-c13', count: 2, labelPrefix: 'psu' },
      { kind: 'usb-a', count: 2, labelPrefix: 'usb' },
      { kind: 'console-rj45', count: 1, labelPrefix: 'con' },
    ],
  },
  {
    id: 'dev-mdf-srv-03',
    rackId: id.rack('rack-a2'),
    name: 'srv-db-01',
    kind: 'server',
    model: 'Dell R760xa',
    vendor: 'Dell',
    uStart: 32,
    uHeight: 2,
    wattage: 1100,
    tags: ['db', 'production'],
    assetTag: 'ASSET-0003',
    customFields: { hostname: 'srv-db-01.corp.internal' },
    ports: [
      { kind: 'rj45-1g', count: 4, labelPrefix: 'nic' },
      { kind: 'sfp-plus-10g', count: 4, labelPrefix: 'nic' },
      { kind: 'power-c13', count: 2, labelPrefix: 'psu' },
      { kind: 'usb-a', count: 2, labelPrefix: 'usb' },
      { kind: 'console-rj45', count: 1, labelPrefix: 'con' },
    ],
  },
  {
    id: 'dev-mdf-srv-04',
    rackId: id.rack('rack-a2'),
    name: 'srv-db-02',
    kind: 'server',
    model: 'Dell R760xa',
    vendor: 'Dell',
    uStart: 30,
    uHeight: 2,
    wattage: 1100,
    tags: ['db', 'production'],
    assetTag: 'ASSET-0004',
    ports: [
      { kind: 'rj45-1g', count: 4, labelPrefix: 'nic' },
      { kind: 'sfp-plus-10g', count: 4, labelPrefix: 'nic' },
      { kind: 'power-c13', count: 2, labelPrefix: 'psu' },
      { kind: 'usb-a', count: 2, labelPrefix: 'usb' },
      { kind: 'console-rj45', count: 1, labelPrefix: 'con' },
    ],
  },
  {
    id: 'dev-mdf-srv-05',
    rackId: id.rack('rack-a2'),
    name: 'srv-k8s-01',
    kind: 'server',
    model: 'Dell R750',
    vendor: 'Dell',
    uStart: 28,
    uHeight: 2,
    wattage: 750,
    tags: ['k8s'],
    ports: [
      { kind: 'sfp-plus-10g', count: 4, labelPrefix: 'nic' },
      { kind: 'power-c13', count: 2, labelPrefix: 'psu' },
      { kind: 'console-rj45', count: 1, labelPrefix: 'con' },
    ],
  },
  {
    id: 'dev-mdf-srv-06',
    rackId: id.rack('rack-a2'),
    name: 'srv-k8s-02',
    kind: 'server',
    model: 'Dell R750',
    vendor: 'Dell',
    uStart: 26,
    uHeight: 2,
    wattage: 750,
    tags: ['k8s'],
    ports: [
      { kind: 'sfp-plus-10g', count: 4, labelPrefix: 'nic' },
      { kind: 'power-c13', count: 2, labelPrefix: 'psu' },
      { kind: 'console-rj45', count: 1, labelPrefix: 'con' },
    ],
  },
  {
    id: 'dev-mdf-kvm',
    rackId: id.rack('rack-a2'),
    name: 'kvm-01',
    kind: 'kvm',
    model: 'Raritan Dominion',
    vendor: 'Raritan',
    uStart: 24,
    uHeight: 1,
    wattage: 60,
    tags: [],
    ports: [
      { kind: 'rj45-1g', count: 16, labelPrefix: 'kvm' },
      { kind: 'power-c13', count: 2, labelPrefix: 'pwr' },
    ],
  },
  {
    id: 'dev-mdf-console',
    rackId: id.rack('rack-a2'),
    name: 'console-srv-01',
    kind: 'console-server',
    model: 'Opengear CM-7148',
    vendor: 'Opengear',
    uStart: 22,
    uHeight: 1,
    wattage: 50,
    tags: [],
    ports: [
      { kind: 'console-rj45', count: 48, labelPrefix: 's' },
      { kind: 'rj45-1g', count: 2, labelPrefix: 'eth' },
      { kind: 'power-c13', count: 2, labelPrefix: 'pwr' },
    ],
  },
])

// A3 (MDF, 42U): storage + misc
buildDevices([
  {
    id: 'dev-mdf-san-sw',
    rackId: id.rack('rack-a3'),
    name: 'san-sw-01',
    kind: 'switch',
    model: 'Brocade G620',
    vendor: 'Brocade',
    uStart: 40,
    uHeight: 1,
    wattage: 280,
    tags: ['storage', 'san'],
    ports: [
      { kind: 'qsfp28-100g', count: 4, labelPrefix: 'fc' },
      { kind: 'sfp-plus-10g', count: 24, labelPrefix: 'fc' },
      { kind: 'power-c13', count: 2, labelPrefix: 'pwr' },
    ],
  },
  {
    id: 'dev-mdf-pp-lc2',
    rackId: id.rack('rack-a3'),
    name: 'fiber-pp-02',
    kind: 'patch-panel',
    model: '1U 24x LC Duplex',
    vendor: 'Generic',
    uStart: 38,
    uHeight: 1,
    tags: [],
    ports: [
      { kind: 'fiber-lc', count: 24, labelPrefix: 'A', startIndex: 1, pad: 2 },
      { kind: 'fiber-lc', count: 24, labelPrefix: 'B', startIndex: 1, pad: 2 },
    ],
  },
  {
    id: 'dev-mdf-srv-07',
    rackId: id.rack('rack-a3'),
    name: 'storage-01',
    kind: 'server',
    model: 'PowerVault ME5',
    vendor: 'Dell',
    uStart: 37,
    uHeight: 3,
    wattage: 880,
    tags: ['storage'],
    ports: [
      { kind: 'sfp-plus-10g', count: 4, labelPrefix: 'nic' },
      { kind: 'power-c13', count: 2, labelPrefix: 'psu' },
      { kind: 'console-rj45', count: 1, labelPrefix: 'con' },
    ],
  },
])

// B1 (IDF-A, 24U)
buildDevices([
  {
    id: 'dev-idf-sw-01',
    rackId: id.rack('rack-b1'),
    name: 'idf-acc-sw-01',
    kind: 'switch',
    model: 'C9300-48P',
    vendor: 'Cisco',
    uStart: 22,
    uHeight: 1,
    wattage: 240,
    tags: ['access'],
    ports: [
      { kind: 'rj45-1g', count: 48, labelPrefix: 'Gi1/' },
      { kind: 'sfp-plus-10g', count: 4, labelPrefix: 'Te1/' },
      { kind: 'console-rj45', count: 1, labelPrefix: 'con' },
      { kind: 'power-c13', count: 2, labelPrefix: 'pwr' },
    ],
  },
  {
    id: 'dev-idf-sw-02',
    rackId: id.rack('rack-b1'),
    name: 'idf-acc-sw-02',
    kind: 'switch',
    model: 'C9300-24P',
    vendor: 'Cisco',
    uStart: 20,
    uHeight: 1,
    wattage: 210,
    tags: ['access'],
    ports: [
      { kind: 'rj45-1g', count: 24, labelPrefix: 'Gi1/' },
      { kind: 'sfp-plus-10g', count: 4, labelPrefix: 'Te1/' },
      { kind: 'console-rj45', count: 1, labelPrefix: 'con' },
      { kind: 'power-c13', count: 2, labelPrefix: 'pwr' },
    ],
  },
  {
    id: 'dev-idf-pp-rj',
    rackId: id.rack('rack-b1'),
    name: 'idf-cu-pp-01',
    kind: 'patch-panel',
    model: '1U 48x RJ45',
    vendor: 'Generic',
    uStart: 18,
    uHeight: 1,
    tags: [],
    ports: [{ kind: 'rj45-1g', count: 48, labelPrefix: 'P', startIndex: 1, pad: 2 }],
  },
  {
    id: 'dev-idf-pp-lc',
    rackId: id.rack('rack-b1'),
    name: 'idf-fi-pp-01',
    kind: 'patch-panel',
    model: '1U 24x LC',
    vendor: 'Generic',
    uStart: 16,
    uHeight: 1,
    tags: [],
    ports: [
      { kind: 'fiber-lc', count: 24, labelPrefix: 'A', startIndex: 1, pad: 2 },
      { kind: 'fiber-lc', count: 24, labelPrefix: 'B', startIndex: 1, pad: 2 },
    ],
  },
  {
    id: 'dev-idf-fw',
    rackId: id.rack('rack-b1'),
    name: 'idf-fw-01',
    kind: 'firewall',
    model: 'FortiGate 60F',
    vendor: 'Fortinet',
    uStart: 14,
    uHeight: 1,
    wattage: 36,
    tags: ['security'],
    ports: [
      { kind: 'rj45-1g', count: 10, labelPrefix: 'port' },
      { kind: 'console-rj45', count: 1, labelPrefix: 'con' },
      { kind: 'power-c13', count: 2, labelPrefix: 'pwr' },
    ],
  },
])

// B2 (IDF-A, 24U)
buildDevices([
  {
    id: 'dev-idf-sw-03',
    rackId: id.rack('rack-b2'),
    name: 'idf-acc-sw-03',
    kind: 'switch',
    model: 'C9200-24P',
    vendor: 'Cisco',
    uStart: 22,
    uHeight: 1,
    wattage: 200,
    tags: ['access'],
    ports: [
      { kind: 'rj45-1g', count: 24, labelPrefix: 'Gi1/' },
      { kind: 'sfp-plus-10g', count: 4, labelPrefix: 'Te1/' },
      { kind: 'console-rj45', count: 1, labelPrefix: 'con' },
      { kind: 'power-c13', count: 2, labelPrefix: 'pwr' },
    ],
  },
  {
    id: 'dev-idf-pp-rj2',
    rackId: id.rack('rack-b2'),
    name: 'idf-cu-pp-02',
    kind: 'patch-panel',
    model: '1U 24x RJ45',
    vendor: 'Generic',
    uStart: 20,
    uHeight: 1,
    tags: [],
    ports: [{ kind: 'rj45-1g', count: 24, labelPrefix: 'P', startIndex: 1, pad: 2 }],
  },
  {
    id: 'dev-idf-pdu',
    rackId: id.rack('rack-b2'),
    name: 'idf-pdu-01',
    kind: 'pdu',
    model: 'APC AP8881',
    vendor: 'APC',
    uStart: 18,
    uHeight: 1,
    wattage: 0,
    tags: [],
    ports: [
      { kind: 'power-c13', count: 24, labelPrefix: 'C', startIndex: 1, pad: 2 },
      { kind: 'power-c19', count: 6, labelPrefix: 'C', startIndex: 1, pad: 2 },
    ],
  },
])

// === Acme tenant racks (separate tenant) ===
buildDevices([
  {
    id: 'dev-acme-sw-01',
    rackId: id.rack('rack-acme-1'),
    name: 'acme-core-sw-01',
    kind: 'switch',
    model: 'EX4300-48P',
    vendor: 'Juniper',
    uStart: 24,
    uHeight: 1,
    wattage: 250,
    tags: ['core'],
    ports: [
      { kind: 'rj45-1g', count: 48, labelPrefix: 'ge-0/0/' },
      { kind: 'sfp-plus-10g', count: 4, labelPrefix: 'xe-0/0/' },
      { kind: 'console-rj45', count: 1, labelPrefix: 'con' },
      { kind: 'power-c13', count: 2, labelPrefix: 'pwr' },
    ],
  },
  {
    id: 'dev-acme-sw-02',
    rackId: id.rack('rack-acme-1'),
    name: 'acme-acc-sw-01',
    kind: 'switch',
    model: 'EX2300-24P',
    vendor: 'Juniper',
    uStart: 22,
    uHeight: 1,
    wattage: 180,
    tags: ['access'],
    ports: [
      { kind: 'rj45-1g', count: 24, labelPrefix: 'ge-0/0/' },
      { kind: 'sfp-plus-10g', count: 4, labelPrefix: 'xe-0/0/' },
      { kind: 'console-rj45', count: 1, labelPrefix: 'con' },
      { kind: 'power-c13', count: 2, labelPrefix: 'pwr' },
    ],
  },
  {
    id: 'dev-acme-pp',
    rackId: id.rack('rack-acme-1'),
    name: 'acme-cu-pp-01',
    kind: 'patch-panel',
    model: '1U 24x RJ45',
    vendor: 'Generic',
    uStart: 20,
    uHeight: 1,
    tags: [],
    ports: [{ kind: 'rj45-1g', count: 24, labelPrefix: 'P' }],
  },
  {
    id: 'dev-acme-fw',
    rackId: id.rack('rack-acme-2'),
    name: 'acme-edge-fw',
    kind: 'firewall',
    model: 'SRX300',
    vendor: 'Juniper',
    uStart: 22,
    uHeight: 1,
    wattage: 60,
    tags: ['security'],
    ports: [
      { kind: 'rj45-1g', count: 8, labelPrefix: 'ge-0/0/' },
      { kind: 'console-rj45', count: 1, labelPrefix: 'con' },
      { kind: 'power-c13', count: 2, labelPrefix: 'pwr' },
    ],
  },
  {
    id: 'dev-acme-srv-01',
    rackId: id.rack('rack-acme-2'),
    name: 'acme-app-01',
    kind: 'server',
    model: 'HPE DL360',
    vendor: 'HPE',
    uStart: 20,
    uHeight: 1,
    wattage: 500,
    tags: ['app'],
    ports: [
      { kind: 'rj45-1g', count: 4, labelPrefix: 'nic' },
      { kind: 'sfp-plus-10g', count: 2, labelPrefix: 'nic' },
      { kind: 'power-c13', count: 2, labelPrefix: 'psu' },
      { kind: 'console-rj45', count: 1, labelPrefix: 'con' },
    ],
  },
  {
    id: 'dev-acme-srv-02',
    rackId: id.rack('rack-acme-2'),
    name: 'acme-app-02',
    kind: 'server',
    model: 'HPE DL360',
    vendor: 'HPE',
    uStart: 18,
    uHeight: 1,
    wattage: 500,
    tags: ['app'],
    ports: [
      { kind: 'rj45-1g', count: 4, labelPrefix: 'nic' },
      { kind: 'sfp-plus-10g', count: 2, labelPrefix: 'nic' },
      { kind: 'power-c13', count: 2, labelPrefix: 'psu' },
      { kind: 'console-rj45', count: 1, labelPrefix: 'con' },
    ],
  },
])

export const racks: Rack[] = [
  {
    id: id.rack('rack-a1'),
    tenantId: id.tenant('tenant-internal'),
    roomId: id.room('room-mdf'),
    name: 'MDF-A1',
    uHeight: 42,
    widthMm: 600,
    depthMm: 1000,
    devices: deviceRecords.filter((d) => d.rackId === id.rack('rack-a1')).map((d) => d.id),
    tags: ['core', 'production'],
    powerBudgetWatts: 8000,
  },
  {
    id: id.rack('rack-a2'),
    tenantId: id.tenant('tenant-internal'),
    roomId: id.room('room-mdf'),
    name: 'MDF-A2',
    uHeight: 42,
    widthMm: 600,
    depthMm: 1000,
    devices: deviceRecords.filter((d) => d.rackId === id.rack('rack-a2')).map((d) => d.id),
    tags: ['compute'],
    powerBudgetWatts: 8000,
  },
  {
    id: id.rack('rack-a3'),
    tenantId: id.tenant('tenant-internal'),
    roomId: id.room('room-mdf'),
    name: 'MDF-A3',
    uHeight: 42,
    widthMm: 600,
    depthMm: 1000,
    devices: deviceRecords.filter((d) => d.rackId === id.rack('rack-a3')).map((d) => d.id),
    tags: ['storage'],
    powerBudgetWatts: 8000,
  },
  {
    id: id.rack('rack-b1'),
    tenantId: id.tenant('tenant-internal'),
    roomId: id.room('room-idf-a'),
    name: 'IDF-B1',
    uHeight: 24,
    widthMm: 600,
    depthMm: 1000,
    devices: deviceRecords.filter((d) => d.rackId === id.rack('rack-b1')).map((d) => d.id),
    tags: ['idf', 'distribution'],
    powerBudgetWatts: 4000,
  },
  {
    id: id.rack('rack-b2'),
    tenantId: id.tenant('tenant-internal'),
    roomId: id.room('room-idf-a'),
    name: 'IDF-B2',
    uHeight: 24,
    widthMm: 600,
    depthMm: 1000,
    devices: deviceRecords.filter((d) => d.rackId === id.rack('rack-b2')).map((d) => d.id),
    tags: ['idf'],
    powerBudgetWatts: 4000,
  },
  {
    id: id.rack('rack-acme-1'),
    tenantId: id.tenant('tenant-customer-a'),
    roomId: id.room('room-acme-mdf'),
    name: 'ACME-R1',
    uHeight: 24,
    widthMm: 600,
    depthMm: 1000,
    devices: deviceRecords.filter((d) => d.rackId === id.rack('rack-acme-1')).map((d) => d.id),
    tags: [],
    powerBudgetWatts: 4000,
  },
  {
    id: id.rack('rack-acme-2'),
    tenantId: id.tenant('tenant-customer-a'),
    roomId: id.room('room-acme-mdf'),
    name: 'ACME-R2',
    uHeight: 24,
    widthMm: 600,
    depthMm: 1000,
    devices: deviceRecords.filter((d) => d.rackId === id.rack('rack-acme-2')).map((d) => d.id),
    tags: [],
    powerBudgetWatts: 4000,
  },
]

export const devices: Device[] = deviceRecords
export const ports: Port[] = portSpecs.map((p) => p.port)

// === CABLES ===
// We deliberately tolerate missing ports here so a single bad label can't
// black-screen the entire app — bad references are skipped with a console
// warning, while the rest of the topology loads.
function findPort(deviceSlug: string, label: string): PortId | null {
  const port = ports.find(
    (p) => p.deviceId === id.device(deviceSlug) && p.label === label,
  )
  if (!port) {
    if ((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV) {
      console.warn(`[mock] missing port ${deviceSlug}:${label} — skipping`)
    }
    return null
  }
  return port.id
}

interface CableSpec {
  id: ReturnType<typeof id.cable>
  kind: Cable['kind']
  lengthM?: number
  label?: string
  a: [string, string]
  b: [string, string]
}

const cableSpecs: CableSpec[] = [
  {
    id: id.cable('cable-0001'),
    kind: 'fiber-sm-os2',
    lengthM: 1.5,
    label: 'rtr → pp-fiber-A1',
    a: ['dev-mdf-core-rtr', 'xe-0'],
    b: ['dev-mdf-pp-lc', 'A01'],
  },
  {
    id: id.cable('cable-0002'),
    kind: 'fiber-sm-os2',
    lengthM: 1.5,
    label: 'rtr → pp-fiber-A2',
    a: ['dev-mdf-core-rtr', 'xe-1'],
    b: ['dev-mdf-pp-lc', 'A02'],
  },
  {
    id: id.cable('cable-0003'),
    kind: 'dac',
    lengthM: 0.5,
    label: 'core-sw-01 ↔ core-rtr',
    a: ['dev-mdf-core-sw', 'Hu1/01'],
    b: ['dev-mdf-core-rtr', 'xe-2'],
  },
  {
    id: id.cable('cable-0004'),
    kind: 'dac',
    lengthM: 0.5,
    label: 'edge-fw-01 → core-sw',
    a: ['dev-mdf-fw', 'Eth01'],
    b: ['dev-mdf-core-sw', 'Te1/48'],
  },
  {
    id: id.cable('cable-0005'),
    kind: 'dac',
    lengthM: 0.5,
    label: 'mdf-acc-sw → core-sw',
    a: ['dev-mdf-acc-sw', 'Te1/04'],
    b: ['dev-mdf-core-sw', 'Te1/01'],
  },
  {
    id: id.cable('cable-0006'),
    kind: 'cat6a',
    lengthM: 1.0,
    label: 'srv-app-01 → mdf-acc',
    a: ['dev-mdf-srv-01', 'nic01'],
    b: ['dev-mdf-acc-sw', 'Gi1/01'],
  },
  {
    id: id.cable('cable-0007'),
    kind: 'cat6a',
    lengthM: 1.0,
    label: 'srv-app-02 → mdf-acc',
    a: ['dev-mdf-srv-02', 'nic01'],
    b: ['dev-mdf-acc-sw', 'Gi1/02'],
  },
  {
    id: id.cable('cable-0008'),
    kind: 'fiber-sm-os2',
    lengthM: 30,
    label: 'mdf → idf fiber',
    a: ['dev-mdf-core-sw', 'Te1/25'],
    b: ['dev-idf-pp-lc', 'A05'],
  },
  {
    id: id.cable('cable-0009'),
    kind: 'fiber-sm-os2',
    lengthM: 0.5,
    label: 'idf-fi-pp A05 → idf-acc-sw-01',
    a: ['dev-idf-pp-lc', 'A05'],
    b: ['dev-idf-sw-01', 'Te1/01'],
  },
]

export const cables: Cable[] = cableSpecs.flatMap((spec): Cable[] => {
  const portA = findPort(spec.a[0], spec.a[1])
  const portB = findPort(spec.b[0], spec.b[1])
  if (!portA || !portB) return []
  return [{ id: spec.id, kind: spec.kind, lengthM: spec.lengthM, label: spec.label, portA, portB }]
})

// Wire up ports[].cableId now that cables exist.
const cableIndex = new Map<PortId, CableId>()
for (const c of cables) {
  cableIndex.set(c.portA, c.id)
  cableIndex.set(c.portB, c.id)
}
for (const p of ports) {
  const cableId = cableIndex.get(p.id)
  if (cableId) p.cableId = cableId
}

// === Site CRUD ===
// (createSite lives in src/lib/api/physical.ts which imports `db` directly)