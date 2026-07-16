import { Keyboard } from 'lucide-react'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SHORTCUT_LIST } from '@/hooks/use-shortcuts'
import { cn } from '@/lib/utils'

export function ShortcutsHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="size-4" />
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>
            Navigate the app without leaving the keyboard.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5">
          {SHORTCUT_LIST.map((s, idx) => (
            <li
              key={idx}
              className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
            >
              <span className="text-slate-600 dark:text-slate-300">
                {s.description}
              </span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, i) => (
                  <kbd
                    key={i}
                    className={cn(
                      'rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-800',
                      k === '⌘' && 'font-bold',
                    )}
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

export function useShortcutsHelp() {
  const [open, setOpen] = useState(false)
  return { open, setOpen, dialog: <ShortcutsHelpDialog open={open} onOpenChange={setOpen} /> }
}