import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn('animate-pulse rounded bg-slate-200 dark:bg-slate-800', className)} />
}

export function SkeletonText({
  className,
  width = 'w-full',
}: SkeletonProps & { width?: string }) {
  return <Skeleton className={cn('h-3', width, className)} />
}

export function SkeletonRow({ className }: SkeletonProps) {
  return <div className={cn('flex items-center gap-2 py-2', className)}>
    <Skeleton className="size-8 rounded-md" />
    <div className="flex-1 space-y-1.5">
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-2.5 w-1/2" />
    </div>
  </div>
}

export function SkeletonTable({
  rows = 5,
  cols = 4,
  className,
}: SkeletonProps & { rows?: number; cols?: number }) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-2 py-1">
          {Array.from({ length: cols }, (_, i) => (
            <Skeleton key={i} className="h-3 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900',
        className,
      )}
    >
      <Skeleton className="mb-3 h-4 w-1/3" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  )
}
