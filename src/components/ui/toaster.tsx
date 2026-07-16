import * as ToastPrimitive from '@radix-ui/react-toast'
import { CheckCircle2, X, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { subscribeToasts, toast, type ToastItem } from '@/lib/toast'
import { cn } from '@/lib/utils'

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    return subscribeToasts((item) => {
      setItems((prev) => [...prev, item])
    })
  }, [])

  const dismiss = (id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={4000}>
      {items.map((t) => (
        <ToastPrimitive.Root
          key={t.id}
          duration={t.duration}
          onOpenChange={(open) => {
            if (!open) dismiss(t.id)
          }}
          className={cn(
            'pointer-events-auto flex w-full items-start gap-3 rounded-lg border bg-white p-4 shadow-lg dark:bg-slate-900',
            t.variant === 'success' &&
              'border-emerald-200 dark:border-emerald-700/50',
            t.variant === 'destructive' &&
              'border-rose-200 dark:border-rose-700/50',
            t.variant === 'default' && 'border-slate-200 dark:border-slate-800',
            'data-[state=open]:animate-in data-[state=open]:slide-in-from-right-full data-[state=closed]:animate-out data-[state=closed]:fade-out-80',
          )}
        >
          <div className="mt-0.5 shrink-0">
            {t.variant === 'success' && (
              <CheckCircle2 className="size-4 text-emerald-500" />
            )}
            {t.variant === 'destructive' && (
              <XCircle className="size-4 text-rose-500" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <ToastPrimitive.Title
              className={cn(
                'text-sm font-medium text-slate-900 dark:text-slate-100',
              )}
            >
              {t.title}
            </ToastPrimitive.Title>
            {t.description && (
              <ToastPrimitive.Description className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {t.description}
              </ToastPrimitive.Description>
            )}
          </div>
          <ToastPrimitive.Close
            className="shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            aria-label="Close"
          >
            <X className="size-4" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none" />
    </ToastPrimitive.Provider>
  )
}

// Re-export so callers don't need to import from two places.
export { toast }