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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAssignAddress, useDevices, usePorts } from '@/lib/queries'
import { useTenantScope } from '@/lib/tenant-scope'
import { useTenantStore } from '@/store/tenant-store'
import { useUsers } from '@/lib/queries'
import type { DeviceId, IpAddress, PortId } from '@/lib/types'

const schema = z.object({
  deviceId: z.string().min(1, 'Pick a device'),
  portId: z.string().min(1, 'Pick a port'),
})

type FormValues = z.infer<typeof schema>

interface Props {
  address: IpAddress | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AssignAddressDialog({ address, open, onOpenChange }: Props) {
  const tenantId = useTenantStore((s) => s.currentTenantId)
  const currentUserId = useTenantStore((s) => s.currentUserId)
  const tenantUsers = useUsers(tenantId).data ?? []
  const currentUser = tenantUsers.find((u) => u.id === currentUserId)
  const actorName = currentUser?.name ?? 'System'
  const scope = useTenantScope()
  const allPorts = usePorts().data ?? []
  const allDevices = useDevices().data ?? []

  const assign = useAssignAddress()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { deviceId: '', portId: '' },
  })

  useEffect(() => {
    if (open) form.reset({ deviceId: '', portId: '' })
  }, [open, form])

  const watchedDeviceId = form.watch('deviceId')
  const portsForDevice = useMemo(
    () =>
      watchedDeviceId
        ? allPorts.filter(
            (p) =>
              p.deviceId === (watchedDeviceId as DeviceId) && !p.ipAddressId,
          )
        : [],
    [allPorts, watchedDeviceId],
  )

  // Pre-fill device when address already has a port
  const existingPort = address?.assignedPortId
    ? allPorts.find((p) => p.id === address.assignedPortId)
    : undefined
  const existingDevice = existingPort
    ? allDevices.find((d) => d.id === existingPort.deviceId)
    : undefined
  useEffect(() => {
    if (open && existingDevice) {
      form.reset({ deviceId: existingDevice.id, portId: existingPort!.id })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const onSubmit = (values: FormValues) => {
    if (!address) return
    assign.mutate(
      {
        tenantId,
        addressId: address.id,
        portId: values.portId as PortId,
        actorId: currentUserId,
        actorName,
      },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign IP address</DialogTitle>
          <DialogDescription>
            {address && (
              <span>
                Assign{' '}
                <span className="font-mono font-semibold">
                  {address.address}
                </span>{' '}
                to a port. Ports that already hold an IP are excluded.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1">
            <Label>Device</Label>
            <Select
              value={watchedDeviceId || undefined}
              onValueChange={(v) => {
                form.setValue('deviceId', v)
                form.setValue('portId', '')
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
          </div>

          <div className="space-y-1">
            <Label>Port</Label>
            <Select
              value={form.watch('portId') || undefined}
              onValueChange={(v) => form.setValue('portId', v)}
              disabled={!watchedDeviceId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a port…" />
              </SelectTrigger>
              <SelectContent>
                {portsForDevice.length === 0 && (
                  <div className="px-3 py-2 text-xs text-slate-500">
                    No free ports on this device.
                  </div>
                )}
                {portsForDevice.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label} <span className="text-slate-400">· {p.kind}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={assign.isPending}>
              {assign.isPending ? 'Assigning…' : 'Assign'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}