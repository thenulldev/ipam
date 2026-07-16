import { cn } from '@/lib/utils'
import type { Port, PortId } from '@/lib/types'

interface Props {
  ports: Port[]
  /** Ports that currently have a cable. Rendered as "connected". */
  connectedPortIds?: Set<PortId>
  /** Set to enable click-to-connect behaviour. */
  onPortClick?: (port: Port) => void
  /** Set to indicate the chosen "from" port in connect mode. */
  selectedFromPortId?: PortId | null
  /** Disable clicks (e.g. already connected). */
  disabledIds?: Set<PortId>
  /** Ports per row. Defaults to 12. */
  columns?: number
  /** Density. "compact" uses smaller ports. */
  density?: 'compact' | 'normal'
  className?: string
}

export function PortGrid({
  ports,
  connectedPortIds,
  onPortClick,
  selectedFromPortId,
  disabledIds,
  columns = 12,
  density = 'compact',
  className,
}: Props) {
  const size = density === 'compact' ? 'size-7' : 'size-9'
  const textSize = density === 'compact' ? 'text-[8px]' : 'text-[10px]'

  if (ports.length === 0) {
    return (
      <p className="text-xs text-slate-500">No ports.</p>
    )
  }

  return (
    <div
      className={cn('grid gap-1', className)}
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      }}
    >
      {ports.map((p) => {
        const isConnected = connectedPortIds?.has(p.id) ?? false
        const isFrom = selectedFromPortId === p.id
        const isDisabled = disabledIds?.has(p.id) ?? false
        return (
          <button
            key={p.id}
            onClick={() => !isDisabled && onPortClick?.(p)}
            disabled={isDisabled && !onPortClick}
            title={`${p.label} · ${p.kind}${isConnected ? ' · connected' : ''}`}
            className={cn(
              'group relative flex items-center justify-center rounded-sm border-2 font-mono transition-all',
              size,
              textSize,
              isFrom
                ? 'border-brand-500 bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
                : isConnected
                  ? 'cursor-not-allowed border-sky-400 bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200'
                  : isDisabled
                    ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-600'
                    : 'border-slate-300 bg-white text-slate-600 hover:border-brand-400 hover:bg-brand-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
            )}
          >
            {p.position}
            {isConnected && (
              <span className="absolute inset-0 m-auto size-1.5 rounded-full bg-sky-500" />
            )}
          </button>
        )
      })}
    </div>
  )
}