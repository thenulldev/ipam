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
import { useConnectPorts } from '@/lib/queries'
import { useTenantStore } from '@/store/tenant-store'
import { useUsers } from '@/lib/queries'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { CableKind, PortId } from '@/lib/types'

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
})

type FormValues = z.infer<typeof schema>

interface PortRef {
  portId: PortId
  portLabel: string
  deviceName: string
  rackName: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  portA: PortRef | null
  portB: PortRef | null
}

export function ConnectConfirmDialog({ open, onOpenChange, portA, portB }: Props) {
  const tenantId = useTenantStore((s) => s.currentTenantId)
  const currentUserId = useTenantStore((s) => s.currentUserId)
  const tenantUsers = useUsers(tenantId).data ?? []
  const currentUser = tenantUsers.find((u) => u.id === currentUserId)
  const actorName = currentUser?.name ?? 'System'

  const connect = useConnectPorts()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { kind: 'cat6a' },
  })

  const onSubmit = (values: FormValues) => {
    if (!portA || !portB) return
    connect.mutate(
      {
        tenantId,
        cableKind: values.kind as CableKind,
        portAId: portA.portId,
        portBId: portB.portId,
        lengthM: values.lengthM,
        label: values.label || undefined,
        actorId: currentUserId,
        actorName,
      },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // On phones, stretch to a full-width bottom sheet so the form and
          // its CTAs are reachable with one thumb. Escape/scrim/focus are
          // preserved by Radix Dialog + the showCloseButton default.
          'max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:left-0 max-md:right-0 max-md:translate-x-0 max-md:translate-y-0 max-md:max-w-none max-md:rounded-b-none max-md:rounded-t-xl max-md:max-h-[90vh] max-md:overflow-y-auto',
        )}
      >
        <DialogHeader>
          <DialogTitle>Connect ports</DialogTitle>
          <DialogDescription>
            Confirm cable between the two ports you selected.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-800/40">
          <PortSummary label="Port A" port={portA} />
          <div className="text-center text-xs text-slate-400">↕</div>
          <PortSummary label="Port B" port={portB} />
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select
                value={form.watch('kind')}
                onValueChange={(v) =>
                  form.setValue('kind', v as FormValues['kind'])
                }
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
                placeholder="optional"
                {...form.register('lengthM')}
              />
            </div>
            <div className="space-y-1">
              <Label>Label</Label>
              <Input placeholder="optional" {...form.register('label')} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={connect.isPending}>
              {connect.isPending ? 'Connecting…' : 'Connect'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PortSummary({ label, port }: { label: string; port: PortRef | null }) {
  if (!port) return null
  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline">{label}</Badge>
      <span className="font-mono">{port.portLabel}</span>
      <span className="text-slate-500">on</span>
      <span className="font-medium">{port.deviceName}</span>
      <span className="text-slate-500">·</span>
      <span className="text-slate-500">{port.rackName}</span>
    </div>
  )
}