import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
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
import { useDevice, useRack, useUpdateDevice } from '@/lib/queries'
import { useTenantStore } from '@/store/tenant-store'
import { useUsers } from '@/lib/queries'
import { TagsInput } from '@/components/ui/tags-input'
import type { DeviceId } from '@/lib/types'

const schema = z.object({
  name: z.string().min(1, 'Name required').max(80),
  model: z.string().max(120).optional(),
  vendor: z.string().max(80).optional(),
  uStart: z.coerce.number().int().min(1).max(60),
  face: z.enum(['front', 'rear']),
  assetTag: z.string().max(60).optional(),
  serialNumber: z.string().max(80).optional(),
  warrantyEol: z.string().optional(),
  wattage: z.coerce.number().int().min(0).max(50000).optional(),
  tags: z.array(z.string()).default([]),
})

type FormValues = z.infer<typeof schema>

interface Props {
  deviceId: DeviceId | null
  onOpenChange: (open: boolean) => void
}

export function EditDeviceDialog({ deviceId, onOpenChange }: Props) {
  const open = deviceId !== null
  const tenantId = useTenantStore((s) => s.currentTenantId)
  const currentUserId = useTenantStore((s) => s.currentUserId)
  const tenantUsers = useUsers(tenantId).data ?? []
  const currentUser = tenantUsers.find((u) => u.id === currentUserId)
  const actorName = currentUser?.name ?? 'System'

  const device = useDevice(deviceId ?? undefined).data
  const rack = useRack(device?.rackId).data
  const update = useUpdateDevice()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      model: '',
      vendor: '',
      uStart: 1,
      face: 'front',
      assetTag: '',
      serialNumber: '',
      warrantyEol: '',
      wattage: undefined,
      tags: [],
    },
  })

  useEffect(() => {
    if (device) {
      form.reset({
        name: device.name,
        model: device.model ?? '',
        vendor: device.vendor ?? '',
        uStart: device.uStart,
        face: device.face,
        assetTag: device.assetTag ?? '',
        serialNumber: device.serialNumber ?? '',
        warrantyEol: device.warrantyEol ?? '',
        wattage: device.wattage,
        tags: device.tags,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.id])

  const onSubmit = (values: FormValues) => {
    if (!deviceId) return
    update.mutate(
      {
        tenantId,
        id: deviceId,
        patch: {
          name: values.name,
          model: values.model || undefined,
          vendor: values.vendor || undefined,
          uStart: values.uStart,
          face: values.face,
          assetTag: values.assetTag || undefined,
          serialNumber: values.serialNumber || undefined,
          warrantyEol: values.warrantyEol || undefined,
          wattage: values.wattage,
          tags: values.tags,
        },
        actorId: currentUserId,
        actorName,
      },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  if (!device) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit device</DialogTitle>
          <DialogDescription>
            Update metadata, tags, asset info, and lifecycle dates.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input {...form.register('name')} />
              {form.formState.errors.name && (
                <p className="text-xs text-rose-600">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Vendor</Label>
              <Input placeholder="e.g. Cisco" {...form.register('vendor')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Model</Label>
              <Input placeholder="e.g. C9300-48P" {...form.register('model')} />
            </div>
            <div className="space-y-1">
              <Label>Wattage (W)</Label>
              <Input
                type="number"
                min={0}
                max={50000}
                placeholder="optional"
                {...form.register('wattage', { valueAsNumber: true })}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Start U</Label>
              <Input
                type="number"
                min={1}
                max={rack?.uHeight ?? 60}
                {...form.register('uStart', { valueAsNumber: true })}
              />
              {rack && (
                <p className="text-[10px] text-slate-500">Rack: {rack.uHeight}U</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Face</Label>
              <Select
                value={form.watch('face')}
                onValueChange={(v) =>
                  form.setValue('face', v as FormValues['face'])
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
            </div>
            <div className="space-y-1">
              <Label>Asset tag</Label>
              <Input
                placeholder="ASSET-0001"
                {...form.register('assetTag')}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Serial #</Label>
              <Input
                placeholder="optional"
                {...form.register('serialNumber')}
              />
            </div>
            <div className="space-y-1">
              <Label>Warranty EoL</Label>
              <Input
                type="date"
                placeholder="optional"
                {...form.register('warrantyEol')}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Tags</Label>
            <TagsInput
              value={form.watch('tags')}
              onChange={(next) => form.setValue('tags', next)}
              suggestions={['production', 'staging', 'core', 'edge', 'wireless', 'iot', 'critical', 'dr']}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}