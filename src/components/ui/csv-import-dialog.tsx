import { useState } from 'react'
import { Upload, FileUp, FileSpreadsheet, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
// import { useTenantScope } from '@/lib/tenant-scope'
import { useTenantStore } from '@/store/tenant-store'
import { useUsers, useCreateSite } from '@/lib/queries'
import { confirm } from './confirm-dialog'
import { toast } from '@/lib/toast'
import { parseCsv } from '@/lib/csv'
import { cn } from '@/lib/utils'

type Kind = 'site' | 'rack' | 'device' | 'prefix' | 'address'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: Kind
}

interface ColumnSpec {
  key: string
  label: string
  required: boolean
  validate?: (v: string) => string | null
}

const SPECS: Record<Kind, ColumnSpec[]> = {
  site: [
    { key: 'name', label: 'Name', required: true },
    { key: 'address', label: 'Address', required: false },
  ],
  rack: [
    { key: 'name', label: 'Name', required: true },
    {
      key: 'uHeight',
      label: 'U Height',
      required: true,
      validate: (v) => (/^\d+$/.test(v) ? null : 'Must be a number'),
    },
    { key: 'site', label: 'Site', required: true },
    { key: 'room', label: 'Room', required: false },
  ],
  device: [
    { key: 'name', label: 'Name', required: true },
    { key: 'kind', label: 'Kind', required: true },
    { key: 'rack', label: 'Rack', required: true },
    {
      key: 'uStart',
      label: 'U Start',
      required: true,
      validate: (v) => (/^\d+$/.test(v) ? null : 'Must be a number'),
    },
    { key: 'face', label: 'Face', required: false },
  ],
  prefix: [
    { key: 'cidr', label: 'CIDR', required: true },
    { key: 'role', label: 'Role', required: true },
  ],
  address: [
    { key: 'address', label: 'Address', required: true },
    { key: 'prefix', label: 'Prefix', required: true },
    { key: 'status', label: 'Status', required: false },
  ],
}

const KIND_TITLES: Record<Kind, string> = {
  site: 'sites',
  rack: 'racks',
  device: 'devices',
  prefix: 'prefixes',
  address: 'IP addresses',
}

