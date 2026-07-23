/**
 * About dialog (NUL-51.C / NUL-60).
 *
 * Reached from the Topbar Help dropdown. Shows what we ship in v0.1 and
 * links out to the repo. Kept tiny on purpose — a real marketing page
 * belongs on a separate surface, this is just enough to satisfy the
 * `About` item promised in the Help menu.
 */

import { Info } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface AboutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const VERSION = '0.1.0'

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="size-4" />
            About IPAM
          </DialogTitle>
          <DialogDescription>
            IP address, rack, and patch management for small network teams.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300">
          <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 dark:border-slate-800">
            <span>Version</span>
            <span className="font-mono text-xs text-slate-700 dark:text-slate-200">
              {VERSION}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 dark:border-slate-800">
            <span>Frontend</span>
            <span className="font-mono text-xs text-slate-700 dark:text-slate-200">
              React · Vite · TS
            </span>
          </div>
          <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 dark:border-slate-800">
            <span>Storage</span>
            <span className="font-mono text-xs text-slate-700 dark:text-slate-200">
              SQLite · Drizzle
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
