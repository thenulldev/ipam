import { useMemo, useState } from 'react'
import { useTenantScope } from '@/lib/tenant-scope'
import { ToolsToolbar } from './tools-toolbar'
import {
  useCreateDeviceFromTemplate,
  useDevices,
  usePorts,
  useRack,
  useUpdateDevice,
  useUsers,
} from '@/lib/queries'
import type { DeviceTemplateId } from '@/lib/types'
import { useEditorStore } from '@/store/editor-store'
import { useTenantStore } from '@/store/tenant-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { RackView } from './rack-view'
import { EntityNotesPanel } from '@/features/entity-notes-panel'
import { EntityHistoryPanel } from '@/features/entity-history-panel'
import { CreateDeviceDialog } from './create-device-dialog'
import { EditDeviceDialog } from './edit-device-dialog'
import { VlansTab } from './vlans-tab'
import { ConnectConfirmDialog } from '@/features/patches/connect-confirm-dialog'
import { DeviceNotesDialog } from '@/features/entity-device-notes-dialog'
import { DeviceLibrary } from './device-library'
import { DeviceSettingsPanel } from './device-settings-panel'
import { PortGrid } from '@/components/ui/port-grid'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { useParams } from '@tanstack/react-router'
import { ArrowLeft, Cable, Check, FileText, FolderTree, History, Info, Layers, Pencil, Plug, PlugZap, Plus, Server, SlidersHorizontal, X } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import type { DeviceId, DeviceKind, PortId, RackId } from '@/lib/types'
import { canWrite } from '@/lib/auth'
import { useIsMobile } from '@/hooks/use-media-query'

const kindColor: Record<DeviceKind, string> = {
  switch: 'bg-sky-500/15 border-sky-500/40 text-sky-700 dark:text-sky-300',
  router: 'bg-purple-500/15 border-purple-500/40 text-purple-700 dark:text-purple-300',
  firewall: 'bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-300',
  server: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300',
  'patch-panel': 'bg-slate-500/15 border-slate-500/40 text-slate-700 dark:text-slate-300',
  pdu: 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300',
  kvm: 'bg-pink-500/15 border-pink-500/40 text-pink-700 dark:text-pink-300',
  'console-server': 'bg-indigo-500/15 border-indigo-500/40 text-indigo-700 dark:text-indigo-300',
  blank: 'bg-slate-300/40 border-slate-400/30 text-slate-700 dark:text-slate-400',
  'patchbox-cassette': 'bg-cyan-500/15 border-cyan-500/40 text-cyan-700 dark:text-cyan-300',
  'rack-tray': 'bg-orange-500/15 border-orange-500/40 text-orange-700 dark:text-orange-300',
  'cable-manager': 'bg-yellow-500/15 border-yellow-500/40 text-yellow-800 dark:text-yellow-300',
  gateway: 'bg-teal-500/15 border-teal-500/40 text-teal-700 dark:text-teal-300',
  ups: 'bg-red-500/15 border-red-500/40 text-red-700 dark:text-red-300',
}

type TabKey = 'overview' | 'ports' | 'connections' | 'notes' | 'history'

