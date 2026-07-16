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
import { useCreateReservation } from '@/lib/queries'
import { useTenantStore } from '@/store/tenant-store'
import { useUsers } from '@/lib/queries'
import type { Rack, RackReservation, RackId } from '@/lib/types'

const schema = z.object({
  uStart: z.coerce.number().int().min(1),
  uHeight: z.coerce.number().int().min(1).max(60),
  label: z.string().min(1, 'Label required').max(80),
  color: z.string().default('#fbbf24'),
  expectedBy: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  rack: Rack
  open: boolean
  onOpenChange: (open: boolean) => void
}

const COLORS = ['#fbbf24', '#a855f7', '#fb923c', '#22d3ee', '#34d399', '#f43f5e']

export function ReservationDialog({ rack, open, onOpenChange }: Props) {
  const tenantId = useTenantStore((s) => s.currentTenantId)
  const currentUserId = useTenantStore((s) => s.currentUserId)
  const tenantUsers = useUsers(tenantId).data ?? []
  const currentUser = tenantUsers.find((u) => u.id === currentUserId)
  const create = useCreateReservation()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      uStart: 1,
      uHeight: 1,
      label: '',
      color: '#fbbf24',
    },
  })

  const onSubmit = (values: FormValues) => {
    create.mutate(
      {
        tenantId,
        rackId: rack.id as RackId,
        uStart: values.uStart,
        uHeight: values.uHeight,
        label: values.label,
        color: values.color,
        expectedBy: values.expectedBy || undefined,
        actorId: currentUserId,
        actorName: currentUser?.name ?? 'System',
      },
      { onSuccess: () => { form.reset(); onOpenChange(false) } },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reserve U range</DialogTitle>
          <DialogDescription>
            Reserve a contiguous range of U positions in {rack.name} for planned
            gear. The band will render in the rack view.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Start U</Label>
              <Input
                type="number"
                min={1}
                max={rack.uHeight}
                {...form.register('uStart', { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-1">
              <Label>Height (U)</Label>
              <Input
                type="number"
                min={1}
                max={rack.uHeight}
                {...form.register('uHeight', { valueAsNumber: true })}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Label</Label>
            <Input
              placeholder="e.g. Spare slots (planned: 2x C9300)"
              {...form.register('label')}
            />
            {form.formState.errors.label && (
              <p className="text-xs text-rose-600">
                {form.formState.errors.label.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Color</Label>
              <div className="flex gap-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => form.setValue('color', c)}
                    className={`size-7 rounded border-2 ${
                      form.watch('color') === c ? 'border-slate-900' : 'border-transparent'
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Expected by</Label>
              <Input type="date" {...form.register('expectedBy')} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Reserving…' : 'Reserve'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface ListProps {
  rack: Rack
  reservations: RackReservation[]
  onRelease: (id: RackReservation['id']) => void
}

export function ReservationList({ rack, reservations, onRelease }: ListProps) {
  if (reservations.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        No reservations in {rack.name}.
      </p>
    )
  }
  return (
    <ul className="space-y-1.5">
      {reservations.map((r) => (
        <li
          key={r.id}
          className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
        >
          <div className="flex items-center gap-2">
            <span
              className="inline-block size-3 rounded"
              style={{ background: r.color }}
            />
            <span className="font-medium">{r.label}</span>
            <span className="text-xs text-slate-500">
              U{r.uStart}–U{r.uStart + r.uHeight - 1}
            </span>
          </div>
          <button
            onClick={() => onRelease(r.id)}
            className="text-xs text-rose-600 hover:text-rose-700"
          >
            Release
          </button>
        </li>
      ))}
    </ul>
  )
}