import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ws, type ScanProgressEvent, type ScanCompleteEvent } from '../../lib/ws'
import { endpoints } from '../../lib/api'
import logoImg from '../../assets/logo.png'
import styles from './SplashScreen.module.css'

const TOOLS = [
  { label: 'Signal Flow', sub: 'Node-based DAW engine' },
  { label: 'Pipeline',    sub: 'STT · TTS · STS · TTT' },
  { label: 'Splitter',    sub: 'AI stem separation' },
]

const MIN_HOLD_MS = 3400 // minimum splash hold time

export default function SplashScreen(): JSX.Element {
  const navigate = useNavigate()
  const [progress, setProgress]       = useState(0)
  const [statusMsg, setStatusMsg]     = useState('Connecting to backend…')
  const [ready, setReady]             = useState(false)
  const [toolsIn, setToolsIn]         = useState(false)
  const [exiting, setExiting]         = useState(false)
  const navigatedRef                  = useRef(false)
  const scheduleCalledRef             = useRef(false)

  function goToDaw() {
    if (navigatedRef.current) return
    navigatedRef.current = true
    navigate('/daw')
  }

  // Track mount time for minimum hold calculation
  const _mountTime = useRef(Date.now()).current

  // Enforce minimum hold: trigger exit fade 400ms before navigation
  function scheduleNav() {
    if (scheduleCalledRef.current) return
    scheduleCalledRef.current = true
    const elapsed   = Date.now() - _mountTime
    const remaining = Math.max(0, MIN_HOLD_MS - elapsed)
    setTimeout(() => setExiting(true), remaining)
    setTimeout(goToDaw, remaining + 420)
  }

  useEffect(() => {
    // Stagger tool pills in after 600ms
    const pillTimer = setTimeout(() => setToolsIn(true), 600)

    ws.connect()

    const unsubs = [
      ws.on('scan_progress', (d: ScanProgressEvent) => {
        const pct = d.total > 0 ? Math.round((d.scanned / d.total) * 100) : 0
        setProgress(pct)
        setStatusMsg(`Scanning ${d.current_dir}`)
      }),
      ws.on('scan_complete', (_: ScanCompleteEvent) => {
        setProgress(100)
        setStatusMsg('Ready')
        setReady(true)
        scheduleNav()
      }),
    ]

    // Fallback: poll REST health
    const pollTimer = setInterval(async () => {
      try {
        await endpoints.health()
        setStatusMsg('Backend ready')
        setProgress(100)
        setReady(true)
        clearInterval(pollTimer)
        scheduleNav()
      } catch { /* still connecting */ }
    }, 2500)

    // Hard fallback: 12s max (longer than before to respect min hold feel)
    const hardFallback = setTimeout(() => {
      clearInterval(pollTimer)
      goToDaw()
    }, 12000)

    return () => {
      clearTimeout(pillTimer)
      unsubs.forEach(u => u())
      clearInterval(pollTimer)
      clearTimeout(hardFallback)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={`${styles.splash}${exiting ? ` ${styles.splashExiting}` : ''}`}>
      {/* Animated bar field — EQ visualizer backdrop */}
      <div className={styles.barField} aria-hidden="true">
        {Array.from({ length: 52 }, (_, i) => (
          <div
            key={i}
            className={styles.barFieldBar}
            style={{
              '--spd':   `${3.4 + (i % 7) * 0.55}s`,
              '--delay': `${((i / 52) * 3400).toFixed(0)}ms`,
              '--maxH':  `${24 + (i % 9) * 11}px`,
              '--col':   i % 3 === 0
                ? 'var(--secondary)'
                : 'var(--primary)',
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Logo ghost — screen blend: black → transparent, neon → glows */}
      <img
        src={logoImg}
        className={styles.logoGhost}
        alt=""
        aria-hidden="true"
        draggable={false}
      />

      <div className={styles.center}>
        <h1 className={`${styles.wordmark} font-display`}>AlpHUB</h1>
        <div className={styles.wordmarkSep} aria-hidden="true" />
        <p className={styles.tagline}>Personal Audio Intelligence Hub</p>

        {/* Tool pills */}
        <ul className={`${styles.toolList}${toolsIn ? ` ${styles.toolListIn}` : ''}`}>
          {TOOLS.map((t, i) => (
            <li
              key={t.label}
              className={styles.toolPill}
              style={{ '--i': i } as React.CSSProperties}
            >
              <span className={styles.toolPillLabel}>{t.label}</span>
              <span className={styles.toolPillSub}>{t.sub}</span>
            </li>
          ))}
        </ul>

        <div className={styles.progressArea}>
          <div className={styles.track}>
            <div
              className={`${styles.fill} ${!ready ? 'animate-shimmer' : ''}`}
              style={{ transform: `scaleX(${progress / 100})` }}
            />
          </div>
          <p className={styles.status}>{statusMsg}</p>
        </div>
      </div>

      <p className={styles.version}>v0.1.0</p>
    </div>
  )
}
