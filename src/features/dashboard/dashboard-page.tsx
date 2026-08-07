import { Link } from '@tanstack/react-router'
import { Activity, Building2, Cable, MapPinned, Network, Server, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { useAddresses, useChangeEvents, usePrefixes, useUsers } from '@/lib/queries'
import { useTenantScope } from '@/lib/tenant-scope'
import { useTenantStore } from '@/store/tenant-store'
import { useValidation } from '@/lib/validation-hooks'
import { ValidationBanner } from '@/components/ui/validation-banner'
import { CreateSiteDialog } from '@/features/sites/create-site-dialog'
import { canWrite } from '@/lib/auth'
import { cn } from '@/lib/utils'

export function DashboardPage() {
  const scope = useTenantScope()
  const allPrefixes = usePrefixes().data ?? []
  const allAddresses = useAddresses().data ?? []
  const currentTenantId = useTenantStore((s) => s.currentTenantId)
  const currentUserId = useTenantStore((s) => s.currentUserId)
  const tenantUsers = useUsers(currentTenantId).data ?? []
  const currentUser = tenantUsers.find((u) => u.id === currentUserId)
  const writable = canWrite(currentUser?.role ?? 'viewer')
  const { data: events = [] } = useChangeEvents({ tenantId: currentTenantId, limit: 6 })
  const issues = useValidation()
  const [createSiteOpen, setCreateSiteOpen] = useState(false)

  const usedAddresses = allAddresses.filter((a) => a.status === 'assigned').length
  const utilization =
    allAddresses.length > 0
      ? Math.round((usedAddresses / allAddresses.length) * 100)
      : 0

  const roomById = useMemo(() => new Map(scope.rooms.map((r) => [r.id, r])), [scope.rooms])
  const siteById = useMemo(() => new Map(scope.sites.map((s) => [s.id, s])), [scope.sites])

  if (scope.sites.length === 0) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          icon={<Building2 className="size-6" />}
          title="No sites yet"
          description="Start by creating your first site — a datacenter, office, or POP. You'll add rooms and racks to it."
          action={
            writable && (
              <Button onClick={() => setCreateSiteOpen(true)}>
                <Building2 className="size-4" />
                Create your first site
              </Button>
            )
          }
        />
        <CreateSiteDialog
          open={createSiteOpen}
          onOpenChange={setCreateSiteOpen}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-500">
            High-level inventory for the current tenant. Switch tenants from the
            top-left.
          </p>
        </div>
      </div>

      <ValidationBanner issues={issues} />

      <div className="grid grid-cols-1 gap-4 min-[390px]:grid-cols-2 md:grid-cols-4">
        <StatCard to="/racks" label="Racks" value={scope.racks.length} icon={Server} />
        <StatCard to="/racks" label="Devices" value={scope.devices.length} icon={Server} />
        <StatCard to="/patches" label="Cables" value={scope.cables.length} icon={Cable} />
        <StatCard to="/ipam" label="Prefixes" value={allPrefixes.length} icon={Network} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>IP Utilization</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold">{utilization}%</span>
              <span className="text-xs text-slate-500">
                {usedAddresses} / {allAddresses.length} addresses used
              </span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full bg-brand-500"
                style={{ width: `${utilization}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Floorplans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {scope.floorplans.map((fp) => (
                <div
                  key={fp.id}
                  className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
                >
                  <div className="flex items-center gap-2">
                    <MapPinned className="size-4 text-slate-400" />
                    <span className="font-medium">{fp.name}</span>
                  </div>
                  <Badge variant="outline">
                    {(fp.rackPositions ?? []).length} rack
                    {(fp.rackPositions ?? []).length === 1 ? '' : 's'}
                  </Badge>
                </div>
              ))}
              {scope.floorplans.length === 0 && (
                <p className="text-xs text-slate-500">No floorplans in this tenant.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {events.map((e) => (
                <li
                  key={e.id}
                  className="flex items-start gap-2 rounded-md border border-slate-200 px-3 py-2 dark:border-slate-800"
                >
                  <Activity className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{e.summary}</div>
                    <div className="text-[11px] text-slate-500">
                      {e.actorName} ·{' '}
                      {new Date(e.createdAt).toLocaleString(undefined, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </div>
                  </div>
                </li>
              ))}
              {events.length === 0 && (
                <p className="text-xs text-slate-500">No recent activity.</p>
              )}
            </ul>
            <Button variant="ghost" size="sm" className="mt-2">
              <Link to="/settings" className="flex items-center gap-1">
                <ShieldCheck className="size-3.5" />
                View all activity
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sites</CardTitle>
        </CardHeader>
        <CardContent>
          {scope.sites.length === 0 ? (
            <p className="text-xs text-slate-500">No sites in this tenant.</p>
          ) : (
            scope.sites.map((s) => (
              <div
                key={s.id}
                className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="font-medium">{s.name}</div>
                  {s.address && (
                    <div className="truncate text-xs text-slate-500">
                      {s.address}
                    </div>
                  )}
                </div>
                <div className="flex max-w-full flex-wrap gap-2 text-xs text-slate-500">
                  {Array.from(roomById.entries())
                    .filter(([, r]) => r.siteId === s.id)
                    .map(([id, r]) => (
                      <Badge key={id} variant="outline">
                        {r.name}
                      </Badge>
                    ))}
                </div>
              </div>
            ))
          )}
          {siteById.size === 0 && null}
          <span className={cn('hidden')} />
        </CardContent>
      </Card>
      <CreateSiteDialog
        open={createSiteOpen}
        onOpenChange={setCreateSiteOpen}
      />
    </div>
  )
}

function StatCard({
  to,
  label,
  value,
  icon: Icon,
}: {
  to: string
  label: string
  value: number | string
  icon: typeof Server
}) {
  return (
    <Link
      to={to}
      className="group rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/50"
    >
      <div className="flex items-center justify-between text-slate-500">
        <span className="text-xs uppercase tracking-wider">{label}</span>
        <Icon className="size-4" />
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
        {value}
      </div>
      <div className="mt-3 text-xs text-brand-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-brand-400">
        View →
      </div>
    </Link>
  )
}
