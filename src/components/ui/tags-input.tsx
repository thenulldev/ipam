import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Props {
  value: string[]
  onChange: (next: string[]) => void
  /** Suggested tags to show as quick-add chips. */
  suggestions?: string[]
  placeholder?: string
  className?: string
  readOnly?: boolean
}

export function TagsInput({
  value,
  onChange,
  suggestions,
  placeholder = 'Add tag…',
  className,
  readOnly,
}: Props) {
  const [draft, setDraft] = useState('')
  const commit = () => {
    const v = draft.trim().toLowerCase()
    if (!v) return
    if (value.includes(v)) {
      setDraft('')
      return
    }
    onChange([...value, v])
    setDraft('')
  }
  const remove = (tag: string) => onChange(value.filter((t) => t !== tag))

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap gap-1">
        {value.length === 0 && (
          <span className="text-xs text-slate-400">No tags.</span>
        )}
        {value.map((t) => (
          <Badge key={t} variant="secondary" className="gap-1 pl-2 pr-1">
            <span>{t}</span>
            {!readOnly && (
              <button
                type="button"
                onClick={() => remove(t)}
                className="ml-1 rounded p-0.5 hover:bg-slate-300/50 dark:hover:bg-slate-700/60"
              >
                <X className="size-2.5" />
              </button>
            )}
          </Badge>
        ))}
      </div>
      {!readOnly && (
        <div className="flex items-center gap-1">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                commit()
              }
            }}
            placeholder={placeholder}
            className="h-8"
          />
          <button
            type="button"
            onClick={commit}
            disabled={!draft.trim()}
            className="grid size-8 shrink-0 place-items-center rounded-md border border-slate-300 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900"
          >
            <Plus className="size-4" />
          </button>
        </div>
      )}
      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestions
            .filter((s) => !value.includes(s))
            .slice(0, 8)
            .map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onChange([...value, s])}
                className="rounded border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-500 hover:border-brand-400 hover:text-brand-700 dark:border-slate-700 dark:hover:text-brand-300"
              >
                + {s}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}