import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { Toaster } from 'sonner'
import Sidebar from '../Sidebar'
import GpuStatusBar from '../GpuStatusBar'
import { ToastStack } from '../ToastStack'
import { HelpModal } from '../HelpModal'
import { CinematicOverlay } from '../CinematicOverlay'
import { CursorGlow } from '../CursorGlow'
import { CommandPalette, useCommandPalette } from '../CommandPalette'
import { Particles } from '@/components/ui/particles'
import styles from './AppShell.module.css'
import { ws } from '../../lib/ws'
import { useToast } from '../../context/Toast'

interface ShellDims {
  contentWidth: number
  contentHeight: number
}

const ShellContext = createContext<ShellDims>({ contentWidth: 0, contentHeight: 0 })
export const useShell = (): ShellDims => useContext(ShellContext)

const ROUTE_SHORTCUTS: Record<string, string> = {
  '1': '/daw',
  '2': '/pipeline',
  '3': '/splitter',
  '4': '/monitor',
  '5': '/projects',
  '6': '/imagegen',
  ',': '/settings',
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable
}

export default function AppShell(): JSX.Element {
  const contentRef = useRef<HTMLElement>(null)
  const [dims, setDims] = useState<ShellDims>({ contentWidth: 0, contentHeight: 0 })
  const [helpOpen, setHelpOpen] = useState(false)
  const cmdPalette = useCommandPalette()
  const toast    = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const closeHelp = useCallback(() => setHelpOpen(false), [])

  // Global keyboard shortcuts: Ctrl+1/2/3 → tools, Ctrl+, → Settings, ? → Help
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      // ? → toggle help (no Ctrl needed)
      if (!e.ctrlKey && e.key === '?') { e.preventDefault(); setHelpOpen(prev => !prev); return }
      if (!e.ctrlKey) return
      const route = ROUTE_SHORTCUTS[e.key]
      if (route) { e.preventDefault(); navigate(route) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])

  useEffect(() => {
    ws.connect()
  }, [])

  useEffect(() => {
    return ws.on('ws_status', d => {
      if (!d.connected) toast.warning('Backend disconnected — retrying…')
      else              toast.success('Backend reconnected')
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!contentRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setDims({ contentWidth: width, contentHeight: height })
    })
    ro.observe(contentRef.current)
    return () => ro.disconnect()
  }, [])

  return (
    <ShellContext.Provider value={dims}>
      <div className={styles.shell}>
        <Particles
          className={styles.particlesLayer}
          quantity={35}
          size={0.5}
          color="#C77DFF"
          staticity={80}
          ease={60}
        />
        <aside className={styles.sidebar}>
          <Sidebar />
        </aside>
        <main className={styles.content} ref={contentRef}>
          <AnimatePresence mode="wait" initial={false}>
            <Outlet key={location.pathname.split('/')[1]} />
          </AnimatePresence>
          <CinematicOverlay />
        </main>
        <div className={styles.statusbar}>
          <GpuStatusBar />
        </div>
        <ToastStack />
        <HelpModal open={helpOpen} onClose={closeHelp} />
        <CursorGlow />
        <CommandPalette open={cmdPalette.open} onClose={cmdPalette.close} />
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--surface-3)',
              border:     '1px solid var(--border-default)',
              color:      'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              fontSize:   '13px',
            },
          }}
        />
      </div>
    </ShellContext.Provider>
  )
}
