import type { ReactNode } from 'react'
import { Server } from 'lucide-react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="grid place-items-center rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900/50">
      <div className="flex max-w-md flex-col items-center gap-3">
        <div className="grid size-12 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
          {icon ?? <Server className="size-6" />}
        </div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h3>
        {description && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {description}
          </p>
        )}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  )
}