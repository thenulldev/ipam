import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Link } from '@tanstack/react-router'
import { Network, X } from 'lucide-react'

import { Dialog, DialogPortal } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

import { navItems, TOUR_SELECTORS } from './sidebar'

interface MobileNavDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MobileNavDrawer({ open, onOpenChange }: MobileNavDrawerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            paddingRight: 'env(safe-area-inset-right)',
            paddingBottom: 'env(safe-area-inset-bottom)',
            paddingLeft: 'env(safe-area-inset-left)',
          }}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-slate-200 bg-white shadow-xl outline-none dark:border-slate-800 dark:bg-slate-900',
            'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:duration-200 data-[state=open]:duration-200',
          )}
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
            paddingLeft: 'env(safe-area-inset-left)',
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            Navigation
          </DialogPrimitive.Title>
          <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-4 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="grid size-8 place-items-center rounded-md bg-brand-600 text-white">
                <Network className="size-5" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-semibold">IPAM</span>
                <span className="text-[10px] uppercase tracking-wider text-slate-500">
                  Racks · Patches
                </span>
              </div>
            </div>
            <DialogPrimitive.Close
              className="grid size-9 place-items-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              aria-label="Close navigation"
            >
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>

          <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
            {navItems.map((item) => {
              const Icon = item.icon
              const tourSelector = TOUR_SELECTORS[item.to]
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  data-tour={tourSelector ?? undefined}
                  onClick={() => onOpenChange(false)}
                  className={cn(
                    'group flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
                    '[&.active]:bg-brand-50 [&.active]:text-brand-700 dark:[&.active]:bg-brand-900/30 dark:[&.active]:text-brand-300',
                  )}
                  activeProps={{}}
                  activeOptions={{ exact: item.to === '/' }}
                >
                  <Icon className="size-5" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>

          <div className="border-t border-slate-200 p-3 text-[11px] text-slate-500 dark:border-slate-800">
            v0.1.0 · scaffold
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
