import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'
import {
  useCables,
  useDevices,
  useFloorplans,
  usePrefixes,
  useRacks,
  useRooms,
  useSites,
} from '@/lib/queries'
import { useTenantStore } from '@/store/tenant-store'
import { useNavigate } from '@tanstack/react-router'
import { Cable, Network, Server, Shield } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate()
  const tenantId = useTenantStore((s) => s.currentTenantId)

  const sites = useSites().data ?? []
  const rooms = useRooms().data ?? []
  const racks = useRacks().data ?? []
  const devices = useDevices().data ?? []
  const cables = useCables().data ?? []
  const floorplans = useFloorplans().data ?? []
  const prefixes = usePrefixes().data ?? []

  // Filter by current tenant (rooms via site; racks via room; devices via rack).
  const roomsBySite = useMemo(() => {
    const tenantSiteIds = new Set(sites.filter((s) => s.tenantId === tenantId).map((s) => s.id))
    return rooms.filter((r) => tenantSiteIds.has(r.siteId))
  }, [sites, rooms, tenantId])

  const racksByTenant = useMemo(() => {
    const tenantRoomIds = new Set(roomsBySite.map((r) => r.id))
    return racks.filter((r) => tenantRoomIds.has(r.roomId))
  }, [racks, roomsBySite])

  const devicesByTenant = useMemo(() => {
    const tenantRackIds = new Set(racksByTenant.map((r) => r.id))
    return devices.filter((d) => tenantRackIds.has(d.rackId))
  }, [devices, racksByTenant])

  // Toggle ⌘K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onOpenChange])

  const onPick = (to: string, params?: Record<string, string>) => {
    onOpenChange(false)
    navigate({ to: to as any, params: params as any })
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search">
      <CommandInput placeholder="Search racks, devices, cables, prefixes…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>

        <CommandGroup heading="Racks">
          {racksByTenant.slice(0, 5).map((r) => (
            <CommandItem
              key={r.id}
              value={`rack:${r.name}`}
              onSelect={() => onPick('/racks/$rackId', { rackId: r.id })}
            >
              <Server className="mr-2 size-4 text-slate-400" />
              <span>{r.name}</span>
              <span className="ml-auto text-xs text-slate-500">{r.uHeight}U</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Devices">
          {devicesByTenant.slice(0, 8).map((d) => (
            <CommandItem
              key={d.id}
              value={`device:${d.name} ${d.model ?? ''}`}
              onSelect={() => {
                const rack = racksByTenant.find((r) => r.id === d.rackId)
                if (rack) onPick('/racks/$rackId', { rackId: rack.id })
              }}
            >
              <Server className="mr-2 size-4 text-slate-400" />
              <span>{d.name}</span>
              <span className="ml-auto text-xs text-slate-500">
                {d.kind}{d.model ? ` · ${d.model}` : ''}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Cables">
          {cables.slice(0, 5).map((c) => (
            <CommandItem
              key={c.id}
              value={`cable:${c.label ?? c.id} ${c.kind}`}
              onSelect={() => onPick('/patches')}
            >
              <Cable className="mr-2 size-4 text-slate-400" />
              <span>{c.label ?? c.id}</span>
              <span className="ml-auto text-xs text-slate-500">{c.kind}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Floorplans">
          {floorplans.slice(0, 3).map((fp) => (
            <CommandItem
              key={fp.id}
              value={`floorplan:${fp.name}`}
              onSelect={() => onPick('/floorplan')}
            >
              <Shield className="mr-2 size-4 text-slate-400" />
              <span>{fp.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Prefixes">
          {prefixes.slice(0, 6).map((p) => (
            <CommandItem
              key={p.id}
              value={`prefix:${p.cidr} ${p.role}`}
              onSelect={() => onPick('/ipam')}
            >
              <Network className="mr-2 size-4 text-slate-400" />
              <span className="font-mono">{p.cidr}</span>
              <span className="ml-auto text-xs text-slate-500">{p.role}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
      <div className="border-t border-slate-200 px-3 py-1.5 text-xs text-slate-500 dark:border-slate-800">
        <CommandShortcut>⌘K</CommandShortcut>
        <span className="ml-2">Navigate anywhere</span>
      </div>
    </CommandDialog>
  )
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false)
  return { open, setOpen }
}
