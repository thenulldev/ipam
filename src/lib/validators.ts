// Static, dependency-free validators that run on tenant-scoped data and
// produce a list of issues. Used by the ValidationBanner and as inline hints
// throughout the app. The intent is that PatchDocs lets you make anything;
// we tell you what's broken.

import type {
  Cable,
  Device,
  IpAddress,
  Prefix,
  Rack,
} from './types'

export type IssueSeverity = 'error' | 'warning' | 'info'

export interface ValidationIssue {
  severity: IssueSeverity
  scope: 'rack' | 'device' | 'port' | 'cable' | 'prefix' | 'site' | 'tenant'
  scopeId: string
  title: string
  detail?: string
}

// === Helpers ===

export function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0
}

export function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

export interface Cidr {
  network: number
  prefix: number
}

export function parseCidr(cidr: string): Cidr | null {
  const [ip, prefixStr] = cidr.split('/')
  if (!ip || !prefixStr) return null
  const prefix = Number(prefixStr)
  if (Number.isNaN(prefix) || prefix < 0 || prefix > 32) return null
  const network = ipToInt(ip) & (0xffffffff << (32 - prefix))
  return { network, prefix }
}

export function cidrContains(outer: Cidr, inner: Cidr): boolean {
  if (outer.prefix > inner.prefix) return false
  const mask = outer.prefix === 0 ? 0 : 0xffffffff << (32 - outer.prefix)
  return (inner.network & mask) === outer.network
}

export function cidrOverlap(a: Cidr, b: Cidr): boolean {
  const min = a.prefix < b.prefix ? a : b
  const max = a.prefix < b.prefix ? b : a
  return cidrContains(min, max)
}

// === Validators ===

export function validateRacks(racks: Rack[], devices: Device[]): ValidationIssue[] {
  const out: ValidationIssue[] = []
  const deviceCountById = new Map<string, number>()
  for (const d of devices) {
    deviceCountById.set(d.rackId, (deviceCountById.get(d.rackId) ?? 0) + 1)
  }
  for (const rack of racks) {
    // Capacity
    const usedU = devices
      .filter((d) => d.rackId === rack.id)
      .reduce((s, d) => s + d.uHeight, 0)
    if (usedU > rack.uHeight) {
      out.push({
        severity: 'error',
        scope: 'rack',
        scopeId: rack.id,
        title: `${rack.name}: capacity exceeded`,
        detail: `${usedU}U used in a ${rack.uHeight}U rack.`,
      })
    }
    // Duplicate device names within a rack
    const devicesInRack = devices.filter((d) => d.rackId === rack.id)
    const nameCount = new Map<string, number>()
    for (const d of devicesInRack) {
      nameCount.set(d.name, (nameCount.get(d.name) ?? 0) + 1)
    }
    for (const [name, count] of nameCount) {
      if (count > 1) {
        out.push({
          severity: 'warning',
          scope: 'rack',
          scopeId: rack.id,
          title: `${rack.name}: duplicate device names`,
          detail: `"${name}" appears ${count} times in this rack.`,
        })
      }
    }
    // U overlap detection
    const sorted = devicesInRack.slice().sort((a, b) => b.uStart - a.uStart)
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]!
        const b = sorted[j]!
        // overlap if a.uStart <= b.uStart + b.uHeight - 1 && b.uStart <= a.uStart + a.uHeight - 1
        if (
          a.uStart <= b.uStart + b.uHeight - 1 &&
          b.uStart <= a.uStart + a.uHeight - 1
        ) {
          out.push({
            severity: 'error',
            scope: 'device',
            scopeId: a.id,
            title: `U overlap: ${a.name} (U${a.uStart}–U${a.uStart + a.uHeight - 1})`,
            detail: `Overlaps with ${b.name} (U${b.uStart}–U${b.uStart + b.uHeight - 1}) in rack ${rack.name}.`,
          })
        }
      }
    }
  }
  return out
}

export function validateAddresses(
  addresses: IpAddress[],
  prefixes: Prefix[],
): ValidationIssue[] {
  const out: ValidationIssue[] = []
  // Find each prefix's parent and verify the address falls inside it
  const byPrefix = new Map(prefixes.map((p) => [p.id, p]))
  const byAddr = new Map<string, IpAddress[]>()
  for (const a of addresses) {
    const arr = byAddr.get(a.address) ?? []
    arr.push(a)
    byAddr.set(a.address, arr)
  }
  for (const a of addresses) {
    const prefix = byPrefix.get(a.prefixId)
    if (!prefix) continue
    const cidr = parseCidr(prefix.cidr)
    if (!cidr) continue
    const ip = ipToInt(a.address)
    if ((ip & (0xffffffff << (32 - cidr.prefix))) >>> 0 !== cidr.network) {
      out.push({
        severity: 'error',
        scope: 'prefix',
        scopeId: prefix.id,
        title: `${a.address} outside ${prefix.cidr}`,
        detail: `Address "${a.address}" is not in its assigned prefix.`,
      })
    }
  }
  // Duplicate IPs across prefixes (within tenant)
  for (const [addr, dup] of byAddr) {
    if (dup.length > 1) {
      out.push({
        severity: 'error',
        scope: 'prefix',
        scopeId: dup[0]!.prefixId,
        title: `Duplicate IP ${addr}`,
        detail: `Assigned to ${dup.length} different addresses: ${dup
          .map((a) => a.id)
          .join(', ')}`,
      })
    }
  }
  return out
}

export function validatePrefixes(prefixes: Prefix[]): ValidationIssue[] {
  const out: ValidationIssue[] = []
  const cidrIndex: Array<{ p: Prefix; cidr: Cidr }> = []
  for (const p of prefixes) {
    const c = parseCidr(p.cidr)
    if (c) cidrIndex.push({ p, cidr: c })
  }
  // Overlap detection
  for (let i = 0; i < cidrIndex.length; i++) {
    for (let j = i + 1; j < cidrIndex.length; j++) {
      const a = cidrIndex[i]!
      const b = cidrIndex[j]!
      if (cidrOverlap(a.cidr, b.cidr)) {
        out.push({
          severity: 'warning',
          scope: 'prefix',
          scopeId: a.p.id,
          title: `Subnet overlap: ${a.p.cidr} ↔ ${b.p.cidr}`,
          detail: 'Overlapping prefixes can cause ambiguous routing.',
        })
      }
    }
  }
  return out
}

export function validateCables(cables: Cable[]): ValidationIssue[] {
  const out: ValidationIssue[] = []
  // Cables between ports in different racks of different tenants — handled at
  // tenant-scope level. For now: warn on cables shorter than 0.1m (likely a
  // misclick).
  for (const c of cables) {
    if (c.lengthM !== undefined && c.lengthM < 0.05) {
      out.push({
        severity: 'info',
        scope: 'cable',
        scopeId: c.id,
        title: `Cable ${c.label ?? c.id} very short`,
        detail: `Length ${c.lengthM}m seems too short to be physical.`,
      })
    }
  }
  return out
}

export interface AllData {
  racks: Rack[]
  devices: Device[]
  cables: Cable[]
  prefixes: Prefix[]
  addresses: IpAddress[]
}

export function validateAll(data: AllData): ValidationIssue[] {
  return [
    ...validateRacks(data.racks, data.devices),
    ...validateCables(data.cables),
    ...validatePrefixes(data.prefixes),
    ...validateAddresses(data.addresses, data.prefixes),
  ]
}