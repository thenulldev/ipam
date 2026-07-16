import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConfirmOptions {
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  tone?: 'danger' | 'info'
}

interface ConfirmEntry extends ConfirmOptions {
  resolve: (v: boolean) => void
}

const listeners = new Set<ConfirmEntry>()

/** Imperative API: call `confirm({...})` from anywhere; resolves true/false. */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const entry: ConfirmEntry = { ...opts, resolve }
    listeners.add(entry)
    confirmBus.tick++
    confirmBus.subscribers.forEach((fn) => fn())
  })
}

const confirmBus = (() => {
  let tick = 0
  const subscribers = new Set<() => void>()
  return {
    get tick() {
      return tick
    },
    set tick(v: number) {
      tick = v
    },
    subscribers,
  }
})()

export function ConfirmDialogHost() {
  const [pending, setPending] = useState<ConfirmEntry | null>(null)
  const [, force] = useState(0)

  useEffect(() => {
    const sub = () => force((n) => n + 1)
    confirmBus.subscribers.add(sub)
    return () => {
      confirmBus.subscribers.delete(sub)
    }
  }, [])

  useEffect(() => {
    for (const l of Array.from(listeners)) {
      listeners.delete(l)
      setPending(l)
    }
  }, [pending])

  if (!pending) return null
  const tone = pending.tone ?? 'danger'
  return (
    <Dialog
      open={true}
      onOpenChange={(o) => {
        if (!o) {
          pending.resolve(false)
          setPending(null)
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {tone === 'danger' ? (
              <AlertTriangle className="size-4 text-amber-500" />
            ) : (
              <Info className="size-4 text-sky-500" />
            )}
            {pending.title}
          </DialogTitle>
          {pending.description && (
            <DialogDescription>{pending.description}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              pending.resolve(false)
              setPending(null)
            }}
          >
            {pending.cancelText ?? 'Cancel'}
          </Button>
          <Button
            variant={tone === 'danger' ? 'destructive' : 'default'}
            onClick={() => {
              pending.resolve(true)
              setPending(null)
            }}
            className={cn(tone === 'info' && 'bg-brand-600 text-white hover:bg-brand-700')}
          >
            {pending.confirmText ?? 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
