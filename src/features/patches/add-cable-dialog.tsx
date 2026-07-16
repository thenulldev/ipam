import { useEffect, useMemo } from 'react'
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
import { useConnectPorts, useDevices, usePorts } from '@/lib/queries'
import { useTenantScope } from '@/lib/tenant-scope'
import { useTenantStore } from '@/store/tenant-store'
import { useUsers } from '@/lib/queries'
import type { CableKind, DeviceId, PortId } from '@/lib/types'

const schema = z.object({
  kind: z.enum([
    'cat5e',
    'cat6',
    'cat6a',
    'fiber-sm-os2',
    'fiber-mm-om3',
    'dac',
    'power-c13',
    'power-c19',
    'console-usb',
  ]),
  lengthM: z.coerce.number().positive().max(1000).optional(),
  label: z.string().max(120).optional(),
  deviceAId: z.string().min(1, 'Pick a device for port A'),
  portAId: z.string().min(1, 'Pick port A'),
  deviceBId: z.string().min(1, 'Pick a device for port B'),
  portBId: z.string().min(1, 'Pick port B'),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialPortAId?: PortId
  initialPortBId?: PortId
}

export function AddCableDialog({
  open,
  onOpenChange,
  initialPortAId,
  initialPortBId,
}: Props) {
  const tenantId = useTenantStore((s) => s.currentTenantId)
  const currentUserId = useTenantStore((s) => s.currentUserId)
  const tenantUsers = useUsers(tenantId).data ?? []
  const currentUser = tenantUsers.find((u) => u.id === currentUserId)
  const actorName = currentUser?.name ?? 'System'
  const scope = useTenantScope()
  const allPorts = usePorts().data ?? []
  const allDevices = useDevices().data ?? []

  const connect = useConnectPorts()

  // Pre-resolve initial port → device for default values.
  const initialPortA = allPorts.find((p) => p.id === initialPortAId)
  const initialPortB = allPorts.find((p) => p.id === initialPortBId)
  const initialDeviceA = initialPortA
    ? allDevices.find((d) => d.id === initialPortA.deviceId)
    : undefined
  const initialDeviceB = initialPortB
    ? allDevices.find((d) => d.id === initialPortB.deviceId)
    : undefined

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: 'cat6a',
      deviceAId: initialDeviceA?.id ?? '',
      portAId: initialPortA?.id ?? '',
      deviceBId: initialDeviceB?.id ?? '',
      portBId: initialPortB?.id ?? '',
    },
  })

  // Reset form whenever the dialog is reopened
  useEffect(() => {
    if (open) {
      form.reset({
        kind: 'cat6a',
        deviceAId: initialDeviceA?.id ?? '',
        portAId: initialPortA?.id ?? '',
        deviceBId: initialDeviceB?.id ?? '',
        portBId: initialPortB?.id ?? '',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const watchedDeviceA = form.watch('deviceAId')
  const watchedDeviceB = form.watch('deviceBId')

  const portsA = useMemo(
    () =>
      watchedDeviceA
        ? allPorts.filter((p) => p.deviceId === (watchedDeviceA as DeviceId))
        : [],
    [allPorts, watchedDeviceA],
  )
  const portsB = useMemo(
    () =>
      watchedDeviceB
        ? allPorts.filter((p) => p.deviceId === (watchedDeviceB as DeviceId))
        : [],
    [allPorts, watchedDeviceB],
  )

  const onSubmit = (values: FormValues) => {
    if (values.portAId === values.portBId) {
      form.setError('portBId', { message: 'Ports must differ' })
      return
    }
    connect.mutate(
      {
        tenantId,
        cableKind: values.kind as CableKind,
        portAId: values.portAId as PortId,
        portBId: values.portBId as PortId,
        lengthM: values.lengthM,
        label: values.label || undefined,
        actorId: currentUserId,
        actorName,
      },
      {
        onSuccess: () => {
          form.reset()
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect two ports</DialogTitle>
          <DialogDescription>
            Create a patch cable between any two ports in the current tenant.
            Both ports must be free (not already connected).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Device A</Label>
              <Select
                value={watchedDeviceA || undefined}
                onValueChange={(v) => {
                  form.setValue('deviceAId', v)
                  form.setValue('portAId', '')
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick a device…" />
                </SelectTrigger>
                <SelectContent>
                  {scope.devices.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                      <span className="ml-2 text-slate-400">· {d.kind}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.deviceAId && (
                <p className="text-xs text-rose-600">
                  {form.formState.errors.deviceAId.message}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Port A</Label>
              <Select
                value={form.watch('portAId') || undefined}
                onValueChange={(v) => form.setValue('portAId', v)}
                disabled={!watchedDeviceA}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick port A…" />
                </SelectTrigger>
                <SelectContent>
                  {portsA.map((p) => (
                    <SelectItem
                      key={p.id}
                      value={p.id}
                      disabled={!!p.cableId}
                    >
                      {p.label}
                      {p.cableId && (
                        <span className="ml-2 text-rose-500">· in use</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.portAId && (
                <p className="text-xs text-rose-600">
                  {form.formState.errors.portAId.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Device B</Label>
              <Select
                value={watchedDeviceB || undefined}
                onValueChange={(v) => {
                  form.setValue('deviceBId', v)
                  form.setValue('portBId', '')
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick a device…" />
                </SelectTrigger>
                <SelectContent>
                  {scope.devices.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                      <span className="ml-2 text-slate-400">· {d.kind}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.deviceBId && (
                <p className="text-xs text-rose-600">
                  {form.formState.errors.deviceBId.message}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Port B</Label>
              <Select
                value={form.watch('portBId') || undefined}
                onValueChange={(v) => form.setValue('portBId', v)}
                disabled={!watchedDeviceB}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick port B…" />
                </SelectTrigger>
                <SelectContent>
                  {portsB.map((p) => (
                    <SelectItem
                      key={p.id}
                      value={p.id}
                      disabled={!!p.cableId}
                    >
                      {p.label}
                      {p.cableId && (
                        <span className="ml-2 text-rose-500">· in use</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.portBId && (
                <p className="text-xs text-rose-600">
                  {form.formState.errors.portBId.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select
                value={form.watch('kind')}
                onValueChange={(v) => form.setValue('kind', v as FormValues['kind'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {schema.shape.kind.options.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Length (m)</Label>
              <Input
                type="number"
                step={0.1}
                min={0}
                {...form.register('lengthM')}
                placeholder="optional"
              />
            </div>
            <div className="space-y-1">
              <Label>Label</Label>
              <Input {...form.register('label')} placeholder="optional" />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={connect.isPending}>
              {connect.isPending ? 'Connecting…' : 'Connect ports'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}