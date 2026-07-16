import { useState } from 'react'
import { FileText, History, Link2, Link2Off, MessageSquarePlus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  useAddresses,
  usePrefixes,
  useUnassignAddress,
  useUsers,
  useVrfs,
} from '@/lib/queries'
import { Button } from '@/components/ui/button'
import { useTenantStore } from '@/store/tenant-store'
import { canWrite } from '@/lib/auth'
import { AssignAddressDialog } from './assign-address-dialog'
import { EntityNotesPanel } from '@/features/entity-notes-panel'
import { EntityHistoryPanel } from '@/features/entity-history-panel'
import { SubnetTree } from './subnet-tree'
import { NetworkServicesPanel, NetworkServiceChips } from './network-services'
import type {
  EntityType,
  IpAddress,
  Prefix,
  PrefixId,
  PrefixRole,
} from '@/lib/types'
import { cn } from '@/lib/utils'

const roleColor: Record<PrefixRole, string> = {
  lan: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  wan: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  mgmt: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  transit: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  loopback: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  p2p: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  reserved: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  'dhcp-pool': 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
  infra: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
}

export function IpamPage() {
  const prefixes = usePrefixes().data ?? []
  const addresses = useAddresses().data ?? []
  const vrfs = useVrfs().data ?? []
  const [selected, setSelected] = useState<PrefixId | null>(null)
  const [assignTarget, setAssignTarget] = useState<IpAddress | null>(null)
  const [notesTarget, setNotesTarget] = useState<{
    entityType: EntityType
    entityId: string
    label: string
  } | null>(null)

  const tenantId = useTenantStore((s) => s.currentTenantId)
  const currentUserId = useTenantStore((s) => s.currentUserId)
  const tenantUsers = useUsers(tenantId).data ?? []
  const currentUser = tenantUsers.find((u) => u.id === currentUserId)
  const writable = canWrite(currentUser?.role ?? 'viewer')
  const unassign = useUnassignAddress()

  const vrfById = new Map(vrfs.map((v) => [v.id, v]))

  const selectedPrefix = prefixes.find((p) => p.id === selected) ?? null
  const prefixAddresses = addresses.filter((a) => a.prefixId === selected)
  void vrfById

  return (
    <div className="flex h-full min-h-0">
      {/* Subnet tree */}
      <aside className="w-96 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold">Prefixes</h2>
        <SubnetTree
          prefixes={prefixes}
          addresses={addresses}
          vrfs={vrfs}
          selected={selected}
          onSelect={setSelected}
        />
        <p className="mt-4 text-[11px] text-slate-500">
          VRFs: {vrfs.map((v) => vrfById.get(v.id)!.name).join(', ')}
        </p>
      </aside>

      {/* Address table */}
      <section className="min-w-0 flex-1 overflow-y-auto p-6">
        {selectedPrefix ? (
          <PrefixDetail
            prefix={selectedPrefix}
            addresses={prefixAddresses}
            writable={writable}
            onAssign={(a) => setAssignTarget(a)}
            onUnassign={(a) =>
              unassign.mutate({
                tenantId,
                addressId: a.id,
                actorId: currentUserId,
                actorName: currentUser?.name ?? 'System',
              })
            }
            onOpenNotes={(entityType, entityId, label) =>
              setNotesTarget({ entityType, entityId, label })
            }
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-slate-500">
            Select a prefix to view its addresses.
          </div>
        )}
      </section>

      <AssignAddressDialog
        address={assignTarget}
        open={assignTarget !== null}
        onOpenChange={(o) => !o && setAssignTarget(null)}
      />

      <Dialog
        open={notesTarget !== null}
        onOpenChange={(o) => !o && setNotesTarget(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {notesTarget?.label ?? 'Notes & History'}
            </DialogTitle>
            <DialogDescription>
              Notes, images, and audit trail for this entity.
            </DialogDescription>
          </DialogHeader>
          {notesTarget && (
            <Tabs defaultValue="notes">
              <TabsList>
                <TabsTrigger value="notes">
                  <MessageSquarePlus className="size-3.5" />
                  Notes
                </TabsTrigger>
                <TabsTrigger value="history">
                  <History className="size-3.5" />
                  History
                </TabsTrigger>
              </TabsList>
              <TabsContent value="notes">
                <EntityNotesPanel
                  entityType={notesTarget.entityType}
                  entityId={notesTarget.entityId}
                  entityLabel={notesTarget.label}
                />
              </TabsContent>
              <TabsContent value="history">
                <EntityHistoryPanel
                  entityType={notesTarget.entityType}
                  entityId={notesTarget.entityId}
                />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

type NotesOpener = (
  entityType: EntityType,
  entityId: string,
  label: string,
) => void

function PrefixDetail({
  prefix,
  addresses,
  writable,
  onAssign,
  onUnassign,
  onOpenNotes,
}: {
  prefix: Prefix
  addresses: IpAddress[]
  writable: boolean
  onAssign: (a: IpAddress) => void
  onUnassign: (a: IpAddress) => void
  onOpenNotes: NotesOpener
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-mono text-xl font-semibold">{prefix.cidr}</h2>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            <span
              className={cn(
                'rounded-md px-2 py-0.5 text-[10px] font-medium uppercase',
                roleColor[prefix.role],
              )}
            >
              {prefix.role}
            </span>
            {prefix.description ? <span>· {prefix.description}</span> : null}
          </div>
          <NetworkServiceChips prefix={prefix} />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            onOpenNotes('prefix', prefix.id, `Prefix ${prefix.cidr}`)
          }
        >
          <FileText className="size-3.5" />
          Notes
        </Button>
      </div>

      <NetworkServicesPanel prefix={prefix} />

      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-800/50">
            <tr>
              <th className="px-3 py-2">Address</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">DNS Name</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {addresses.map((a) => (
              <tr key={a.id} className="bg-white dark:bg-slate-900">
                <td className="px-3 py-1.5 font-mono">{a.address}</td>
                <td className="px-3 py-1.5">
                  <span
                    className={cn(
                      'rounded-md px-2 py-0.5 text-[10px] font-medium uppercase',
                      a.status === 'assigned' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
                      a.status === 'gateway' && 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
                      a.status === 'free' && 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                      a.status === 'dhcp' && 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
                      a.status === 'reserved' && 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
                    )}
                  >
                    {a.status}
                  </span>
                </td>
                <td className="px-3 py-1.5 font-mono text-xs">{a.dnsName ?? '—'}</td>
                <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">
                  {a.description ?? '—'}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        onOpenNotes('address', a.id, `Address ${a.address}`)
                      }
                      title="Notes & history"
                    >
                      <FileText className="size-3.5" />
                    </Button>
                    {writable && a.status === 'free' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onAssign(a)}
                      >
                        <Link2 className="size-3.5" />
                        Assign
                      </Button>
                    )}
                    {writable && a.status === 'assigned' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-rose-600 hover:text-rose-700"
                        onClick={() => onUnassign(a)}
                      >
                        <Link2Off className="size-3.5" />
                        Unassign
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {addresses.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  No addresses allocated yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

void EntityNotesPanel
void EntityHistoryPanel