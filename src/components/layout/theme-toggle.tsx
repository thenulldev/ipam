import { Monitor, Moon, Sun } from 'lucide-react'
import { useUiStore, type Theme } from '@/store/ui-store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

const items: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function ThemeToggle() {
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)
  const current = items.find((i) => i.value === theme) ?? items[2]!
  const Icon = current.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9" aria-label="Theme">
          <Icon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((it) => {
          const ItIcon = it.icon
          return (
            <DropdownMenuItem
              key={it.value}
              onSelect={() => setTheme(it.value)}
              className={
                theme === it.value
                  ? 'bg-brand-50 dark:bg-brand-900/30'
                  : undefined
              }
            >
              <ItIcon className="mr-2 size-4 text-slate-400" />
              <span className="flex-1">{it.label}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}