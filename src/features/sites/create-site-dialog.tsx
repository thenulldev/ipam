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
import { useCreateSite } from '@/lib/queries'
import { useTenantStore } from '@/store/tenant-store'
import { useUsers } from '@/lib/queries'

const schema = z.object({
  name: z.string().min(1, 'Name required').max(80),
  address: z.string().max(200).optional(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateSiteDialog({ open, onOpenChange }: Props) {
  const tenantId = useTenantStore((s) => s.currentTenantId)
  const currentUserId = useTenantStore((s) => s.currentUserId)
  const tenantUsers = useUsers(tenantId).data ?? []
  const currentUser = tenantUsers.find((u) => u.id === currentUserId)
  const create = useCreateSite()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', address: '' },
  })

  const onSubmit = (values: FormValues) => {
    create.mutate(
      {
        tenantId,
        name: values.name,
        address: values.address || undefined,
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
          <DialogTitle>Create a site</DialogTitle>
          <DialogDescription>
            A site is a physical location (datacenter, office, POP). You'll add
            rooms and racks to it next.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="site-name">Site name</Label>
            <Input
              id="site-name"
              placeholder="e.g. Frankfurt DC-1"
              {...form.register('name')}
            />
            {form.formState.errors.name && (
              <p className="text-xs text-rose-600">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="site-address">Address (optional)</Label>
            <Input
              id="site-address"
              placeholder="Street, city, country"
              {...form.register('address')}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create site'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}