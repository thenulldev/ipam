import { AlertTriangle, CircleAlert, Info } from 'lucide-react'
import { useState } from 'react'
import { type ValidationIssue } from '@/lib/validators'
import { cn } from '@/lib/utils'

interface Props {
  issues: ValidationIssue[]
  /** Limit which scopes to show. e.g. ['rack'] on the rack detail page. */
  filter?: ValidationIssue['scope'][]
  /** Title prefix. Defaults to "Tenant". */
  scope?: string
}

export function ValidationBanner({ issues, filter, scope = 'Tenant' }: Props) {
  const [expanded, setExpanded] = useState(false)
  const filtered = filter ? issues.filter((i) => filter.includes(i.scope)) : issues
  if (filtered.length === 0) return null

  const errors = filtered.filter((i) => i.severity === 'error').length
  const warnings = filtered.filter((i) => i.severity === 'warning').length
  const infos = filtered.filter((i) => i.severity === 'info').length

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border',
        errors > 0 && 'border-rose-200 dark:border-rose-800/60',
        errors === 0 && warnings > 0 && 'border-amber-200 dark:border-amber-800/60',
        errors === 0 && warnings === 0 && 'border-sky-200 dark:border-sky-800/60',
      )}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 bg-white px-3 py-2 text-sm dark:bg-slate-900"
      >
        <div className="flex items-center gap-2">
          {errors > 0 ? (
            <CircleAlert className="size-4 text-rose-600" />
          ) : warnings > 0 ? (
            <AlertTriangle className="size-4 text-amber-600" />
          ) : (
            <Info className="size-4 text-sky-600" />
          )}
          <span className="font-medium">
            {scope}: {filtered.length} issue{filtered.length === 1 ? '' : 's'}
          </span>
          <span className="flex gap-2 text-xs text-slate-500">
            {errors > 0 && (
              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                {errors} error{errors === 1 ? '' : 's'}
              </span>
            )}
            {warnings > 0 && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                {warnings} warning{warnings === 1 ? '' : 's'}
              </span>
            )}
            {infos > 0 && (
              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                {infos} info
              </span>
            )}
          </span>
        </div>
        <span className="text-xs text-slate-400">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <ul className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
          {filtered.map((i, idx) => (
            <li
              key={idx}
              className={cn(
                'flex items-start gap-3 px-3 py-2 text-sm',
                i.severity === 'error' && 'bg-rose-50/40 dark:bg-rose-950/20',
                i.severity === 'warning' && 'bg-amber-50/40 dark:bg-amber-950/20',
              )}
            >
              <div className="mt-0.5">
                {i.severity === 'error' && (
                  <CircleAlert className="size-4 text-rose-600" />
                )}
                {i.severity === 'warning' && (
                  <AlertTriangle className="size-4 text-amber-600" />
                )}
                {i.severity === 'info' && (
                  <Info className="size-4 text-sky-600" />
                )}
              </div>
              <div className="min-w-0">
                <div className="font-medium">{i.title}</div>
                {i.detail && (
                  <div className="text-xs text-slate-500">{i.detail}</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}