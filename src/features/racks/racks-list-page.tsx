import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Building2, Search, Server, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { CreateSiteDialog } from '@/features/sites/create-site-dialog'
import { useTenantScope } from '@/lib/tenant-scope'
import { useTenantStore } from '@/store/tenant-store'
import { useUsers } from '@/lib/queries'
import { canWrite } from '@/lib/auth'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { Device } from '@/lib/types'

export function RacksListPage() {
  const scope = useTenantScope()
  const tenantId = useTenantStore((s) => s.currentTenantId)
  const currentUserId = useTenantStore((s) => s.currentUserId)
  const tenantUsers = useUsers(tenantId).data ?? []
  const currentUser = tenantUsers.find((u) => u.id === currentUserId)
  const writable = canWrite(currentUser?.role ?? 'viewer')
  const [createSiteOpen, setCreateSiteOpen] = useState(false)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const allTags = useMemo(() => {
    const t = new Set<string>()
    for (const d of scope.devices) for (const x of d.tags) t.add(x)
    for (const r of scope.racks) for (const x of r.tags) t.add(x)
    return Array.from(t).sort()
  }, [scope.devices, scope.racks])

  const filteredRacks = useMemo(() => {
    const q = search.trim().toLowerCase()
    return scope.racks.filter((r) => {
      if (tagFilter && !r.tags.includes(tagFilter)) return false
      if (q && !r.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [scope.racks, tagFilter, search])

  const filteredDevicesByRack = useMemo(() => {
    const map = new Map<string, Device[]>()
    for (const r of filteredRacks) map.set(r.id, [])
    for (const d of scope.devices) {
      if (tagFilter && !d.tags.includes(tagFilter)) continue
      const arr = map.get(d.rackId)
      if (arr) arr.push(d)
    }
    return map
  }, [scope.devices, filteredRacks, tagFilter])

  if (scope.sites.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Building2 className="size-6" />}
          title="No sites yet"
          description="Racks live inside sites. Create a site to start adding racks and devices."
          action={
            writable && (
              <Button onClick={() => setCreateSiteOpen(true)}>
                <Building2 className="size-4" />
                Create site
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

  if (scope.racks.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Server className="size-6" />}
          title="No racks yet"
          description="Add rooms to a site, then add racks to those rooms."
          action={
            <Button asChild variant="outline">
              <Link to="/">Back to dashboard</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Racks</h1>
          <p className="text-sm text-slate-500">
            All racks in the current tenant, grouped by room.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Filter racks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 pl-9"
            />
          </div>
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs uppercase tracking-wider text-slate-500">Tags:</span>
          <button
            onClick={() => setTagFilter(null)}
            className={`rounded border px-2 py-0.5 text-xs ${
              tagFilter === null
                ? 'border-brand-500 bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900'
            }`}
          >
            All
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setTagFilter(tagFilter === t ? null : t)}
              className={`rounded border px-2 py-0.5 text-xs ${
                tagFilter === t
                  ? 'border-brand-500 bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900'
              }`}
            >
              {t}
            </button>
          ))}
          {tagFilter && (
            <button
              onClick={() => setTagFilter(null)}
              className="ml-2 text-xs text-slate-400 hover:text-slate-700"
            >
              <X className="inline size-3" /> clear
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {scope.sites.map((site) => {
          const roomsInSite = scope.rooms.filter((r) => r.siteId === site.id)
          if (roomsInSite.length === 0) return null
          return (
            <section
              key={site.id}
              className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div>
                <h3 className="text-sm font-semibold">{site.name}</h3>
                {site.address && (
                  <p className="text-xs text-slate-500">{site.address}</p>
                )}
              </div>
              {roomsInSite.map((room) => {
                const racksInRoom = filteredRacks.filter((r) => r.roomId === room.id)
                if (racksInRoom.length === 0 && !tagFilter) return null
                if (racksInRoom.length === 0 && tagFilter) {
                  // show empty room with hint
                }
                const allRacksInRoom = scope.racks.filter((r) => r.roomId === room.id)
                return (
                  <div key={room.id}>
                    <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                      {room.name}
                      {racksInRoom.length !== allRacksInRoom.length && (
                        <span className="ml-2 text-slate-400">
                          ({racksInRoom.length}/{allRacksInRoom.length})
                        </span>
                      )}
                    </h4>
                    <ul className="space-y-1.5">
                      {racksInRoom.map((rack) => {
                        const devCount = (filteredDevicesByRack.get(rack.id) ?? []).length
                        return (
                          <li key={rack.id}>
                            <Link
                              to="/racks/$rackId"
                              params={{ rackId: rack.id }}
                              className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                            >
                              <span className="flex items-center gap-2">
                                <span className="font-medium">{rack.name}</span>
                                {rack.tags.slice(0, 2).map((t) => (
                                  <Badge key={t} variant="outline" className="text-[10px]">
                                    {t}
                                  </Badge>
                                ))}
                              </span>
                              <span className="flex items-center gap-2 font-mono text-xs text-slate-500">
                                {tagFilter && devCount > 0 && (
                                  <span>{devCount} match</span>
                                )}
                                {rack.uHeight}U
                              </span>
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </section>
          )
        })}
      </div>
    </div>
  )
}