export function CsvImportDialog({ open, onOpenChange, kind }: Props) {
  // const scope = useTenantScope() // unused for now
  const tenantId = useTenantStore((s) => s.currentTenantId)
  const tenantUsers = useUsers(tenantId).data ?? []
  const currentUser = tenantUsers.find(
    (u) => u.id === useTenantStore.getState().currentUserId,
  )
  const createSite = useCreateSite()

  const [file, setFile] = useState<File | null>(null)
  const [raw, setRaw] = useState('')
  const [parsed, setParsed] = useState<ReturnType<typeof parseCsv> | null>(null)

  const onFile = async (f: File | null) => {
    setFile(f)
    if (!f) {
      setRaw('')
      setParsed(null)
      return
    }
    const text = await f.text()
    setRaw(text)
    setParsed(parseCsv(text))
  }

  const reset = () => {
    setFile(null)
    setRaw('')
    setParsed(null)
  }

  const submit = async () => {
    if (!parsed) return
    const spec = SPECS[kind]
    const headers = parsed.headers.map((h) => h.toLowerCase())
    const requiredIdx = spec
      .map((c) => ({ ...c, idx: headers.indexOf(c.key) }))
      .filter((c) => c.required && c.idx === -1)
    if (requiredIdx.length > 0) {
      toast.error(
        `Missing required columns: ${requiredIdx.map((c) => c.key).join(', ')}`,
      )
      return
    }

    const ok = await confirm({
      title: `Import ${parsed.rows.length} ${KIND_TITLES[kind]}?`,
      description: 'This adds new entities to the current tenant.',
      confirmText: 'Import',
      tone: 'info',
    })
    if (!ok) return

    let success = 0
    let fail = 0
    for (const row of parsed.rows) {
      const get = (key: string) => {
        const i = headers.indexOf(key)
        return (i >= 0 ? row[i] : '') ?? ''
      }
      if (kind === 'site') {
        try {
          createSite.mutate({
            tenantId,
            name: get('name'),
            address: get('address') || undefined,
            actorId: useTenantStore.getState().currentUserId,
            actorName: currentUser?.name ?? 'System',
          })
          success += 1
        } catch {
          fail += 1
        }
      } else {
        // For racks/devices etc., API is TODO. For now, mark as not supported.
        fail += 1
      }
    }
    if (success > 0) toast.success(`Imported ${success} ${KIND_TITLES[kind]}`)
    if (fail > 0) toast.error(`${fail} rows failed`)
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-4" />
            Import {KIND_TITLES[kind]} from CSV
          </DialogTitle>
          <DialogDescription>
            Drop a CSV file with headers:{' '}
            <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
              {SPECS[kind].map((c) => c.key).join(', ')}
            </code>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!file ? (
            <label
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500 transition-colors hover:border-brand-400 hover:bg-brand-50 dark:border-slate-700 dark:bg-slate-800/30 dark:text-slate-400 dark:hover:border-brand-500 dark:hover:bg-slate-800/50',
              )}
            >
              <FileUp className="size-6 text-slate-400" />
              <span>Click to select a CSV file</span>
              <span className="text-xs text-slate-400">.csv · UTF-8</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
            </label>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                <FileSpreadsheet className="size-4 text-emerald-500" />
                <span className="truncate font-medium">{file.name}</span>
                <span className="text-xs text-slate-500">
                  {(file.size / 1024).toFixed(1)} KB
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={reset}
                  className="ml-auto size-6 p-0"
                >
                  <X className="size-3" />
                </Button>
              </div>

              {parsed && (
                <div className="rounded-md border border-slate-200 dark:border-slate-700">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-left dark:bg-slate-800/50">
                        <tr>
                          {parsed.headers.map((h, i) => (
                            <th key={i} className="px-2 py-1.5 font-mono">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {parsed.rows.slice(0, 20).map((r, ri) => {
                          const expected = SPECS[kind].length
                          const ok =
                            r.length === expected &&
                            SPECS[kind].every(
                              (s) => !s.required || (r[headersIndex(s, parsed.headers)] ?? '') !== '',
                            )
                          return (
                            <tr
                              key={ri}
                              className={cn(
                                ok
                                  ? 'bg-emerald-50/30 dark:bg-emerald-950/20'
                                  : 'bg-rose-50/30 dark:bg-rose-950/20',
                              )}
                            >
                              {r.map((cell, ci) => (
                                <td key={ci} className="px-2 py-1 font-mono">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {parsed.rows.length > 20 && (
                    <p className="border-t border-slate-200 px-2 py-1.5 text-center text-[10px] text-slate-500 dark:border-slate-700">
                      ... and {parsed.rows.length - 20} more rows
                    </p>
                  )}
                </div>
              )}

              {parsed?.errors && parsed.errors.length > 0 && (
                <div className="rounded-md border border-rose-300 bg-rose-50 p-2 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
                  {parsed.errors.length} row{parsed.errors.length === 1 ? '' : 's'}{' '}
                  have wrong column counts.
                </div>
              )}

              <details className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs dark:border-slate-700 dark:bg-slate-800/30">
                <summary className="cursor-pointer font-medium text-slate-600 dark:text-slate-300">
                  Raw CSV preview
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-slate-700 dark:text-slate-300">
                  {raw.slice(0, 500)}
                  {raw.length > 500 ? '...' : ''}
                </pre>
              </details>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!parsed || parsed.rows.length === 0}
          >
            <Upload className="size-4" />
            Import {parsed?.rows.length ?? 0} {KIND_TITLES[kind]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function headersIndex(s: ColumnSpec, headers: string[]): number {
  return headers.indexOf(s.key)
}
