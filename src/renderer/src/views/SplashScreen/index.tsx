import { useEffect, useRef, useState } from 'react'
import { motion, useSpring, useTransform } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { ws, type ScanProgressEvent, type ScanCompleteEvent } from '../../lib/ws'
import { endpoints } from '../../lib/api'
import logoImg from '../../assets/logo.png'
import { Meteors } from '@/components/ui/meteors'
import styles from './SplashScreen.module.css'

const TOOLS = [
  { label: 'Signal Flow', sub: 'Node-based DAW engine' },
  { label: 'Pipeline',    sub: 'STT · TTS · STS · TTT' },
  { label: 'Splitter',    sub: 'AI stem separation' },
]

const MIN_HOLD_MS = 3400

// ── Spring number ──────────────────────────────────────────────────────────────

const NUM_SPRING = { stiffness: 180, damping: 22 }

function SpringNum({ value }: { value: number }) {
  const spring = useSpring(value, NUM_SPRING)
  useEffect(() => { spring.set(value) }, [value, spring])
  return (
    <motion.span>
      {useTransform(spring, v => Math.round(v).toLocaleString())}
    </motion.span>
  )
}

// ── SVG logo overlay with path draw-in ────────────────────────────────────────

function SplashLogo(): JSX.Element {
  const outerLen  = useSpring(0, { stiffness: 55, damping: 18 })
  const innerLen  = useSpring(0, { stiffness: 50, damping: 20 })
  const tickLen   = useSpring(0, { stiffness: 90, damping: 22 })

  useEffect(() => {
    const t1 = setTimeout(() => outerLen.set(1), 80)
    const t2 = setTimeout(() => innerLen.set(1), 320)
    const t3 = setTimeout(() => tickLen.set(1), 560)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <svg
      className={styles.splashSvg}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Outer ring — full circle, primary */}
      <motion.path
        d="M 100 10 A 90 90 0 1 1 99.9 10"
        fill="none"
        stroke="#C77DFF"
        strokeWidth="1.5"
        strokeLinecap="round"
        style={{ pathLength: outerLen, opacity: 0.5, rotate: -90, originX: '50%', originY: '50%' }}
      />
      {/* Inner arc — 240° arc, secondary */}
      <motion.path
        d="M 100 26 A 74 74 0 1 1 26 100"
        fill="none"
        stroke="#F72585"
        strokeWidth="1"
        strokeLinecap="round"
        style={{ pathLength: innerLen, opacity: 0.4 }}
      />
      {/* Corner ticks at 4 cardinal points */}
      <motion.path
        d="M 100 10 L 100 20 M 190 100 L 180 100 M 100 190 L 100 180 M 10 100 L 20 100"
        fill="none"
        stroke="#C77DFF"
        strokeWidth="2"
        strokeLinecap="round"
        style={{ pathLength: tickLen, opacity: 0.7 }}
      />
    </svg>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SplashScreen(): JSX.Element {
  const navigate = useNavigate()
  const [progress, setProgress]       = useState(0)
  const [statusMsg, setStatusMsg]     = useState('Connecting to backend…')
  const [ready, setReady]             = useState(false)
  const [toolsIn, setToolsIn]         = useState(false)
  const [exiting, setExiting]         = useState(false)
  const [scanCurrent, setScanCurrent] = useState(0)
  const [scanTotal, setScanTotal]     = useState(0)
  const navigatedRef                  = useRef(false)
  const scheduleCalledRef             = useRef(false)

  function goToDaw() {
    if (navigatedRef.current) return
    navigatedRef.current = true
    navigate('/daw')
  }

  const _mountTime = useRef(Date.now()).current

  function scheduleNav() {
    if (scheduleCalledRef.current) return
    scheduleCalledRef.current = true
    const elapsed   = Date.now() - _mountTime
    const remaining = Math.max(0, MIN_HOLD_MS - elapsed)
    setTimeout(() => setExiting(true), remaining)
    setTimeout(goToDaw, remaining + 420)
  }

  useEffect(() => {
    const pillTimer = setTimeout(() => setToolsIn(true), 600)

    ws.connect()

    const unsubs = [
      ws.on('scan_progress', (d: ScanProgressEvent) => {
        const pct = d.total > 0 ? Math.round((d.scanned / d.total) * 100) : 0
        setProgress(pct)
        setScanCurrent(d.scanned)
        setScanTotal(d.total)
        setStatusMsg(`Scanning ${d.current_dir}`)
      }),
      ws.on('scan_complete', (_: ScanCompleteEvent) => {
        setProgress(100)
        setStatusMsg('Ready')
        setReady(true)
        scheduleNav()
      }),
    ]

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
      <Meteors number={10} minDuration={3} maxDuration={9} angle={215} className="bg-[var(--primary)] opacity-40" />
      {/* Animated EQ bar field */}
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

      {/* PNG ghost */}
      <img
        src={logoImg}
        className={styles.logoGhost}
        alt=""
        aria-hidden="true"
        draggable={false}
      />

      {/* SVG path draw-in overlay */}
      <SplashLogo />

      <div className={styles.center}>
        <h1 className={`${styles.wordmark} font-display`}>AlpHUB</h1>
        <div className={styles.wordmarkSep} aria-hidden="true" />
        <p className={styles.tagline}>Personal Audio Intelligence Hub</p>

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
          {scanTotal > 0 && (
            <p className={styles.scanCount} aria-live="polite">
              <SpringNum value={scanCurrent} />
              {' / '}
              <SpringNum value={scanTotal} />
              {' files'}
            </p>
          )}
        </div>
      </div>

      <p className={styles.version}>v0.1.0</p>
    </div>
  )
}
