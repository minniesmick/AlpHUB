import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { Workflow, ArrowRightLeft, Layers, Settings2, Activity, FolderGit2, ImagePlay } from 'lucide-react'
import { ws } from '@renderer/lib/ws'
import { NAV_SPRING } from '@renderer/lib/motion'
import { useTextScramble } from '@renderer/hooks/useTextScramble'
import styles from './Sidebar.module.css'

const ITEM_SLOT = 40   // 36px height + 4px gap (--space-1)
const TOP_PAD   = 8    // --space-2

const tools = [
  { to: '/daw',      icon: Workflow,       label: 'Signal Flow',      shortcut: 'Ctrl+1' },
  { to: '/pipeline', icon: ArrowRightLeft, label: 'Pipeline',         shortcut: 'Ctrl+2' },
  { to: '/splitter', icon: Layers,         label: 'Splitter',         shortcut: 'Ctrl+3' },
  { to: '/monitor',  icon: Activity,       label: 'Monitor',          shortcut: 'Ctrl+4' },
  { to: '/projects', icon: FolderGit2,     label: 'Projects',         shortcut: 'Ctrl+5' },
  { to: '/imagegen', icon: ImagePlay,      label: 'Image Gen',        shortcut: 'Ctrl+6' },
]

const EXPAND_SPRING = { type: 'spring' as const, stiffness: 240, damping: 28 }
const LABEL_TRANS   = { duration: 0.14, ease: [0, 0, 0.2, 1] as [number, number, number, number] }

// ── Scramble tooltip nav item ─────────────────────────────────────────────────

interface NavItemProps {
  to:        string
  icon:      React.ElementType
  label:     string
  shortcut:  string
  isActive:  boolean
  glitching: boolean
  expanded:  boolean
  extra?:    React.ReactNode
}

const STEM_DRAG_EVENT = 'stem-drag-over'

function NavItemWithScramble({ to, icon: Icon, label, shortcut, isActive, glitching, expanded, extra }: NavItemProps) {
  const [hovered, setHovered] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const { display, scramble, reset } = useTextScramble(label)

  useEffect(() => {
    const handler = (e: Event) => {
      const route = (e as CustomEvent<{ route: string | null }>).detail.route
      setDragOver(route === to)
    }
    window.addEventListener(STEM_DRAG_EVENT, handler)
    return () => window.removeEventListener(STEM_DRAG_EVENT, handler)
  }, [to])

  return (
    <li className={styles.navLi}>
      {isActive && (
        <motion.div layoutId="nav-indicator" className={styles.indicator} transition={NAV_SPRING} aria-hidden="true" />
      )}
      <NavLink
        to={to}
        data-nav-route={to}
        className={({ isActive: a }) =>
          `${styles.navItem}${a ? ` ${styles.active}` : ''}${expanded ? ` ${styles.navItemExpanded}` : ''}${dragOver ? ` ${styles.navItemDropTarget}` : ''}`
        }
        aria-label={`${label} (${shortcut})`}
        onMouseEnter={() => { setHovered(true); if (!expanded) scramble() }}
        onMouseLeave={() => { setHovered(false); if (!expanded) reset() }}
      >
        <Icon size={18} strokeWidth={1.5} aria-hidden="true" className={glitching ? 'animate-glitch' : undefined} />
        <AnimatePresence>
          {expanded && (
            <motion.span
              className={styles.navLabel}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={LABEL_TRANS}
            >
              {label}
            </motion.span>
          )}
        </AnimatePresence>
        {dragOver && <span className={styles.dropIndicator} aria-hidden="true" />}
        {extra}
      </NavLink>
      <AnimatePresence>
        {hovered && !expanded && !dragOver && (
          <motion.span
            className={styles.tooltip}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.12 }}
            aria-hidden="true"
          >
            {display}
            <span className={styles.tooltipShortcut}>{shortcut}</span>
          </motion.span>
        )}
      </AnimatePresence>
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Sidebar(): JSX.Element {
  const [streamActive, setStreamActive] = useState(false)
  const [glitching, setGlitching] = useState<string | null>(null)
  const [bloomTop, setBloomTop] = useState(TOP_PAD + 18)
  const [expanded, setExpanded] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const location = useLocation()
  const prevPath = useRef(location.pathname)

  useEffect(() => {
    return ws.on('stream_status', d => setStreamActive(d.active))
  }, [])

  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      prevPath.current = location.pathname
      setGlitching(location.pathname)
      const t = setTimeout(() => setGlitching(null), 300)
      return () => clearTimeout(t)
    }
  }, [location.pathname])

  const isActive = (to: string) => location.pathname.startsWith(to)

  useLayoutEffect(() => {
    const activeIdx = tools.findIndex(({ to }) => location.pathname.startsWith(to))
    if (activeIdx >= 0) {
      setBloomTop(TOP_PAD + activeIdx * ITEM_SLOT + 18)
    } else if (location.pathname.startsWith('/settings') && navRef.current) {
      setBloomTop(navRef.current.offsetHeight - 26)
    }
  }, [location.pathname])

  return (
    <motion.nav
      ref={navRef as React.RefObject<HTMLElement>}
      className={styles.sidebar}
      animate={{ width: expanded ? 148 : 50 }}
      transition={EXPAND_SPRING}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      aria-label="Main navigation"
      data-expanded={expanded}
    >
      <motion.div
        className={styles.bloom}
        animate={{ top: bloomTop }}
        transition={{ type: 'spring', stiffness: 200, damping: 26 }}
        aria-hidden="true"
      />
      <ul className={styles.toolList}>
        {tools.map(({ to, icon: Icon, label, shortcut }) => (
          <NavItemWithScramble
            key={to}
            to={to}
            icon={Icon}
            label={label}
            shortcut={shortcut}
            isActive={isActive(to)}
            glitching={!!glitching?.startsWith(to)}
            expanded={expanded}
            extra={to === '/daw' && streamActive
              ? <span className={styles.streamDot} aria-label="Audio stream active" />
              : undefined}
          />
        ))}
      </ul>

      <ul className={styles.bottomList}>
        <NavItemWithScramble
          to="/settings"
          icon={Settings2}
          label="Settings"
          shortcut="Ctrl+,"
          isActive={isActive('/settings')}
          glitching={!!glitching?.startsWith('/settings')}
          expanded={expanded}
        />
      </ul>
    </motion.nav>
  )
}
