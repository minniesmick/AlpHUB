import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Workflow, ArrowRightLeft, Layers, Activity,
  FolderGit2, ImagePlay, Settings2, HelpCircle,
} from 'lucide-react'
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandShortcut, CommandSeparator,
} from '@/components/ui/command'
import './CommandPalette.module.css'

// ── Command registry ──────────────────────────────────────────────────────────

interface Cmd {
  id:       string
  label:    string
  group:    string
  icon:     React.ElementType
  shortcut?: string
  action:   () => void
}

// ── CommandPalette ────────────────────────────────────────────────────────────

interface Props {
  open:    boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: Props): JSX.Element {
  const navigate = useNavigate()

  const go = useCallback((route: string) => {
    navigate(route)
    onClose()
  }, [navigate, onClose])

  const commands: Cmd[] = [
    { id: 'nav-daw',      group: 'Navigate', label: 'Signal Flow',   icon: Workflow,       shortcut: 'Ctrl+1', action: () => go('/daw') },
    { id: 'nav-pipeline', group: 'Navigate', label: 'Pipeline',      icon: ArrowRightLeft, shortcut: 'Ctrl+2', action: () => go('/pipeline') },
    { id: 'nav-splitter', group: 'Navigate', label: 'Splitter',      icon: Layers,         shortcut: 'Ctrl+3', action: () => go('/splitter') },
    { id: 'nav-monitor',  group: 'Navigate', label: 'Monitor',       icon: Activity,       shortcut: 'Ctrl+4', action: () => go('/monitor') },
    { id: 'nav-projects', group: 'Navigate', label: 'Projects',      icon: FolderGit2,     shortcut: 'Ctrl+5', action: () => go('/projects') },
    { id: 'nav-imagegen', group: 'Navigate', label: 'Image Gen',     icon: ImagePlay,      shortcut: 'Ctrl+6', action: () => go('/imagegen') },
    { id: 'nav-settings', group: 'Navigate', label: 'Settings',      icon: Settings2,      shortcut: 'Ctrl+,', action: () => go('/settings') },
    { id: 'help',         group: 'Help',     label: 'Help / Keyboard shortcuts', icon: HelpCircle, shortcut: '?', action: () => { onClose(); window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' })) } },
  ]

  const groups = [...new Set(commands.map(c => c.group))]

  return (
    <CommandDialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <CommandInput placeholder="Type a command or route…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {groups.map((group, gi) => (
          <>
            {gi > 0 && <CommandSeparator key={`sep-${group}`} />}
            <CommandGroup key={group} heading={group}>
              {commands.filter(c => c.group === group).map(cmd => (
                <CommandItem
                  key={cmd.id}
                  onSelect={cmd.action}
                >
                  <cmd.icon className="mr-2 h-4 w-4 opacity-70" />
                  {cmd.label}
                  {cmd.shortcut && <CommandShortcut>{cmd.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ))}
      </CommandList>
    </CommandDialog>
  )
}

// ── Hook: wires Ctrl+K globally ───────────────────────────────────────────────

export function useCommandPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return { open, setOpen, close: () => setOpen(false) }
}
