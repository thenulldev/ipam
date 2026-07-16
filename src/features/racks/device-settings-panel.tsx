import { useEffect, useState } from 'react'
import { confirm } from '@/components/ui/confirm-dialog'
import {
  Building2,
  Calendar,
  FileText,
  Image as ImageIcon,
  Pencil,
  Plug,
  PlugZap,
  Save,
  Tag,
  Trash2,
  Unplug,
  User,
  X,
} from 'lucide-react'
import {
  useCables,
  useDeleteDevice,
  useDevice,
  useDisconnectPort,
  usePorts,
  useUpdateCableColor,
  useUpdateDevice,
  useUpdatePort,
  useUsers,
  useVlans,
} from '@/lib/queries'
import { useTenantScope } from '@/lib/tenant-scope'
import { useTenantStore } from '@/store/tenant-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TagsInput } from '@/components/ui/tags-input'
import { PatchboxConfigurator } from './patchbox-configurator'
import { cn } from '@/lib/utils'
import type { DeviceId, FrontBack, Vlan } from '@/lib/types'

interface Props {
  deviceId: DeviceId | null
  onClose: () => void
}

type Tab = 'general' | 'photos' | 'notes' | 'rules'

export function DeviceSettingsPanel({ deviceId, onClose }: Props) {
  const tenantId = useTenantStore((s) => s.currentTenantId)
  const currentUserId = useTenantStore((s) => s.currentUserId)
  const tenantUsers = useUsers(tenantId).data ?? []
  const currentUser = tenantUsers.find((u) => u.id === currentUserId)
  const actorName = currentUser?.name ?? 'System'

  const device = useDevice(deviceId ?? undefined).data
  const update = useUpdateDevice()
  const remove = useDeleteDevice()

  const [tab, setTab] = useState<Tab>('general')
  const [draft, setDraft] = useState<{
    name: string
    vendor: string
    model: string
    assetTag: string
    serialNumber: string
    wattage: number | undefined
    warrantyEol: string
    face: FrontBack
    responsible: string
    tags: string[]
  }>({
    name: '',
    vendor: '',
    model: '',
    assetTag: '',
    serialNumber: '',
    wattage: undefined,
    warrantyEol: '',
    face: 'front',
    responsible: '',
    tags: [],
  })

  useEffect(() => {
    if (!device) return
    setDraft({
      name: device.name,
      vendor: device.vendor ?? '',
      model: device.model ?? '',
      assetTag: device.assetTag ?? '',
      serialNumber: device.serialNumber ?? '',
      wattage: device.wattage,
      warrantyEol: device.warrantyEol ?? '',
      face: device.face,
      responsible: device.customFields['responsible'] ?? '',
      tags: device.tags,
    })
  }, [device?.id])

  const isDirty = device
    ? draft.name !== device.name ||
      draft.vendor !== (device.vendor ?? '') ||
      draft.model !== (device.model ?? '') ||
      draft.assetTag !== (device.assetTag ?? '') ||
      draft.serialNumber !== (device.serialNumber ?? '') ||
      draft.wattage !== device.wattage ||
      draft.warrantyEol !== (device.warrantyEol ?? '') ||
      draft.face !== device.face ||
      draft.responsible !== (device.customFields['responsible'] ?? '') ||
      JSON.stringify(draft.tags) !== JSON.stringify(device.tags)
    : false

  if (!device) return null

  const onSave = () => {
    update.mutate(
      {
        tenantId,
        id: device.id,
        patch: {
          name: draft.name,
          vendor: draft.vendor || undefined,
          model: draft.model || undefined,
          assetTag: draft.assetTag || undefined,
          serialNumber: draft.serialNumber || undefined,
          wattage: draft.wattage,
          warrantyEol: draft.warrantyEol || undefined,
          face: draft.face,
          tags: draft.tags,
          customFields: {
            ...device.customFields,
            responsible: draft.responsible,
          },
        },
        actorId: currentUserId,
        actorName,
      },
    )
  }

  const onDelete = async () => {
    const ok = await confirm({
      title: `Remove ${device.name}?`,
      description: 'This will also remove its ports and any attached cables.',
      confirmText: 'Remove',
      tone: 'danger',
    })
    if (!ok) return
    remove.mutate({
      id: device.id,
      actorId: currentUserId,
      actorName,
      tenantId,
    }, { onSuccess: onClose })
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Settings
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex shrink-0 border-b border-slate-200 dark:border-slate-800">
        {([
          { key: 'general', label: 'General', icon: Pencil },
          { key: 'photos', label: 'Photos', icon: ImageIcon },
          { key: 'notes', label: 'Notes', icon: FileText },
          { key: 'rules', label: 'Rules', icon: Tag },
        ] as Array<{ key: Tab; label: string; icon: typeof Pencil }>).map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 border-b-2 px-3 py-2 text-xs transition-colors ${
                tab === t.key
                  ? 'border-brand-500 text-brand-700 dark:text-brand-300'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="mx-auto size-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'general' && (
          <div className="space-y-3">
            {device.kind === 'patchbox-cassette' && (
              <PatchboxButton device={device} />
            )}
            <Field label="ID" mono>
              <div className="font-mono text-xs text-slate-500">{device.id}</div>
            </Field>

            <Field label="Name" required>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>

            <Field label="Location">
              <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800/40">
                <Building2 className="size-3.5 text-slate-400" />
                <span>{device.rackId}</span>
              </div>
            </Field>

            <Field label="Responsible person">
              <Select
                value={draft.responsible || undefined}
                onValueChange={(v) => setDraft({ ...draft, responsible: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  {tenantUsers.map((u) => (
                    <SelectItem key={u.id} value={u.name}>
                      <div className="flex items-center gap-2">
                        <User className="size-3" />
                        {u.name} <span className="text-slate-400">({u.role})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Rack units">
                <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800/40">
                  U{device.uStart}–U{device.uStart + device.uHeight - 1} · {device.uHeight}U
                </div>
              </Field>
              <Field label="Face">
                <Select
                  value={draft.face}
                  onValueChange={(v) =>
                    setDraft({ ...draft, face: v as FrontBack })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="front">Front</SelectItem>
                    <SelectItem value="rear">Rear</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Manufacturer">
              <Input
                value={draft.vendor}
                onChange={(e) => setDraft({ ...draft, vendor: e.target.value })}
                placeholder="e.g. Cisco"
              />
            </Field>
            <Field label="Model name">
              <Input
                value={draft.model}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                placeholder="e.g. C9300-48P"
              />
            </Field>
            <Field label="Serial number">
              <Input
                value={draft.serialNumber}
                onChange={(e) =>
                  setDraft({ ...draft, serialNumber: e.target.value })
                }
                placeholder="optional"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Wattage (W)">
                <Input
                  type="number"
                  min={0}
                  value={draft.wattage ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      wattage: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                />
              </Field>
              <Field label="Asset tag">
                <Input
                  value={draft.assetTag}
                  onChange={(e) =>
                    setDraft({ ...draft, assetTag: e.target.value })
                  }
                  placeholder="ASSET-0001"
                />
              </Field>
            </div>

            <Field label="Warranty EoL">
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  type="date"
                  className="pl-8"
                  value={draft.warrantyEol}
                  onChange={(e) =>
                    setDraft({ ...draft, warrantyEol: e.target.value })
                  }
                />
              </div>
            </Field>

            <Field label="Tags">
              <TagsInput
                value={draft.tags}
                onChange={(next) => setDraft({ ...draft, tags: next })}
                suggestions={['production', 'staging', 'core', 'edge', 'wireless', 'iot', 'critical', 'dr']}
              />
            </Field>

            <PortListSection deviceId={device.id} />

            <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
              <Button
                size="sm"
                variant="ghost"
                className="text-rose-600 hover:text-rose-700"
                onClick={onDelete}
              >
                <Trash2 className="size-4" />
                Remove
              </Button>
              <Button size="sm" disabled={!isDirty || update.isPending} onClick={onSave}>
                <Save className="size-4" />
                {update.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        )}

        {tab === 'photos' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Open the <em>Notes &amp; Images</em> tab on the rack view to attach
              photos with URLs.
            </p>
          </div>
        )}

        {tab === 'notes' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Open the <em>Notes &amp; Images</em> tab on the rack view to add notes
              to this device.
            </p>
          </div>
        )}

        {tab === 'rules' && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200">
            Place custom rules and SLAs on devices here. (Coming soon.)
          </div>
        )}
      </div>
    </aside>
  )
}

// === Port list with cable color, VLAN, disconnect ===

const CABLE_COLOR_PRESETS: Array<{ name: string; hex: string }> = [
  { name: 'Default', hex: '' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Green', hex: '#22c55e' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Red', hex: '#ef4444' },
  { name: 'Purple', hex: '#a855f7' },
  { name: 'Cyan', hex: '#06b6d4' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Yellow', hex: '#eab308' },
]

function PortListSection({ deviceId }: { deviceId: DeviceId }) {
  const ports = usePorts().data ?? []
  const cables = useCables().data ?? []
  const vlans = useVlans().data ?? []
  const tenantId = useTenantStore((s) => s.currentTenantId)
  const tenantUsers = useUsers(tenantId).data ?? []
  const currentUser = tenantUsers.find((u) => u.id === useTenantStore.getState().currentUserId)
  const scope = useTenantScope()
  const updateColor = useUpdateCableColor()
  const updatePortMut = useUpdatePort()
  const disconnect = useDisconnectPort()
  const [editingId, setEditingId] = useState<string | null>(null)

  const devicePorts = ports
    .filter((p) => p.deviceId === deviceId)
    .sort((a, b) => a.position - b.position)
  const cableById = new Map(cables.map((c) => [c.id, c] as const))
  const vlanById = new Map<string, Vlan>(vlans.map((v) => [v.id, v] as const))

  if (devicePorts.length === 0) {
    return (
      <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Ports
        </h4>
        <p className="text-xs text-slate-500">No ports on this device.</p>
      </div>
    )
  }

  return (
    <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
      <h4 className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
        <Plug className="size-3" />
        Ports ({devicePorts.length})
      </h4>
      <ul className="space-y-1">
        {devicePorts.map((p) => {
          const cable = p.cableId ? cableById.get(p.cableId) : undefined
          const otherPort = cable
            ? cable.portA === p.id
              ? ports.find((x) => x.id === cable.portB)
              : ports.find((x) => x.id === cable.portA)
            : undefined
          const otherDevice = otherPort
            ? scope.devices.find((d) => d.id === otherPort.deviceId)
            : undefined
          const vlan = p.vlanId ? vlanById.get(p.vlanId) : undefined
          const cableColor = cable ? (cable as any).color : null
          const isEditing = editingId === p.id
          return (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-800"
            >
              {isEditing ? (
                <input
                  autoFocus
                  defaultValue={p.label}
                  onBlur={(e) => {
                    const v = e.target.value.trim().toUpperCase()
                    if (v && v !== p.label) {
                      updatePortMut.mutate({
                        tenantId,
                        id: p.id as any,
                        patch: { label: v },
                        actorId: useTenantStore.getState().currentUserId,
                        actorName: currentUser?.name ?? 'System',
                      })
                    }
                    setEditingId(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  className="h-6 w-24 rounded border border-brand-400 bg-white px-1 font-mono text-xs text-slate-900 outline-none dark:bg-slate-900 dark:text-slate-100"
                />
              ) : (
                <button
                  onClick={() => setEditingId(p.id)}
                  className="rounded px-1 font-mono font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
                  title="Click to rename (uppercase)"
                >
                  {p.label}
                </button>
              )}
              <span className="text-slate-400">·</span>
              <span className="text-slate-500">{p.kind}</span>
              {vlan ? (
                <button
                  onClick={() => {
                    // Clear VLAN
                    updatePortMut.mutate({
                      tenantId,
                      id: p.id as any,
                      patch: { vlanId: null as any, vlanMode: null as any },
                      actorId: useTenantStore.getState().currentUserId,
                      actorName: currentUser?.name ?? 'System',
                    })
                  }}
                  className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-medium text-brand-800 hover:bg-brand-200 dark:bg-brand-900/40 dark:text-brand-200 dark:hover:bg-brand-900/60"
                  title={`VLAN ${vlan.vid}: ${vlan.name} (click to clear)`}
                >
                  VLAN {vlan.vid}
                </button>
              ) : (
                <Select
                  value={p.vlanId ?? 'none'}
                  onValueChange={(v) => {
                    updatePortMut.mutate({
                      tenantId,
                      id: p.id as any,
                      patch: {
                        vlanId: v === 'none' ? null : (v as any),
                        vlanMode: v === 'none' ? null : 'access',
                      },
                      actorId: useTenantStore.getState().currentUserId,
                      actorName: currentUser?.name ?? 'System',
                    })
                  }}
                >
                  <SelectTrigger className="h-5 w-20 px-1 text-[10px]">
                    <SelectValue placeholder="VLAN" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-xs">
                      —
                    </SelectItem>
                    {vlans
                      .filter((v) => v.tenantId === tenantId)
                      .map((v) => (
                        <SelectItem key={v.id} value={v.id} className="text-xs">
                          VLAN {v.vid} {v.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
              <span className="ml-auto flex items-center gap-1">
                {cable && (
                  <>
                    <CableColorSwatch
                      color={cableColor}
                      onChange={(hex) => {
                        if (!cable) return
                        updateColor.mutate({
                          tenantId,
                          cableId: cable.id,
                          color: hex,
                          actorId: useTenantStore.getState().currentUserId,
                          actorName: currentUser?.name ?? 'System',
                        })
                      }}
                    />
                    <span
                      className="hidden text-slate-500 sm:inline"
                      title={
                        otherDevice
                          ? `${otherDevice.name} · ${otherPort?.label ?? ''}`
                          : ''
                      }
                    >
                      → {otherDevice?.name ?? '?'}
                    </span>
                    <button
                      onClick={() =>
                        disconnect.mutate({
                          cableId: cable.id,
                          actorId: useTenantStore.getState().currentUserId,
                          actorName: currentUser?.name ?? 'System',
                          tenantId,
                        })
                      }
                      className="rounded p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      title="Disconnect cable"
                    >
                      <Unplug className="size-3" />
                    </button>
                  </>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      {devicePorts.some((p) => !p.cableId) && (
        <p className="mt-2 text-[11px] text-slate-500">
          Tip: click{' '}
          <span className="rounded bg-slate-200 px-1 font-mono dark:bg-slate-700">
            Connect
          </span>{' '}
          in the rack header to wire two ports.
        </p>
      )}
    </div>
  )
}

function CableColorSwatch({
  color,
  onChange,
}: {
  color?: string | null
  onChange: (hex: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="size-4 rounded border-2 border-slate-300 dark:border-slate-700"
        style={{ background: color || 'transparent' }}
        title="Cable color"
      />
      {open && (
        <div
          className="absolute right-0 top-6 z-50 flex items-center gap-1 rounded-md border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          onMouseLeave={() => setOpen(false)}
        >
          {CABLE_COLOR_PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => {
                onChange(p.hex || null)
                setOpen(false)
              }}
              className={cn(
                'size-5 rounded border-2',
                p.hex === '' && 'border-dashed border-slate-400',
              )}
              style={{ background: p.hex || 'white' }}
              title={p.name}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PatchboxButton({ device }: { device: import('@/lib/types').Device }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        <PlugZap className="size-4" />
        Configure patchbox.one
      </Button>
      <PatchboxConfigurator
        device={device}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}

function Field({
  label,
  required,
  mono,
  children,
}: {
  label: string
  required?: boolean
  mono?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <Label className={cn('text-xs', mono && 'font-mono')}>
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </Label>
      {children}
    </div>
  )
}

