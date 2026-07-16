import type { Vlan } from '../types'
import { id } from './ids'

const T = 'tenant-internal' as Vlan['tenantId']
const T_ACME = 'tenant-customer-a' as Vlan['tenantId']

export const vlans: Vlan[] = [
  {
    id: id.vlan('vlan-1'),
    tenantId: T,
    vid: 1,
    name: 'Default',
    description: 'Default VLAN — native/untagged',
  },
  {
    id: id.vlan('vlan-10'),
    tenantId: T,
    vid: 10,
    name: 'Management',
    description: 'OOB management VLAN',
  },
  {
    id: id.vlan('vlan-20'),
    tenantId: T,
    vid: 20,
    name: 'Servers',
    description: 'Hypervisor / server VLAN',
  },
  {
    id: id.vlan('vlan-30'),
    tenantId: T,
    vid: 30,
    name: 'K8s',
    description: 'Kubernetes nodes VLAN',
  },
  {
    id: id.vlan('vlan-40'),
    tenantId: T,
    vid: 40,
    name: 'Office',
    description: 'Office users VLAN',
  },
  {
    id: id.vlan('vlan-99'),
    tenantId: T,
    vid: 99,
    name: 'Native',
    description: 'Native VLAN for trunk ports',
  },
  {
    id: id.vlan('vlan-100'),
    tenantId: T_ACME,
    vid: 100,
    name: 'Acme-Internal',
    description: 'Acme internal traffic',
  },
]