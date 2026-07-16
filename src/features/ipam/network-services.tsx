import { Database, Globe, Network, Server } from 'lucide-react'
import { useDhcpScopes, useDnsZones } from '@/lib/queries'
import { useTenantStore } from '@/store/tenant-store'
import type { DhcpScope, DnsZone, Prefix } from '@/lib/types'

interface Props {
  prefix: Prefix
}

export function NetworkServicesPanel({ prefix }: Props) {
  const tenantId = useTenantStore((s) => s.currentTenantId)
  const scopes = useDhcpScopes(tenantId).data ?? []
  const zones = useDnsZones(tenantId).data ?? []

  const scope = prefix.dhcpScopeId ? scopes.find((s) => s.id === prefix.dhcpScopeId) : undefined
  const fwdZone = prefix.dnsForwardZoneId
    ? zones.find((z) => z.id === prefix.dnsForwardZoneId)
    : undefined
  const revZone = prefix.dnsReverseZoneId
    ? zones.find((z) => z.id === prefix.dnsReverseZoneId)
    : undefined

  if (!scope && !fwdZone && !revZone) return null

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {scope && <DhcpCard scope={scope} />}
      {fwdZone && <ZoneCard zone={fwdZone} label="Forward DNS" />}
      {revZone && <ZoneCard zone={revZone} label="Reverse DNS" />}
    </div>
  )
}

function DhcpCard({ scope }: { scope: DhcpScope }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-700/40 dark:bg-amber-950/20">
      <div className="mb-2 flex items-center gap-2">
        <Network className="size-4 text-amber-600" />
        <h4 className="text-sm font-semibold">DHCP scope</h4>
        <span className="text-xs text-slate-500">{scope.name}</span>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <Field label="Range" mono>
          {scope.rangeStart} – {scope.rangeEnd}
        </Field>
        <Field label="Lease" mono>
          {Math.round(scope.leaseSeconds / 3600)}h
        </Field>
        {scope.gateway && (
          <Field label="Gateway" mono colSpan={2}>
            {scope.gateway}
          </Field>
        )}
        {scope.dnsServers.length > 0 && (
          <Field label="DNS servers" colSpan={2}>
            <span className="font-mono text-[11px]">
              {scope.dnsServers.join(', ')}
            </span>
          </Field>
        )}
        {scope.options.length > 0 && (
          <Field label="Options" colSpan={2}>
            <ul className="space-y-0.5 text-[11px]">
              {scope.options.map((o, i) => (
                <li key={i}>
                  <span className="font-mono">{o.name}</span>
                  <span className="mx-1 text-slate-400">=</span>
                  <span className="font-mono">{o.value}</span>
                </li>
              ))}
            </ul>
          </Field>
        )}
      </dl>
    </div>
  )
}

function ZoneCard({ zone, label }: { zone: DnsZone; label: string }) {
  return (
    <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-700/40 dark:bg-cyan-950/20">
      <div className="mb-2 flex items-center gap-2">
        {zone.kind === 'forward' ? (
          <Globe className="size-4 text-cyan-600" />
        ) : (
          <Server className="size-4 text-cyan-600" />
        )}
        <h4 className="text-sm font-semibold">{label}</h4>
        <span className="text-xs text-slate-500">{zone.name}</span>
        <span className="ml-auto rounded bg-cyan-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-cyan-800 dark:bg-cyan-900/60 dark:text-cyan-200">
          {zone.kind}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <Field label="Primary NS" mono>
          {zone.primaryNs}
        </Field>
        <Field label="TTL" mono>
          {zone.ttl}s
        </Field>
        <Field label="Admin" colSpan={2} mono>
          {zone.adminEmail}
        </Field>
      </dl>
    </div>
  )
}

function Field({
  label,
  mono,
  colSpan,
  children,
}: {
  label: string
  mono?: boolean
  colSpan?: number
  children: React.ReactNode
}) {
  return (
    <div className={colSpan === 2 ? 'col-span-2' : undefined}>
      <dt className="text-[10px] uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={mono ? 'font-mono' : undefined}>{children}</dd>
    </div>
  )
}

// also export a compact DHCP/DNS summary chip for prefix cards
export function NetworkServiceChips({ prefix }: Props) {
  const tenantId = useTenantStore((s) => s.currentTenantId)
  // Touch the queries so they warm the cache for NetworkServicesPanel
  useDhcpScopes(tenantId)
  useDnsZones(tenantId)

  const hasDhcp = !!prefix.dhcpScopeId
  const hasFwd = !!prefix.dnsForwardZoneId
  const hasRev = !!prefix.dnsReverseZoneId
  if (!hasDhcp && !hasFwd && !hasRev) return null

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {hasDhcp && (
        <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
          <Database className="size-2.5" />
          DHCP
        </span>
      )}
      {hasFwd && (
        <span className="inline-flex items-center gap-1 rounded bg-cyan-100 px-1.5 py-0.5 text-[10px] font-medium text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200">
          <Globe className="size-2.5" />
          Forward DNS
        </span>
      )}
      {hasRev && (
        <span className="inline-flex items-center gap-1 rounded bg-cyan-100 px-1.5 py-0.5 text-[10px] font-medium text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200">
          <Server className="size-2.5" />
          Reverse DNS
        </span>
      )}
      <span className="text-[10px] text-slate-400">
        ({[hasDhcp && 'dhcp', hasFwd && 'fwd', hasRev && 'rev'].filter(Boolean).join(' / ')})
      </span>
    </div>
  )
}