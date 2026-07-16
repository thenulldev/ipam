import { useTenantScope } from '@/lib/tenant-scope'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from '@tanstack/react-router'
import { Badge } from '@/components/ui/badge'
import { Building2, Server } from 'lucide-react'
import { cn } from '@/lib/utils'

const kindColor: Record<string, string> = {
  switch: 'bg-sky-50 border-sky-300 dark:bg-sky-950/30 dark:border-sky-800',
  router: 'bg-purple-50 border-purple-300 dark:bg-purple-950/30 dark:border-purple-800',
  firewall: 'bg-rose-50 border-rose-300 dark:bg-rose-950/30 dark:border-rose-800',
  server: 'bg-emerald-50 border-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-800',
  'patch-panel': 'bg-slate-50 border-slate-300 dark:bg-slate-800/40 dark:border-slate-700',
  pdu: 'bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-800',
  kvm: 'bg-pink-50 border-pink-300 dark:bg-pink-950/30 dark:border-pink-800',
  'console-server': 'bg-indigo-50 border-indigo-300 dark:bg-indigo-950/30 dark:border-indigo-800',
  blank: 'bg-slate-100 border-slate-300 dark:bg-slate-900 dark:border-slate-700',
  'patchbox-cassette': 'bg-cyan-50 border-cyan-300 dark:bg-cyan-950/30 dark:border-cyan-800',
  'rack-tray': 'bg-orange-50 border-orange-300 dark:bg-orange-950/30 dark:border-orange-800',
  'cable-manager': 'bg-yellow-50 border-yellow-300 dark:bg-yellow-950/30 dark:border-yellow-800',
  gateway: 'bg-teal-50 border-teal-300 dark:bg-teal-950/30 dark:border-teal-800',
  ups: 'bg-red-50 border-red-300 dark:bg-red-950/30 dark:border-red-800',
}

export function FloorplanListView() {
  const scope = useTenantScope()
  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Floorplans</h1>
        <p className="text-sm text-slate-500">
          List view (mobile / touch). Open a rack for device details.
        </p>
      </div>

      {scope.floorplans.map((fp) => {
        const racksOnFp = fp.rackPositions
          .map((p) => {
            const rack = scope.racks.find((r) => r.id === p.rackId)
            return rack ? { rack, position: p } : null
          })
          .filter((x): x is { rack: NonNullable<typeof x>['rack']; position: NonNullable<typeof x>['position'] } => Boolean(x))
        const totalDevices = racksOnFp.reduce(
          (s, { rack }) =>
            s + scope.devices.filter((d) => d.rackId === rack.id).length,
          0,
        )

        return (
          <Card key={fp.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="size-4 text-slate-400" />
                {fp.name}
                <Badge variant="outline" className="ml-auto">
                  {racksOnFp.length} racks · {totalDevices} devices
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {racksOnFp.map(({ rack }) => {
                const rackDevices = scope.devices
                  .filter((d) => d.rackId === rack.id)
                  .sort((a, b) => b.uStart - a.uStart)
                const usedU = rackDevices.reduce((s, d) => s + d.uHeight, 0)
                const watts = rackDevices.reduce((s, d) => s + (d.wattage ?? 0), 0)
                return (
                  <Link
                    key={rack.id}
                    to="/racks/$rackId"
                    params={{ rackId: rack.id }}
                    className="block rounded-md border border-slate-200 p-3 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <div className="font-medium">{rack.name}</div>
                        <div className="text-xs text-slate-500">
                          {usedU} / {rack.uHeight}U · {watts}W
                        </div>
                      </div>
                      <Server className="size-4 text-slate-400" />
                    </div>
                    <ul className="flex flex-wrap gap-1">
                      {rackDevices.map((d) => (
                        <li
                          key={d.id}
                          className={cn(
                            'rounded border px-2 py-0.5 text-[10px]',
                            kindColor[d.kind] ?? 'border-slate-300 bg-slate-50',
                          )}
                        >
                          {d.name}
                          <span className="ml-1 text-slate-500">
                            U{d.uStart}
                          </span>
                        </li>
                      ))}
                      {rackDevices.length === 0 && (
                        <li className="text-[10px] text-slate-400">
                          (no devices yet)
                        </li>
                      )}
                    </ul>
                  </Link>
                )
              })}
              {racksOnFp.length === 0 && (
                <p className="text-xs text-slate-500">
                  No racks placed on this floorplan yet.
                </p>
              )}
            </CardContent>
          </Card>
        )
      })}

      {scope.floorplans.length === 0 && (
        <p className="text-sm text-slate-500">No floorplans found.</p>
      )}
    </div>
  )
}