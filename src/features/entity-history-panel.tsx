import type { EntityType } from '@/lib/types'
import { Activity } from 'lucide-react'
import { useChangeEventsForEntity } from '@/lib/queries'

interface Props {
  entityType: EntityType
  entityId: string
}

const actionColor: Record<string, string> = {
  create: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  update: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  delete: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  connect: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  disconnect: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  note: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  attach: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  place: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
}

export function EntityHistoryPanel({ entityType, entityId }: Props) {
  const events = useChangeEventsForEntity(entityType, entityId).data ?? []

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h4 className="mb-3 text-sm font-semibold">History</h4>
      {events.length === 0 ? (
        <p className="text-xs text-slate-500">No history for this entity yet.</p>
      ) : (
        <ol className="relative ml-2 space-y-3 border-l-2 border-slate-200 pl-4 dark:border-slate-800">
          {events.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[19px] grid size-7 place-items-center rounded-full bg-white shadow ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                <Activity className="size-3.5 text-slate-400" />
              </span>
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${actionColor[e.action] ?? 'bg-slate-100 text-slate-700'}`}
                >
                  {e.action}
                </span>
                <span className="font-medium">{e.actorName}</span>
                <span className="text-slate-500">
                  {new Date(e.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                {e.summary}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}