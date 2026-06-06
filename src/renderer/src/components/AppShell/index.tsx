import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import Sidebar from '../Sidebar'
import GpuStatusBar from '../GpuStatusBar'
import { ToastStack } from '../ToastStack'
import { HelpModal } from '../HelpModal'
import styles from './AppShell.module.css'
import { ws } from '../../lib/ws'
import { useToast } from '../../context/Toast'

interface ShellDims {
  contentWidth: number
  contentHeight: number
}

const ShellContext = createContext<ShellDims>({ contentWidth: 0, contentHeight: 0 })
export const useShell = (): ShellDims => useContext(ShellContext)

// Routes in order — Ctrl+1, Ctrl+2, Ctrl+3 navigate; Ctrl+, opens Settings
const ROUTE_SHORTCUTS: Record<string, string> = {
  '1': '/daw',
  '2': '/pipeline',
  '3': '/splitter',
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
  const toast    = useToast()
  const navigate = useNavigate()

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
        <aside className={styles.sidebar}>
          <Sidebar />
        </aside>
        <main className={styles.content} ref={contentRef}>
          <Outlet />
        </main>
        <div className={styles.statusbar}>
          <GpuStatusBar />
        </div>
        <ToastStack />
        <HelpModal open={helpOpen} onClose={closeHelp} />
      </div>
    </ShellContext.Provider>
  )
}
