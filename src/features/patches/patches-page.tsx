import { useMemo, useState } from 'react'
import { Cable, Download, Plus, Route as RouteIcon, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useDisconnectPort, useUsers } from '@/lib/queries'
import { useTenantScope } from '@/lib/tenant-scope'
import { useTenantStore } from '@/store/tenant-store'
import { useEditorStore } from '@/store/editor-store'
import { canWrite } from '@/lib/auth'
import type { CableKind, PortId } from '@/lib/types'
import { AddCableDialog } from './add-cable-dialog'
import { CableTraceDialog } from './cable-trace-dialog'
import { downloadCsv, downloadJson } from '@/lib/export'

const cableColor: Record<CableKind, string> = {
  cat5e: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  cat6: 'bg-slate-300 text-slate-800 dark:bg-slate-700 dark:text-slate-200',
  cat6a: 'bg-slate-400 text-slate-900 dark:bg-slate-600 dark:text-slate-100',
  'fiber-sm-os2': 'bg-cyan-200 text-cyan-900 dark:bg-cyan-900/40 dark:text-cyan-200',
  'fiber-mm-om3': 'bg-cyan-300 text-cyan-900 dark:bg-cyan-800/40 dark:text-cyan-100',
  dac: 'bg-amber-200 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  'power-c13': 'bg-rose-200 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200',
  'power-c19': 'bg-rose-300 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100',
  'console-usb': 'bg-indigo-200 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-200',
}

export function PatchesPage() {
  const scope = useTenantScope()
  const selectPort = useEditorStore((s) => s.selectPort)
  const tenantId = useTenantStore((s) => s.currentTenantId)
  const currentUserId = useTenantStore((s) => s.currentUserId)
  const tenantUsers = useUsers(tenantId).data ?? []
  const currentUser = tenantUsers.find((u) => u.id === currentUserId)
  const writable = canWrite(currentUser?.role ?? 'viewer')

  const disconnect = useDisconnectPort()
  const [filter, setFilter] = useState('')
  const [tracePortId, setTracePortId] = useState<PortId | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const portsById = useMemo(() => new Map(scope.ports.map((p) => [p.id, p])), [scope.ports])
  const devicesById = useMemo(() => new Map(scope.devices.map((d) => [d.id, d])), [scope.devices])
  const racksById = useMemo(() => new Map(scope.racks.map((r) => [r.id, r])), [scope.racks])

  const filtered = scope.cables.filter((c) => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return (
      c.label?.toLowerCase().includes(q) ||
      c.kind.toLowerCase().includes(q) ||
      portsById.get(c.portA)?.label.toLowerCase().includes(q) ||
      portsById.get(c.portB)?.label.toLowerCase().includes(q)
    )
  })

  const onExportCsv = () => {
    downloadCsv(
      'patches.csv',
      filtered.map((c) => ({
        id: c.id,
        label: c.label ?? '',
        kind: c.kind,
        length_m: c.lengthM ?? '',
        from_port: portsById.get(c.portA)?.label ?? '',
        from_device: portsById.get(c.portA)
          ? devicesById.get(portsById.get(c.portA)!.deviceId)?.name
          : '',
        from_rack: portsById.get(c.portA)
          ? devicesById.get(portsById.get(c.portA)!.deviceId)
              ? racksById.get(devicesById.get(portsById.get(c.portA)!.deviceId)!.rackId)?.name
              : ''
          : '',
        to_port: portsById.get(c.portB)?.label ?? '',
        to_device: portsById.get(c.portB)
          ? devicesById.get(portsById.get(c.portB)!.deviceId)?.name
          : '',
        to_rack: portsById.get(c.portB)
          ? devicesById.get(portsById.get(c.portB)!.deviceId)
              ? racksById.get(devicesById.get(portsById.get(c.portB)!.deviceId)!.rackId)?.name
              : ''
          : '',
      })),
    )
  }

  const onExportJson = () => {
    downloadJson('patches.json', filtered)
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Patches</h1>
          <p className="text-sm text-slate-500">
            Every patch cable and its end-points. Click a port to trace its full
            chain.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filter by label, port, type…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-xs"
          />
          {writable && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" />
              Connect ports
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onExportCsv}>
            <Download className="size-4" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={onExportJson}>
            <Download className="size-4" />
            JSON
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cable className="size-4 text-slate-400" />
            {filtered.length} cable
            {filtered.length === 1 ? '' : 's'} in this tenant
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-800/50">
                <tr>
                  <th className="px-3 py-2">Label</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Length</th>
                  <th className="px-3 py-2">From</th>
                  <th className="px-3 py-2">To</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filtered.map((c) => {
                  const a = portsById.get(c.portA)
                  const b = portsById.get(c.portB)
                  const aDev = a ? devicesById.get(a.deviceId) : undefined
                  const bDev = b ? devicesById.get(b.deviceId) : undefined
                  const aRack = aDev ? racksById.get(aDev.rackId) : undefined
                  const bRack = bDev ? racksById.get(bDev.rackId) : undefined
                  return (
                    <tr key={c.id} className="bg-white dark:bg-slate-900">
                      <td className="px-3 py-1.5 font-medium">{c.label ?? '—'}</td>
                      <td className="px-3 py-1.5">
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-medium uppercase ${cableColor[c.kind]}`}
                        >
                          {c.kind}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs">
                        {c.lengthM != null ? `${c.lengthM} m` : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-xs">
                        <div className="font-mono">{a?.label}</div>
                        <div className="text-slate-500">
                          {aDev?.name}
                          {aRack && (
                            <Badge variant="outline" className="ml-2">
                              {aRack.name}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-xs">
                        <div className="font-mono">{b?.label}</div>
                        <div className="text-slate-500">
                          {bDev?.name}
                          {bRack && (
                            <Badge variant="outline" className="ml-2">
                              {bRack.name}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <div className="flex justify-end gap-1">
                          {a && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                selectPort(a.id)
                                setTracePortId(a.id)
                              }}
                              title="Trace this port"
                            >
                              <RouteIcon className="size-3.5" />
                              Trace
                            </Button>
                          )}
                          {writable && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-rose-600 hover:text-rose-700"
                              onClick={() =>
                                disconnect.mutate({
                                  cableId: c.id,
                                  actorId: currentUserId,
                                  actorName: currentUser?.name ?? 'System',
                                  tenantId,
                                })
                              }
                              title="Disconnect cable"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                      No cables match your filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <CableTraceDialog portId={tracePortId} onClose={() => setTracePortId(null)} />
      <AddCableDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}
