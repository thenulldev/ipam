import { useState } from 'react'
import {
  Building2,
  ChevronsUpDown,
  HelpCircle,
  Info,
  Keyboard,
  Menu,
  PlayCircle,
  Search,
} from 'lucide-react'

import { useTour } from '@/components/onboarding/use-tour'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ShortcutsHelpDialog } from '@/components/ui/shortcuts-help'
import { CommandPalette } from '@/features/command-palette/command-palette'
import { LogoutButton } from '@/features/auth/logout-button'
import { avatarInitials } from '@/lib/auth'
import { useSites, useTenants, useUsers } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { useTenantStore } from '@/store/tenant-store'

import { AboutDialog } from './about-dialog'
import { ThemeToggle } from './theme-toggle'

interface TopbarProps {
  navigationOpen: boolean
  onOpenNavigation: () => void
}

export function Topbar({ navigationOpen, onOpenNavigation }: TopbarProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const { restart } = useTour()
  const tenants = useTenants().data ?? []
  const sites = useSites().data ?? []
  const currentTenantId = useTenantStore((s) => s.currentTenantId)
  const currentUserId = useTenantStore((s) => s.currentUserId)
  const setTenant = useTenantStore((s) => s.setTenant)
  const setUser = useTenantStore((s) => s.setUser)
  // Hooks must always be called in the same order — call them all up-front.
  const tenantUsers = useUsers(currentTenantId).data ?? []
  const allUsers = useUsers().data ?? []

  const currentTenant = tenants.find((t) => t.id === currentTenantId)
  const currentUser = tenantUsers.find((u) => u.id === currentUserId)
  const effectiveUser =
    currentUser ??
    allUsers.find((u) => u.id === currentUserId) ??
    allUsers[0]

  const tenantSites = sites.filter((s) => s.tenantId === currentTenantId)

  return (
    <header
      className="flex min-h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-2 py-2 sm:gap-3 sm:px-4 dark:border-slate-800 dark:bg-slate-900"
      style={{
        paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
        paddingRight: 'max(0.5rem, env(safe-area-inset-right))',
        paddingLeft: 'max(0.5rem, env(safe-area-inset-left))',
      }}
    >
      <Button
        variant="ghost"
        size="tap"
        className="shrink-0 md:hidden"
        onClick={onOpenNavigation}
        aria-label="Open navigation"
        aria-expanded={navigationOpen}
      >
        <Menu className="size-5" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="min-w-0 gap-1.5 px-2 sm:gap-2 sm:px-3">
            <Building2 className="hidden size-4 shrink-0 text-slate-500 md:block" />
            <span className="hidden max-w-32 truncate font-medium md:inline">
              {currentTenant?.name ?? '—'}
            </span>
            <Badge variant="outline" className="font-mono text-[10px] md:ml-1">
              {currentTenant?.slug}
            </Badge>
            <ChevronsUpDown className="size-3.5 shrink-0 text-slate-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Tenants</DropdownMenuLabel>
          {tenants.map((t) => {
            const isActive = t.id === currentTenantId
            return (
              <DropdownMenuItem
                key={t.id}
                onSelect={() => setTenant(t.id)}
                className={cn(isActive && 'bg-brand-50 dark:bg-brand-900/30')}
              >
                <span
                  className="mr-2 size-2 rounded-full"
                  style={{ background: t.brandColor ?? '#94a3b8' }}
                />
                <span className="flex-1 truncate">{t.name}</span>
                {isActive ? <Badge variant="success">Active</Badge> : null}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <span className="hidden text-sm text-slate-500 lg:inline">
        {tenantSites[0]?.name ?? '—'}
      </span>

      <Button
        type="button"
        variant="outline"
        size="tap"
        onClick={() => setSearchOpen(true)}
        className="ml-0 shrink-0 text-sm text-slate-500 sm:ml-2 md:h-auto md:w-auto md:max-w-md md:flex-1 md:justify-start md:gap-2 md:px-3 md:py-1.5 md:text-left"
        aria-label="Search racks, devices, ports, and IPs"
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden flex-1 md:inline">Search racks, devices, ports, IPs…</span>
        <kbd className="hidden font-mono text-[10px] text-slate-400 md:inline">
          ⌘K
        </kbd>
      </Button>

      <div className="ml-auto flex items-center gap-1 sm:gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="tap"
              className="hidden sm:inline-flex md:size-9"
              aria-label="Help and shortcuts"
              title="Help"
            >
              <HelpCircle className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Help</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => restart()}>
              <PlayCircle className="size-4" aria-hidden="true" />
              <span className="flex-1">Start tour</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setShortcutsOpen(true)}
            >
              <Keyboard className="size-4" aria-hidden="true" />
              <span className="flex-1">Keyboard shortcuts</span>
              <kbd className="ml-auto rounded border border-slate-300 bg-slate-100 px-1 font-mono text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                ?
              </kbd>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setAboutOpen(true)}
            >
              <Info className="size-4" aria-hidden="true" />
              <span className="flex-1">About</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ThemeToggle />
        {currentTenant && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="size-9 gap-2 px-1 sm:h-9 sm:w-auto sm:px-2">
                <Avatar
                  className="size-7"
                  style={{
                    background: effectiveUser?.avatarColor ?? '#94a3b8',
                  }}
                >
                  <AvatarFallback className="text-xs text-white">
                    {effectiveUser ? avatarInitials(effectiveUser) : '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden flex-col items-start leading-tight sm:flex">
                  <span className="text-xs font-medium">
                    {effectiveUser?.name ?? '—'}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {effectiveUser?.role ?? ''}
                  </span>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Act as (in this tenant)</DropdownMenuLabel>
              {tenantUsers.map((u) => (
                <DropdownMenuItem
                  key={u.id}
                  onSelect={() => setUser(u.id)}
                  className={cn(u.id === currentUserId && 'bg-brand-50 dark:bg-brand-900/30')}
                >
                  <Avatar
                    className="mr-2 size-6"
                    style={{ background: u.avatarColor ?? '#94a3b8' }}
                  >
                    <AvatarFallback className="text-[10px] text-white">
                      {avatarInitials(u)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-1 flex-col">
                    <span className="text-xs">{u.name}</span>
                    <span className="text-[10px] text-slate-500">{u.role}</span>
                  </div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Tenant</DropdownMenuLabel>
              <DropdownMenuItem disabled>
                {currentTenant.name}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <LogoutButton />
      </div>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <ShortcutsHelpDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </header>
  )
}
