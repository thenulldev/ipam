import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { ThemeApplier } from './theme-applier'
import { Toaster } from '@/components/ui/toaster'
import { useShortcuts } from '@/hooks/use-shortcuts'
import { useShortcutsHelp } from '@/components/ui/shortcuts-help'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const help = useShortcutsHelp()
  useShortcuts({
    onHelp: () => help.setOpen(true),
  })
  return (
    <div className="flex h-full w-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <ThemeApplier />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
      <Toaster />
      {help.dialog}
    </div>
  )
}
