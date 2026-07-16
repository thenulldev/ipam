import { useEffect, useState } from 'react'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { usePorts, useUpdatePort } from '@/lib/queries'
import { useTenantStore } from '@/store/tenant-store'
import { useUsers } from '@/lib/queries'
import { Settings2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import type { Device, Port } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Props {
  device: Device
  open: boolean
  onOpenChange: (open: boolean) => void
}

const schema = z.object({
  type: z.enum(['copper', 'fiber', 'empty']),
  cableType: z.string().optional(),
  cableLengthM: z.coerce.number().min(0).max(100).optional(),
  cableColorHex: z.string().optional(),
  connectorTop: z.string().optional(),
  connectorBottom: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

const COLORS = [
  { name: 'White', hex: '#ffffff' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Red', hex: '#ef4444' },
  { name: 'Green', hex: '#22c55e' },
  { name: 'Yellow', hex: '#eab308' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Purple', hex: '#a855f7' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Black', hex: '#0f172a' },
  { name: 'Gray', hex: '#94a3b8' },
]

export function PatchboxConfigurator({ device, open, onOpenChange }: Props) {
  const tenantId = useTenantStore((s) => s.currentTenantId)
  const tenantUsers = useUsers(tenantId).data ?? []
  const currentUser = tenantUsers.find(
    (u) => u.id === useTenantStore.getState().currentUserId,
  )
  const updatePortMut = useUpdatePort()
  const ports = usePorts().data ?? []
  const devicePorts = ports
    .filter((p) => p.deviceId === device.id)
    .sort((a, b) => a.position - b.position)

  const [activeSlot, setActiveSlot] = useState<Port | null>(null)
  const [draft, setDraft] = useState<FormValues>({
    type: 'empty',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (activeSlot) {
      const c = activeSlot.cassette
      setDraft({
        type: c?.type ?? 'empty',
        cableType: c?.cableType ?? '',
        cableLengthM: c?.cableLengthM,
        cableColorHex: c?.cableColorHex ?? '',
        connectorTop: c?.connectorTop ?? '',
        connectorBottom: c?.connectorBottom ?? '',
      })
    }
  }, [activeSlot])

  const onSave = async () => {
    if (!activeSlot) return
    setSaving(true)
    try {
      const cassette =
        draft.type === 'empty'
          ? undefined
          : {
              slot: activeSlot.position,
              type: draft.type,
              cableType: draft.cableType || undefined,
              cableLengthM: draft.cableLengthM,
              cableColorHex: draft.cableColorHex || undefined,
              connectorTop: draft.connectorTop || undefined,
              connectorBottom: draft.connectorBottom || undefined,
            }
      updatePortMut.mutate(
        {
          tenantId,
          id: activeSlot.id,
          patch: { cassette } as any,
          actorId: useTenantStore.getState().currentUserId,
          actorName: currentUser?.name ?? 'System',
        },
        {
          onSettled: () => setSaving(false),
        },
      )
      // Update local activeSlot to reflect the change
      setActiveSlot({ ...activeSlot, cassette })
    } catch (err) {
      toast.error('Could not save cassette', String(err))
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog open={open && !activeSlot} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="size-4" />
              Configure {device.name}
            </DialogTitle>
            <DialogDescription>
              Each slot holds a swappable cassette. Configure cable type,
              length, color, and connector type per slot.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {devicePorts.map((p) => {
              const c = p.cassette
              const isCopper = c?.type === 'copper'
              const isFiber = c?.type === 'fiber'
              return (
                <button
                  key={p.id}
                  onClick={() => setActiveSlot(p)}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-md border-2 p-2 text-left transition-colors',
                    isCopper
                      ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30'
                      : isFiber
                        ? 'border-cyan-300 bg-cyan-50 dark:border-cyan-700 dark:bg-cyan-950/30'
                        : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
                    'hover:border-brand-400',
                  )}
                >
                  <span className="font-mono text-xs font-semibold">
                    Slot {p.position}
                  </span>
                  <span className="text-[10px] text-slate-500">{p.label}</span>
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase',
                      isCopper
                        ? 'bg-amber-200 text-amber-900'
                        : isFiber
                          ? 'bg-cyan-200 text-cyan-900'
                          : 'bg-slate-200 text-slate-600',
                    )}
                  >
                    {c?.type ?? 'empty'}
                  </span>
                  {c?.cableColorHex && (
                    <span
                      className="mt-1 inline-block size-3 rounded border border-slate-300"
                      style={{ background: c.cableColorHex }}
                    />
                  )}
                </button>
              )
            })}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Slot configuration dialog */}
      <Dialog
        open={open && activeSlot !== null}
        onOpenChange={(o) => {
          if (!o) {
            setActiveSlot(null)
            onOpenChange(false)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Configure Slot {activeSlot?.position} —{' '}
              <span className="font-mono text-base">{activeSlot?.label}</span>
            </DialogTitle>
            <DialogDescription>
              Set cassette type, cable, and connectors. Locked slots have
              connections — disconnect them first to edit.
            </DialogDescription>
          </DialogHeader>

          {activeSlot?.cableId && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200">
              This slot has an active connection. Disconnect the cable first
              to edit its cassette config.
            </div>
          )}

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Cassette type</Label>
              <Select
                value={draft.type}
                onValueChange={(v) =>
                  setDraft({ ...draft, type: v as FormValues['type'] })
                }
                disabled={!!activeSlot?.cableId}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="empty">Empty</SelectItem>
                  <SelectItem value="copper">Copper</SelectItem>
                  <SelectItem value="fiber">Fiber</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {draft.type !== 'empty' && (
              <>
                <div className="space-y-1">
                  <Label>Cable type</Label>
                  <Input
                    placeholder={draft.type === 'copper' ? 'Cat6a' : 'OS2'}
                    value={draft.cableType ?? ''}
                    onChange={(e) =>
                      setDraft({ ...draft, cableType: e.target.value })
                    }
                    disabled={!!activeSlot?.cableId}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Length (m)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.1}
                      value={draft.cableLengthM ?? ''}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          cableLengthM: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                      disabled={!!activeSlot?.cableId}
                    />
                  </div>
                  {draft.type === 'copper' && (
                    <div className="space-y-1">
                      <Label>Cable color</Label>
                      <div className="flex flex-wrap gap-1">
                        {COLORS.map((c) => (
                          <button
                            key={c.hex}
                            onClick={() =>
                              setDraft({ ...draft, cableColorHex: c.hex })
                            }
                            className={cn(
                              'size-6 rounded border-2',
                              draft.cableColorHex === c.hex
                                ? 'border-slate-900'
                                : 'border-slate-300',
                            )}
                            style={{ background: c.hex }}
                            title={c.name}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {draft.type === 'fiber' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Top connector</Label>
                      <Select
                        value={draft.connectorTop ?? 'lc'}
                        onValueChange={(v) =>
                          setDraft({ ...draft, connectorTop: v })
                        }
                        disabled={!!activeSlot?.cableId}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="lc">LC</SelectItem>
                          <SelectItem value="sc">SC</SelectItem>
                          <SelectItem value="mtp">MTP/MPO</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Bottom connector</Label>
                      <Select
                        value={draft.connectorBottom ?? 'lc'}
                        onValueChange={(v) =>
                          setDraft({ ...draft, connectorBottom: v })
                        }
                        disabled={!!activeSlot?.cableId}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="lc">LC</SelectItem>
                          <SelectItem value="sc">SC</SelectItem>
                          <SelectItem value="mtp">MTP/MPO</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setActiveSlot(null)}
            >
              Back
            </Button>
            <Button
              onClick={onSave}
              disabled={saving || !!activeSlot?.cableId}
            >
              {saving ? 'Saving…' : 'Save slot'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}