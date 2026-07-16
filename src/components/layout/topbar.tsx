import { Building2, ChevronsUpDown, Keyboard, Search } from 'lucide-react'
import { ThemeToggle } from './theme-toggle'
import { ShortcutsHelpDialog } from '@/components/ui/shortcuts-help'
import { useState } from 'react'
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
import { CommandPalette } from '@/features/command-palette/command-palette'
import { avatarInitials } from '@/lib/auth'
import { useSites, useTenants, useUsers } from '@/lib/queries'
import { useTenantStore } from '@/store/tenant-store'
import { cn } from '@/lib/utils'

export function Topbar() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
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
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Building2 className="size-4 text-slate-500" />
            <span className="font-medium">
              {currentTenant?.name ?? '—'}
            </span>
            <Badge variant="outline" className="ml-1 font-mono text-[10px]">
              {currentTenant?.slug}
            </Badge>
            <ChevronsUpDown className="size-3.5 text-slate-400" />
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

      <span className="text-sm text-slate-500">
        {tenantSites[0]?.name ?? '—'}
      </span>

      <button
        onClick={() => setSearchOpen(true)}
        className="ml-2 flex max-w-md flex-1 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-left text-sm text-slate-500 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
      >
        <Search className="size-4" />
        <span className="flex-1">Search racks, devices, ports, IPs…</span>
        <kbd className="hidden font-mono text-[10px] text-slate-400 md:inline">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          onClick={() => setShortcutsOpen(true)}
          aria-label="Keyboard shortcuts"
          title="Press ? for shortcuts"
        >
          <Keyboard className="size-4" />
        </Button>
        <ThemeToggle />
        {currentTenant && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2">
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
                <div className="flex flex-col items-start leading-tight">
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
      </div>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <ShortcutsHelpDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </header>
  )
}