export function RackDetailPage() {
  const params = useParams({ from: '/racks/$rackId' })
  const rackId = params.rackId as RackId
  const rack = useRack(rackId).data
  const scope = useTenantScope()
  const allDevices = useDevices().data ?? []
  const allPorts = usePorts().data ?? []
  const selectDevice = useEditorStore((s) => s.selectDevice)
  const selectedDeviceId = useEditorStore((s) => s.selectedDeviceId)
  const tenantId = useTenantStore((s) => s.currentTenantId)
  const tenantUsers = useUsers(tenantId).data ?? []
  const currentUser = tenantUsers.find((u) => u.id === useTenantStore.getState().currentUserId)
  const writable = canWrite(currentUser?.role ?? 'viewer')

  const [view, setView] = useState<'front' | 'rear'>('front')
    const [tab, setTab] = useState<TabKey>('overview')
    const [connectionsSubTab, setConnectionsSubTab] = useState<
      'devices' | 'cables' | 'vlans'
    >('devices')
    const [createOpen, setCreateOpen] = useState(false)
    const [editTargetId, setEditTargetId] = useState<DeviceId | null>(null)
    const [notesTargetId, setNotesTargetId] = useState<DeviceId | null>(null)
    const [confirmPortB, setConfirmPortB] = useState<PortId | null>(null)
    const [zoom, setZoom] = useState(1)
    const [fullscreen, setFullscreen] = useState(false)
    const [libraryOpen, setLibraryOpen] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const isMobile = useIsMobile()

  // Connect mode state lives in the editor store.
  const connectMode = useEditorStore((s) => s.connectMode)
  const connectFromPortId = useEditorStore((s) => s.connectFromPortId)
  const enterConnectMode = useEditorStore((s) => s.enterConnectMode)
  const exitConnectMode = useEditorStore((s) => s.exitConnectMode)
  const setConnectFrom = useEditorStore((s) => s.setConnectFrom)
  const highlightedPortId = useEditorStore((s) => s.highlightedPortId)
  const highlightConnection = useEditorStore((s) => s.highlightConnection)

  // For the connect confirm dialog we need both ports' labels + devices.
  const portRefFor = (portId: PortId) => {
    const port = allPorts.find((p) => p.id === portId)
    if (!port) return null
    const device = allDevices.find((d) => d.id === port.deviceId)
    return {
      portId,
      portLabel: port.label,
      deviceName: device?.name ?? '—',
      rackName: rack?.name ?? '—',
    }
  }
  const confirmPortA = connectFromPortId ? portRefFor(connectFromPortId) : null
  const confirmPortBRef = confirmPortB ? portRefFor(confirmPortB) : null

  const onPortClickInConnectMode = (portId: PortId, busy: boolean) => {
    if (busy) return
    if (!connectFromPortId) {
      setConnectFrom(portId)
      return
    }
    if (connectFromPortId === portId) {
      // Clicking the same port deselects
      setConnectFrom(null)
      return
    }
    // Second click — open confirm dialog
    setConfirmPortB(portId)
  }

  const devices = useMemo(
    () => scope.devices.filter((d) => d.rackId === rackId),
    [scope.devices, rackId],
  )

  // Drag-and-drop handlers
  const createFromTemplate = useCreateDeviceFromTemplate()
  const updateDevice = useUpdateDevice()
  const onDropTemplate = (templateId: string, uStart: number) => {
    createFromTemplate.mutate({
      tenantId,
      templateId: templateId as DeviceTemplateId,
      rackId,
      name: '', // will be auto-named in fixture
      uStart,
      face: 'front',
      actorId: useTenantStore.getState().currentUserId,
      actorName: currentUser?.name ?? 'System',
    })
  }
  const onMoveDevice = (deviceId: string, uStart: number) => {
    const target = allDevices.find((d) => d.id === deviceId)
    if (!target || target.uStart === uStart) return
    updateDevice.mutate({
      tenantId,
      id: deviceId as DeviceId,
      patch: { uStart },
      actorId: useTenantStore.getState().currentUserId,
      actorName: currentUser?.name ?? 'System',
    })
  }

  if (!rack) {
    return (
      <div className="grid h-full place-items-center text-sm text-slate-500">
        Loading rack…
      </div>
    )
  }

  const usedU = devices.reduce((s, d) => s + d.uHeight, 0)
    const selectedDevice =
      allDevices.find((d) => d.id === selectedDeviceId) ?? null
    const selectedDevicePorts = selectedDevice
      ? allPorts.filter((p) => p.deviceId === selectedDevice.id)
      : []

    // Shared body for the library/devices panel. Used both as the desktop
    // side aside and inside the mobile Dialog drawer so behaviour stays in sync.
    const renderLibraryPanel = (onItemPicked?: () => void) => (
      <Tabs defaultValue="library" className="flex h-full flex-col">
        <TabsList className="m-2 mb-0 shrink-0">
          <TabsTrigger value="library" className="flex-1">
            <Layers className="size-3.5" />
            Library
          </TabsTrigger>
          <TabsTrigger value="devices" className="flex-1">
            <Server className="size-3.5" />
            Devices
          </TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="m-0 flex-1 overflow-hidden">
          <DeviceLibrary
            onPick={(t) => {
              setCreateOpen(true)
              // After dialog opens, set the initial template ID by reusing
              // the existing CreateDeviceDialog flow with default name.
              void t
              onItemPicked?.()
            }}
          />
        </TabsContent>

        <TabsContent value="devices" className="m-0 flex-1 overflow-y-auto p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              In this rack
            </h3>
            <div className="flex items-center gap-1">
              {writable && (
                <Button
                  size="sm"
                  variant={connectMode ? 'default' : 'ghost'}
                  onClick={() => {
                    if (connectMode) {
                      exitConnectMode()
                    } else {
                      enterConnectMode()
                    }
                    onItemPicked?.()
                  }}
                  className="h-9 min-h-9 px-2 sm:h-7"
                  title="Click two ports to connect them"
                >
                  <PlugZap className="size-3.5" />
                  Connect
                </Button>
              )}
              {writable && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCreateOpen(true)
                    onItemPicked?.()
                  }}
                  className="h-9 min-h-9 px-2 sm:h-7"
                >
                  <Plus className="size-3.5" />
                  Device
                </Button>
              )}
            </div>
          </div>
          <ul className="space-y-1.5">
            {devices
              .slice()
              .sort((a, b) => b.uStart + b.uHeight - (a.uStart + a.uHeight))
              .map((d) => (
                <li key={d.id}>
                  <div
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${kindColor[d.kind]} ${
                      selectedDeviceId === d.id
                        ? 'ring-2 ring-brand-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-950'
                        : 'hover:opacity-80'
                    }`}
                  >
                    <button
                      onClick={() => {
                        selectDevice(d.id)
                        setTab('ports')
                        onItemPicked?.()
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate font-medium">{d.name}</div>
                      <div className="truncate text-[11px] opacity-80">
                        {d.model ?? d.kind} · U{d.uStart}–U{d.uStart + d.uHeight - 1} · {d.uHeight}U · {d.face}
                      </div>
                      {d.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {d.tags.slice(0, 4).map((t) => (
                            <span
                              key={t}
                              className="rounded bg-slate-900/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider opacity-80 dark:bg-white/15"
                            >
                              {t}
                            </span>
                          ))}
                          {d.tags.length > 4 && (
                            <span className="text-[9px] opacity-60">
                              +{d.tags.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                    {writable && (
                      <div className="ml-1 flex shrink-0 items-center gap-0.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setNotesTargetId(d.id)
                            onItemPicked?.()
                          }}
                          className="grid size-9 place-items-center rounded text-slate-700 hover:bg-white/40 sm:size-7 sm:p-1 dark:text-slate-200"
                          title="Notes & history"
                        >
                          <FileText className="size-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditTargetId(d.id)
                            onItemPicked?.()
                          }}
                          className="grid size-9 place-items-center rounded text-slate-700 hover:bg-white/40 sm:size-7 sm:p-1 dark:text-slate-200"
                          title="Edit device"
                        >
                          <Pencil className="size-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
          </ul>
        </TabsContent>
      </Tabs>
    )

    return (
      <div className="flex h-full min-h-0 flex-col">
        {/* Rack header. On mobile this wraps to two rows so the breadcrumb,
            zoom controls, front/rear toggle, and Saved indicator all stay
            reachable without horizontal scroll. The Library + Settings
            affordances are the only mobile-only entries here. */}
        <div className="flex flex-col gap-1 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-slate-500">
            <Button asChild variant="ghost" size="sm" className="min-h-9">
              <Link to="/racks">
                <ArrowLeft className="size-4" />
                <span className="hidden xs:inline sm:inline">Racks</span>
              </Link>
            </Button>
            <span className="hidden sm:inline">/</span>
            <span className="min-w-0 truncate font-medium text-slate-900 dark:text-slate-100">
              {rack.name}
            </span>
            {isMobile && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLibraryOpen(true)}
                className="ml-auto h-9 px-2"
                aria-label="Open device library"
              >
                <Layers className="size-3.5" />
                Library
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[11px]">
              {usedU} / {rack.uHeight}U used
            </Badge>
            {(() => {
              const watts = devices.reduce((s, d) => s + (d.wattage ?? 0), 0)
              const budget = rack.powerBudgetWatts ?? rack.uHeight * 100
              const pct = budget > 0 ? Math.min(100, Math.round((watts / budget) * 100)) : 0
              const danger = pct >= 90
              const warn = pct >= 70
              return (
                <div
                  className={`flex items-center gap-2 rounded-md border px-2 py-0.5 text-xs ${
                    danger
                      ? 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-700/50 dark:bg-rose-950/40 dark:text-rose-200'
                      : warn
                        ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200'
                        : 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-950/40 dark:text-emerald-200'
                  }`}
                  title={`Power budget: ${watts}W used of ${budget}W`}
                >
                  <span className="font-mono">{watts}W</span>
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/40">
                    <div
                      className="h-full bg-current"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="font-mono">{pct}%</span>
                </div>
              )
            })()}
            {isMobile ? (
              // Compact zoom row — replaces the vertical tools toolbar on phones
              // so it doesn't eat a 40px column from the 375px viewport.
              <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white p-0.5 text-xs dark:border-slate-700 dark:bg-slate-900">
                <button
                  onClick={() => setZoom((z) => Math.max(0.4, Math.round(z / 1.2 * 100) / 100))}
                  className="grid size-7 place-items-center rounded text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-label="Zoom out"
                >
                  −
                </button>
                <button
                  onClick={() => setZoom(1)}
                  className="rounded px-1.5 py-0.5 font-mono tabular-nums text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-label="Reset zoom"
                  title="Reset zoom"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  onClick={() => setZoom((z) => Math.min(2, Math.round(z * 1.2 * 100) / 100))}
                  className="grid size-7 place-items-center rounded text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-label="Zoom in"
                >
                  +
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white p-0.5 text-xs dark:border-slate-700 dark:bg-slate-900">
                {(['front', 'rear'] as const).map((side) => (
                  <button
                    key={side}
                    onClick={() => setView(side)}
                    className={`rounded px-2 py-0.5 ${
                      view === side
                        ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {side === 'front' ? 'Front' : 'Rear'}
                  </button>
                ))}
              </div>
            )}
            {!isMobile && (
              <span
                className="ml-1 flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                title="All changes are saved"
              >
                <Check className="size-3" />
                Saved
              </span>
            )}
            {isMobile && (
              <Button
                size="sm"
                variant={selectedDeviceId ? 'default' : 'outline'}
                onClick={() => setSettingsOpen(true)}
                disabled={!selectedDeviceId}
                className="h-9 px-2"
                aria-label="Open device settings"
                title={selectedDeviceId ? 'Open device settings' : 'Select a device first'}
              >
                <SlidersHorizontal className="size-3.5" />
                Settings
              </Button>
            )}
          </div>
          {/* Second row on mobile: front/rear toggle + Saved indicator, kept
              separate so the row above doesn't get crowded at 375px. */}
          {isMobile && (
            <div className="flex items-center gap-2 sm:hidden">
              <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white p-0.5 text-xs dark:border-slate-700 dark:bg-slate-900">
                {(['front', 'rear'] as const).map((side) => (
                  <button
                    key={side}
                    onClick={() => setView(side)}
                    className={`rounded px-2 py-1 ${
                      view === side
                        ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {side === 'front' ? 'Front' : 'Rear'}
                  </button>
                ))}
              </div>
              <span
                className="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                title="All changes are saved"
              >
                <Check className="size-3" />
                Saved
              </span>
            </div>
          )}
        </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
              {!isMobile && (
                <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200 dark:border-slate-800">
                  {renderLibraryPanel()}
                </aside>
              )}

              {!isMobile && (
                <ToolsToolbar
                  zoomPercent={Math.round(zoom * 100)}
                  onZoomIn={() => setZoom((z) => Math.min(2, Math.round(z * 1.2 * 100) / 100))}
                  onZoomOut={() => setZoom((z) => Math.max(0.4, Math.round(z / 1.2 * 100) / 100))}
                  onResetZoom={() => setZoom(1)}
                  onFullscreen={() => setFullscreen((v) => !v)}
                  onFitWidth={() => setZoom(0.5)}
                  onFitHeight={() => setZoom(1)}
                />
              )}

              {!isMobile && (
                <DeviceSettingsPanel
                  deviceId={selectedDeviceId}
                  onClose={() => useEditorStore.getState().selectDevice(null)}
                />
              )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex overflow-x-auto border-b border-slate-200 bg-white px-2 md:px-4 dark:border-slate-800 dark:bg-slate-900">
            <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} icon={Info} label="Overview" />
            <TabButton active={tab === 'ports'} onClick={() => setTab('ports')} icon={Plug} label="Ports" />
            <TabButton active={tab === 'connections'} onClick={() => setTab('connections')} icon={Cable} label="Connections" />
            <TabButton active={tab === 'notes'} onClick={() => setTab('notes')} icon={FolderTree} label="Notes & Images" />
            <TabButton active={tab === 'history'} onClick={() => setTab('history')} icon={History} label="History" />
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-3 md:p-4">
            {tab === 'overview' && (
              <div
                className={`rounded-lg border border-slate-200 bg-white p-4 transition-transform dark:border-slate-800 dark:bg-slate-900 ${
                  fullscreen ? 'fixed inset-0 z-50 m-0 rounded-none' : ''
                }`}
                style={{
                  transform: fullscreen ? 'none' : `scale(${zoom})`,
                  transformOrigin: 'top center',
                }}
              >
                <RackView
                  rack={rack}
                  devices={devices}
                  side={view}
                  portsByDevice={(() => {
                    const map: Record<string, typeof allPorts> = {}
                    for (const p of allPorts) {
                      ;(map[p.deviceId] ??= []).push(p)
                    }
                    return map
                  })()}
                  highlightedPortId={highlightedPortId}
                  onPortClick={(portId) => {
                    const port = allPorts.find((p) => p.id === portId)
                    if (!port) return
                    if (port.cableId) {
                      const cable = scope.cables.find(
                        (c) => c.id === port.cableId,
                      )
                      highlightConnection(portId, cable?.id ?? null)
                    } else {
                      highlightConnection(portId, null)
                    }
                  }}
                />
                {fullscreen && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFullscreen(false)}
                    className="absolute right-4 top-4"
                  >
                    Exit fullscreen
                  </Button>
                )}
              </div>
            )}

            {tab === 'ports' && (
              <div className="space-y-4">
                {connectMode && (
                  <div className="flex items-center justify-between rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800 dark:border-brand-700/50 dark:bg-brand-900/30 dark:text-brand-200">
                    <span className="flex items-center gap-2">
                      <PlugZap className="size-4" />
                      {connectFromPortId
                        ? 'Now click the second port to connect.'
                        : 'Click the first port to start.'}
                    </span>
                    <Button size="sm" variant="ghost" onClick={exitConnectMode}>
                      <X className="size-3.5" />
                      Cancel
                    </Button>
                  </div>
                )}
                <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
<RackView
                  rack={rack}
                  devices={devices}
                  side={view}
                  portsByDevice={(() => {
                    const map: Record<string, typeof allPorts> = {}
                    for (const p of allPorts) {
                      ;(map[p.deviceId] ??= []).push(p)
                    }
                    return map
                  })()}
                  highlightedPortId={highlightedPortId}
                  onPortClick={(portId) => {
                    const port = allPorts.find((p) => p.id === portId)
                    if (!port) return
                    if (port.cableId) {
                      const cable = scope.cables.find(
                        (c) => c.id === port.cableId,
                      )
                      highlightConnection(portId, cable?.id ?? null)
                    } else {
                      highlightConnection(portId, null)
                    }
                  }}
                  onDropTemplate={writable ? onDropTemplate : undefined}
                  onMoveDevice={writable ? onMoveDevice : undefined}
                />
                </div>
                {connectMode ? (
                  <div className="space-y-3">
                    {devices
                      .slice()
                      .sort((a, b) => a.uStart - b.uStart)
                      .map((d) => {
                        const devPorts = allPorts.filter(
                          (p) => p.deviceId === d.id,
                        )
                        return (
                          <div
                            key={d.id}
                            className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                          >
                            <h4 className="text-sm font-semibold">
                              {d.name}{' '}
                              <span className="font-normal text-slate-500">
                                ({devPorts.length} ports)
                              </span>
                            </h4>
                            <div className="mt-2">
                              <PortGrid
                                ports={devPorts}
                                connectedPortIds={
                                  new Set(devPorts.filter((p) => p.cableId).map((p) => p.id))
                                }
                                selectedFromPortId={connectFromPortId}
                                disabledIds={
                                  new Set(devPorts.filter((p) => p.cableId).map((p) => p.id))
                                }
                                onPortClick={(p) =>
                                  onPortClickInConnectMode(p.id, !!p.cableId)
                                }
                                columns={devPorts.length > 24 ? 24 : 12}
                              />
                            </div>
                          </div>
                        )
                      })}
                  </div>
                ) : (
                  <>
                    {selectedDevice ? (
                      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                        <h4 className="text-sm font-semibold">
                          {selectedDevice.name}{' '}
                          <span className="font-normal text-slate-500">
                            ({selectedDevicePorts.length} ports)
                          </span>
                        </h4>
                        <div className="mt-2">
                          <PortGrid
                            ports={selectedDevicePorts}
                            connectedPortIds={
                              new Set(
                                selectedDevicePorts
                                  .filter((p) => p.cableId)
                                  .map((p) => p.id),
                              )
                            }
                            columns={selectedDevicePorts.length > 24 ? 24 : 12}
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">
                        Select a device from the sidebar to see its ports.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {tab === 'connections' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
                  <SubTabButton
                    active={connectionsSubTab === 'devices'}
                    onClick={() => setConnectionsSubTab('devices')}
                    label="Devices"
                  />
                  <SubTabButton
                    active={connectionsSubTab === 'cables'}
                    onClick={() => setConnectionsSubTab('cables')}
                    label="Cables"
                  />
                  <SubTabButton
                    active={connectionsSubTab === 'vlans'}
                    onClick={() => setConnectionsSubTab('vlans')}
                    label="VLANs"
                  />
                </div>

                {connectionsSubTab === 'devices' && (
                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-800/50">
                        <tr>
                          <th className="px-3 py-2">ID</th>
                          <th className="px-3 py-2">Name</th>
                          <th className="px-3 py-2">Side</th>
                          <th className="px-3 py-2">Unit</th>
                          <th className="px-3 py-2">Type</th>
                          <th className="px-3 py-2 text-right">Ports</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {devices
                          .slice()
                          .sort((a, b) => b.uStart - a.uStart)
                          .map((d) => {
                            const dPortCount = allPorts.filter(
                              (p) => p.deviceId === d.id,
                            ).length
                            return (
                              <tr
                                key={d.id}
                                className="bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/50"
                              >
                                <td className="px-3 py-1.5 font-mono text-xs text-slate-500">
                                  {d.id.slice(-6)}
                                </td>
                                <td className="px-3 py-1.5 font-medium">
                                  {d.name}
                                </td>
                                <td className="px-3 py-1.5 capitalize">
                                  {d.face}
                                </td>
                                <td className="px-3 py-1.5 font-mono text-xs">
                                  U{d.uStart}–U{d.uStart + d.uHeight - 1}
                                </td>
                                <td className="px-3 py-1.5 capitalize">
                                  {d.kind.replace(/-/g, ' ')}
                                </td>
                                <td className="px-3 py-1.5 text-right font-mono text-xs">
                                  {dPortCount}
                                </td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>
                )}

                {connectionsSubTab === 'cables' && (
                  <div className="space-y-1">
                    {scope.cables
                      .filter((c) => {
                        const portA = allPorts.find((p) => p.id === c.portA)
                        const portB = allPorts.find((p) => p.id === c.portB)
                        if (!portA || !portB) return false
                        const devA = scope.devices.find(
                          (d) => d.id === portA.deviceId,
                        )
                        const devB = scope.devices.find(
                          (d) => d.id === portB.deviceId,
                        )
                        return devA?.rackId === rackId || devB?.rackId === rackId
                      })
                      .map((c) => {
                        const portA = allPorts.find((p) => p.id === c.portA)
                        const portB = allPorts.find((p) => p.id === c.portB)
                        const devA = portA
                          ? scope.devices.find((d) => d.id === portA.deviceId)
                          : undefined
                        const devB = portB
                          ? scope.devices.find((d) => d.id === portB.deviceId)
                          : undefined
                        return (
                          <div
                            key={c.id}
                            className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-xs dark:border-slate-800"
                          >
                            <span
                              className="size-3 rounded"
                              style={{
                                background: (c as any).color || '#0ea5e9',
                              }}
                            />
                            <span className="font-medium">{c.label ?? c.id}</span>
                            <span className="text-slate-500">
                              {c.kind}
                              {c.lengthM ? ` · ${c.lengthM}m` : ''}
                            </span>
                            <span className="w-full break-all font-mono text-slate-500 sm:ml-auto sm:w-auto">
                              {devA?.name}.{portA?.label} ↔ {devB?.name}.{portB?.label}
                            </span>
                          </div>
                        )
                      })}
                    {scope.cables.filter((c) => {
                      const portA = allPorts.find((p) => p.id === c.portA)
                      const portB = allPorts.find((p) => p.id === c.portB)
                      if (!portA || !portB) return false
                      const devA = scope.devices.find((d) => d.id === portA.deviceId)
                      const devB = scope.devices.find((d) => d.id === portB.deviceId)
                      return devA?.rackId === rackId || devB?.rackId === rackId
                    }).length === 0 && (
                      <p className="text-xs text-slate-500">
                        No cables connect to this rack.
                      </p>
                    )}
                  </div>
                )}

                {connectionsSubTab === 'vlans' && <VlansTab rackId={rackId} />}
              </div>
            )}

            {tab === 'notes' && (
              <EntityNotesPanel entityType="rack" entityId={rack.id} entityLabel={rack.name} />
            )}

            {tab === 'history' && (
              <EntityHistoryPanel entityType="rack" entityId={rack.id} />
            )}
          </div>
        </div>
      </div>

      <CreateDeviceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialRackId={rackId}
      />

      <EditDeviceDialog
        deviceId={editTargetId}
        onOpenChange={(o) => !o && setEditTargetId(null)}
      />

      <DeviceNotesDialog
        deviceId={notesTargetId}
        onOpenChange={(o) => !o && setNotesTargetId(null)}
      />

      <ConnectConfirmDialog
        open={confirmPortB !== null}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmPortB(null)
            exitConnectMode()
          }
        }}
        portA={confirmPortA}
        portB={confirmPortBRef}
      />

      {isMobile && (
        <>
          <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
            <DialogContent
              showCloseButton={false}
              className="inset-x-0 bottom-0 left-0 top-auto flex h-[85dvh] max-h-[85dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col rounded-b-none rounded-t-xl p-0"
            >
              <DialogTitle className="border-b border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
                Device library
              </DialogTitle>
              <div className="min-h-0 flex-1 overflow-hidden">
                {renderLibraryPanel(() => setLibraryOpen(false))}
              </div>
            </DialogContent>
          </Dialog>
          <DeviceSettingsPanel
            variant="mobile"
            deviceId={settingsOpen ? selectedDeviceId : null}
            onClose={() => setSettingsOpen(false)}
          />
        </>
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Info
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors ${
        active
          ? 'border-brand-500 text-brand-700 dark:text-brand-300'
          : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
      }`}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  )
}

function SubTabButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'border-brand-500 text-brand-700 dark:text-brand-300'
          : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  )
}
