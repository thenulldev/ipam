import { useState } from 'react'

import { OnboardingProvider } from '@/components/onboarding/onboarding-provider'
import { useShortcutsHelp } from '@/components/ui/shortcuts-help'
import { Toaster } from '@/components/ui/toaster'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useShortcuts } from '@/hooks/use-shortcuts'

import { MobileNavDrawer } from './mobile-nav-drawer'
import {
  MobileNavDrawerContext,
  type MobileNavDrawerApi,
} from './mobile-nav-drawer-context'
import { Sidebar } from './sidebar'
import { ThemeApplier } from './theme-applier'
import { Topbar } from './topbar'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const help = useShortcutsHelp()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [navOpen, setNavOpen] = useState(false)
  const drawerApi: MobileNavDrawerApi = {
    isOpen: navOpen,
    open: () => setNavOpen(true),
    close: () => setNavOpen(false),
    toggle: () => setNavOpen((o) => !o),
    set: (next: boolean) => setNavOpen(next),
  }

  useShortcuts({
    onHelp: () => help.setOpen(true),
  })

  return (
    <MobileNavDrawerContext.Provider value={drawerApi}>
      <OnboardingProvider>
        <div className="flex h-full w-full min-w-0 overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
          <ThemeApplier />
          {isDesktop ? <Sidebar /> : null}
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar
              navigationOpen={navOpen}
              onOpenNavigation={() => setNavOpen(true)}
            />
            <main className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</main>
          </div>
          {!isDesktop ? (
            <MobileNavDrawer open={navOpen} onOpenChange={setNavOpen} />
          ) : null}
          <Toaster />
          {help.dialog}
        </div>
      </OnboardingProvider>
    </MobileNavDrawerContext.Provider>
  )
}
