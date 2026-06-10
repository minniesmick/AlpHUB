import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'motion/react'
import { Workflow, ArrowRightLeft, Layers, Settings2 } from 'lucide-react'
import { ws } from '@renderer/lib/ws'
import styles from './Sidebar.module.css'

const tools = [
  { to: '/daw',      icon: Workflow,         label: 'Signal Flow', shortcut: 'Ctrl+1' },
  { to: '/pipeline', icon: ArrowRightLeft,   label: 'Pipeline',    shortcut: 'Ctrl+2' },
  { to: '/splitter', icon: Layers,           label: 'Splitter',    shortcut: 'Ctrl+3' },
]

const NAV_SPRING = { type: 'spring' as const, stiffness: 320, damping: 28 }

export default function Sidebar(): JSX.Element {
  const [streamActive, setStreamActive] = useState(false)
  const location = useLocation()

  useEffect(() => {
    return ws.on('stream_status', d => setStreamActive(d.active))
  }, [])

  const isActive = (to: string) => location.pathname.startsWith(to)

  return (
    <nav className={styles.sidebar} aria-label="Main navigation">
      <ul className={styles.toolList}>
        {tools.map(({ to, icon: Icon, label, shortcut }) => (
          <li key={to} className={styles.navLi}>
            {isActive(to) && (
              <motion.div
                layoutId="nav-indicator"
                className={styles.indicator}
                transition={NAV_SPRING}
                aria-hidden="true"
              />
            )}
            <NavLink
              to={to}
              className={({ isActive: a }) => `${styles.navItem}${a ? ` ${styles.active}` : ''}`}
              aria-label={`${label} (${shortcut})`}
              title={`${label} — ${shortcut}`}
            >
              <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
              {to === '/daw' && streamActive && (
                <span className={styles.streamDot} aria-label="Audio stream active" />
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <ul className={styles.bottomList}>
        <li className={styles.navLi}>
          {isActive('/settings') && (
            <motion.div
              layoutId="nav-indicator"
              className={styles.indicator}
              transition={NAV_SPRING}
              aria-hidden="true"
            />
          )}
          <NavLink
            to="/settings"
            className={({ isActive: a }) => `${styles.navItem}${a ? ` ${styles.active}` : ''}`}
            aria-label="Settings (Ctrl+,)"
            title="Settings — Ctrl+,"
          >
            <Settings2 size={20} strokeWidth={1.5} aria-hidden="true" />
          </NavLink>
        </li>
      </ul>
    </nav>
  )
}
