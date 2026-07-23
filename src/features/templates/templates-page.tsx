import { Link } from '@tanstack/react-router'
import { ClipboardList, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useDeviceTemplates } from '@/lib/queries'
import { useTenantStore } from '@/store/tenant-store'
import type { DeviceKind } from '@/lib/types'

const kindColor: Record<DeviceKind, string> = {
  switch: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200',
  router: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  firewall: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  server: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'patch-panel': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  pdu: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
  kvm: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  'console-server': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  blank: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'patchbox-cassette': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  'rack-tray': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'cable-manager': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  gateway: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  ups: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

export function TemplatesPage() {
  const tenantId = useTenantStore((s) => s.currentTenantId)
  const { data: templates = [] } = useDeviceTemplates(tenantId)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return templates
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.vendor.toLowerCase().includes(q) ||
        t.kind.toLowerCase().includes(q) ||
        (t.model ?? '').toLowerCase().includes(q),
    )
  }, [templates, query])

  const grouped = useMemo(() => {
    const byKind = new Map<DeviceKind, typeof filtered>()
    for (const t of filtered) {
      const arr = byKind.get(t.kind) ?? []
      arr.push(t)
      byKind.set(t.kind, arr)
    }
    return Array.from(byKind.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ClipboardList className="size-6 shrink-0 text-slate-400" />
            Device Templates
          </h1>
          <p className="text-sm text-slate-500">
            Reusable definitions for switches, servers, patch panels, PDUs and
            more. Library templates are available to every tenant.
          </p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search templates…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 md:w-72"
          />
        </div>
      </div>

      {grouped.length === 0 && (
        <p className="text-sm text-slate-500">No templates match.</p>
      )}

      {grouped.map(([kind, list]) => (
        <section key={kind}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            {kind} <span className="ml-1 text-slate-400">({list.length})</span>
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {list.map((t) => {
              const portCount = t.portGroups.reduce((s, g) => s + g.count, 0)
              const isLibrary = t.tenantId === ('tenant-library' as any)
              return (
                <Card key={t.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle>{t.name}</CardTitle>
                      <Badge className={kindColor[t.kind]} variant="outline">
                        {t.kind}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <Badge variant="outline">{t.vendor}</Badge>
                      {t.model && <Badge variant="outline">{t.model}</Badge>}
                      <Badge variant="outline">{t.uHeight}U</Badge>
                      <Badge variant="outline">{portCount} ports</Badge>
                      {isLibrary && (
                        <Badge variant="secondary">Library</Badge>
                      )}
                    </div>
                    {t.description && (
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                        {t.description}
                      </p>
                    )}
                    <div className="mt-3 flex justify-end">
                      <Link
                        to="/racks"
                        className="text-xs text-brand-600 hover:underline"
                      >
                        Use template →
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
