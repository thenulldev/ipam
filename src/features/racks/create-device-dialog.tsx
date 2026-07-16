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
import {
  useCreateDeviceFromTemplate,
  useDeviceTemplate,
} from '@/lib/queries'
import { useQuery } from '@tanstack/react-query'
import * as api from '@/lib/api'
import * as q from '@/lib/queries'
import { useTenantScope } from '@/lib/tenant-scope'
import { useTenantStore } from '@/store/tenant-store'
import type { DeviceTemplate, Rack, RackId, TenantId } from '@/lib/types'

const schema = z.object({
  templateId: z.string().min(1, 'Pick a template'),
  rackId: z.string().min(1, 'Pick a rack'),
  name: z.string().min(1, 'Name required').max(80),
  uStart: z.coerce.number().int().min(1).max(60),
  face: z.enum(['front', 'rear']),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTemplateId?: string
  initialRackId?: RackId
}

export function CreateDeviceDialog({
  open,
  onOpenChange,
  initialTemplateId,
  initialRackId,
}: Props) {
  const tenantId = useTenantStore((s) => s.currentTenantId)
  const currentUserId = useTenantStore((s) => s.currentUserId)
  const templates = useDeviceTemplatesForCurrentTenant(tenantId)
  const racks = useTenantRacks()

  const create = useCreateDeviceFromTemplate()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      templateId: initialTemplateId ?? '',
      rackId: (initialRackId as unknown as string) ?? '',
      name: '',
      uStart: 1,
      face: 'front',
    },
  })

  const tplId = form.watch('templateId')
  const tplDetail = useDeviceTemplate(tplId as any)
  const portCount = tplDetail.data?.portGroups.reduce((s, g) => s + g.count, 0) ?? 0

  const onSubmit = (values: FormValues) => {
    create.mutate(
      {
        tenantId,
        templateId: values.templateId as any,
        rackId: values.rackId as unknown as RackId,
        name: values.name,
        uStart: values.uStart,
        face: values.face,
        actorId: currentUserId,
        actorName: 'You',
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New device from template</DialogTitle>
          <DialogDescription>
            Pick a template, give the device a name, and choose its rack + U
            position. Ports are auto-generated from the template.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <Field label="Template" error={form.formState.errors.templateId?.message}>
            <Select
              value={form.watch('templateId') || undefined}
              onValueChange={(v) => form.setValue('templateId', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a template…" />
              </SelectTrigger>
              <SelectContent>
                {(templates.data ?? []).map((t: DeviceTemplate) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Rack" error={form.formState.errors.rackId?.message}>
            <Select
              value={form.watch('rackId') || undefined}
              onValueChange={(v) => form.setValue('rackId', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a rack…" />
              </SelectTrigger>
              <SelectContent>
                {(racks.data ?? []).map((r: Rack) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name} ({r.uHeight}U)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Device name" error={form.formState.errors.name?.message}>
            <Input
              {...form.register('name')}
              placeholder="e.g. acc-sw-04"
              autoComplete="off"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Start U"
              error={form.formState.errors.uStart?.message}
            >
              <Input
                type="number"
                min={1}
                max={50}
                {...form.register('uStart', { valueAsNumber: true })}
              />
            </Field>

            <Field label="Face" error={form.formState.errors.face?.message}>
              <Select
                value={form.watch('face')}
                onValueChange={(v) => form.setValue('face', v as 'front' | 'rear')}
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

          {tplDetail.data && (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/40 dark:text-slate-300">
              <strong>{tplDetail.data.name}</strong> · {tplDetail.data.uHeight}U ·{' '}
              {portCount} ports
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create device'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  )
}

// Avoid useQuery duplication inline in different files
function useDeviceTemplatesForCurrentTenant(tenantId: TenantId) {
  return useQuery({
    queryKey: q.qk.deviceTemplates(tenantId),
    queryFn: () => api.listDeviceTemplates(tenantId),
  })
}

function useTenantRacks() {
  const scope = useTenantScope()
  const data: Rack[] = scope.racks
  return { data }
}
