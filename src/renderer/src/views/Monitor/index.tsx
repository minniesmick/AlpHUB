import { useEffect, useRef, useState } from 'react'
import { motion, useSpring, useTransform } from 'motion/react'
import { endpoints, type SystemMetrics } from '@renderer/lib/api'
import { useTilt } from '@renderer/hooks/useTilt'
import { PageTransition } from '@renderer/components/PageTransition'
import { METER_SPRING, BAR_SPRING } from '@renderer/lib/motion'
import { SkeletonRing, SkeletonCard } from '@renderer/components/Skeleton'
import styles from './Monitor.module.css'

// ── constants ──────────────────────────────────────────────────────────────────

const POLL_MS      = 2000
const HISTORY_LEN  = 60
const RING_R       = 44
const RING_CIRC    = 2 * Math.PI * RING_R   // ≈ 276.5

// ── helpers ────────────────────────────────────────────────────────────────────

function tempColor(t: number | null): string {
  if (t === null) return 'var(--text-secondary)'
  if (t < 55) return '#39D98A'     // cool — green
  if (t < 75) return '#C77DFF'     // warm — purple
  return '#F72585'                 // hot — pink
}

// ── Sparkline canvas ───────────────────────────────────────────────────────────

function Sparkline({ history, color, label }: { history: number[]; color: string; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d'); if (!ctx) return
    const dpr = devicePixelRatio || 1
    const w   = c.clientWidth  * dpr
    const h   = c.clientHeight * dpr
    c.width  = w; c.height = h

    ctx.clearRect(0, 0, w, h)
    if (history.length < 2) return

    const max  = Math.max(...history, 1)
    const step = w / (history.length - 1)

    // Fill gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0,   color + 'AA')
    grad.addColorStop(1,   color + '00')

    ctx.beginPath()
    history.forEach((v, i) => {
      const x = i * step
      const y = h - (v / max) * h * 0.85 - h * 0.05
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.lineTo((history.length - 1) * step, h)
    ctx.lineTo(0, h)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // Line
    ctx.beginPath()
    history.forEach((v, i) => {
      const x = i * step
      const y = h - (v / max) * h * 0.85 - h * 0.05
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.strokeStyle = color
    ctx.lineWidth   = 1.5 * dpr
    ctx.lineJoin    = 'round'
    ctx.stroke()
  }, [history, color])

  return <canvas ref={ref} className={styles.sparkCanvas} aria-label={label} />
}

// ── Ring meter ─────────────────────────────────────────────────────────────────

function RingMeter({ pct, color, label, sub }: { pct: number; color: string; label: string; sub?: string }) {
  const spring     = useSpring(pct, METER_SPRING)
  const dashOffset = useTransform(spring, v => RING_CIRC * (1 - v / 100))
  const displayPct = useTransform(spring, v => `${Math.round(v)}%`)

  const tilt        = useTilt({ maxAngle: 4 })
  const filterStyle = useTransform(tilt.brightness, b => `brightness(${b})`)

  return (
    <motion.div
      className={styles.ringCard}
      style={{ rotateX: tilt.rotateX, rotateY: tilt.rotateY, filter: filterStyle, transformPerspective: 600 }}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
    >
      <div className={styles.ringLabel}>{label}</div>
      <svg width="108" height="108" viewBox="0 0 108 108" aria-hidden="true">
        {/* Track */}
        <circle cx="54" cy="54" r={RING_R} fill="none"
          stroke="var(--surface-4)" strokeWidth="7" />
        {/* Fill */}
        <motion.circle
          cx="54" cy="54" r={RING_R} fill="none"
          stroke={color} strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={RING_CIRC}
          style={{ strokeDashoffset: dashOffset }}
          transform="rotate(-90 54 54)"
          filter={`drop-shadow(0 0 6px ${color}88)`}
        />
      </svg>
      <motion.div className={styles.ringValue} style={{ color }}>
        {displayPct}
      </motion.div>
      {sub && <div className={styles.ringSub}>{sub}</div>}
    </motion.div>
  )
}

// ── Bar (VRAM, Disk) ────────────────────────────────────────────────────────────

function SpringBar({ pct, className }: { pct: number; className: string }) {
  const spring = useSpring(pct / 100, BAR_SPRING)
  const scaleX = useTransform(spring, v => v)
  useEffect(() => { spring.set(pct / 100) }, [pct, spring])
  return <motion.div className={className} style={{ scaleX }} />
}

// ── Spring number ───────────────────────────────────────────────────────────────

function SpringNum({ value, decimals = 0, unit = '' }: { value: number; decimals?: number; unit?: string }) {
  const spring  = useSpring(value, BAR_SPRING)
  const display = useTransform(spring, v => `${v.toFixed(decimals)}${unit}`)
  useEffect(() => { spring.set(value) }, [value, spring])
  return <motion.span>{display}</motion.span>
}

// ── Main view ───────────────────────────────────────────────────────────────────

function pushHistory(arr: number[], val: number): number[] {
  const next = [...arr, val]
  return next.length > HISTORY_LEN ? next.slice(-HISTORY_LEN) : next
}

export default function MonitorView(): JSX.Element {
  const [metrics,    setMetrics]    = useState<SystemMetrics | null>(null)
  const [cpuHist,    setCpuHist]    = useState<number[]>([])
  const [ramHist,    setRamHist]    = useState<number[]>([])
  const [gpuHist,    setGpuHist]    = useState<number[]>([])
  const [netRecvHist, setNetRecvHist] = useState<number[]>([])
  const [netSentHist, setNetSentHist] = useState<number[]>([])
  const prevNet = useRef<{ recv: number; sent: number } | null>(null)

  useEffect(() => {
    let alive = true
    const poll = async () => {
      if (!alive) return
      try {
        const m = await endpoints.systemMetrics()
        if (!alive) return
        setMetrics(m)
        setCpuHist(h => pushHistory(h, m.cpu_pct))
        setRamHist(h => pushHistory(h, m.ram_pct))
        setGpuHist(h => pushHistory(h, m.gpu_pct ?? 0))

        // Net delta (MB/s approximation)
        if (prevNet.current) {
          const dr = Math.max(0, m.net_recv_mb - prevNet.current.recv)
          const ds = Math.max(0, m.net_sent_mb - prevNet.current.sent)
          setNetRecvHist(h => pushHistory(h, dr))
          setNetSentHist(h => pushHistory(h, ds))
        }
        prevNet.current = { recv: m.net_recv_mb, sent: m.net_sent_mb }
      } catch { /* backend not running */ }
    }

    void poll()
    const id = setInterval(poll, POLL_MS)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const gpuPct  = metrics?.gpu_pct  ?? 0
  const gpuUsed = metrics?.gpu_mem_used_gb  ?? 0
  const gpuTot  = metrics?.gpu_mem_total_gb ?? 0
  const vramPct = gpuTot > 0 ? (gpuUsed / gpuTot) * 100 : 0

  const ambientColor = tempColor(metrics?.gpu_temp ?? null)

  return (
    <PageTransition>
      <div className={styles.view}>
        <div className={styles.ambientOrb} style={{ backgroundColor: ambientColor }} />
        <div className={styles.toolbar}>
          <span className={styles.toolbarTitle}>System Monitor</span>
          {metrics && <span className={styles.dot} aria-label="Live" />}
        </div>

        <div className={styles.body}>
          {!metrics ? (
            <>
              <div className={styles.ringRow}>
                <SkeletonRing />
                <SkeletonRing />
                <SkeletonRing />
              </div>
              <div className={styles.sparkGrid}>
                {[0,1,2,3].map(i => <SkeletonCard key={i} lines={2} header="55%" />)}
              </div>
              <SkeletonCard lines={1} header="80%" />
            </>
          ) : (
            <>
              {/* Ring meters */}
              <div className={styles.ringRow}>
                <RingMeter
                  pct={metrics.cpu_pct}
                  color="var(--primary)"
                  label="CPU"
                  sub={`${metrics.cpu_pct.toFixed(1)}%`}
                />
                <RingMeter
                  pct={metrics.ram_pct}
                  color="var(--secondary)"
                  label="RAM"
                  sub={`${metrics.ram_used_gb} / ${metrics.ram_total_gb} GB`}
                />
                <RingMeter
                  pct={gpuPct}
                  color="#00C2C7"
                  label="GPU"
                  sub={metrics.gpu_name ? metrics.gpu_name.replace('NVIDIA GeForce ', '') : 'No GPU'}
                />
              </div>

              {/* GPU detail */}
              {metrics.gpu_name && (
                <div className={styles.gpuCard}>
                  <div className={styles.gpuCardRow}>
                    <span className={styles.gpuName}>{metrics.gpu_name}</span>
                    <span className={styles.gpuTemp} style={{ color: tempColor(metrics.gpu_temp) }}>
                      {metrics.gpu_temp !== null ? `${metrics.gpu_temp}°C` : '—'}
                    </span>
                  </div>
                  <div className={styles.gpuCardRow}>
                    <span className={styles.vramLabel}>VRAM</span>
                    <div className={styles.vramTrack}>
                      <SpringBar pct={vramPct} className={styles.vramFill} />
                    </div>
                    <span className={styles.vramText}>{gpuUsed.toFixed(1)} / {gpuTot.toFixed(1)} GB</span>
                  </div>
                </div>
              )}

              {/* Sparklines */}
              <div className={styles.sparkGrid}>
                <div className={styles.sparkCard}>
                  <div className={styles.sparkHeader}>
                    <span className={styles.sparkLabel}>CPU History</span>
                    <span className={styles.sparkValue}>{metrics.cpu_pct.toFixed(1)}%</span>
                  </div>
                  <Sparkline history={cpuHist} color="var(--primary)" label="CPU history" />
                </div>

                <div className={styles.sparkCard}>
                  <div className={styles.sparkHeader}>
                    <span className={styles.sparkLabel}>RAM History</span>
                    <span className={styles.sparkValue}>{metrics.ram_pct.toFixed(1)}%</span>
                  </div>
                  <Sparkline history={ramHist} color="var(--secondary)" label="RAM history" />
                </div>

                {metrics.gpu_name && (
                  <div className={styles.sparkCard}>
                    <div className={styles.sparkHeader}>
                      <span className={styles.sparkLabel}>GPU History</span>
                      <span className={styles.sparkValue}>{gpuPct}%</span>
                    </div>
                    <Sparkline history={gpuHist} color="#00C2C7" label="GPU history" />
                  </div>
                )}

                <div className={styles.sparkCard}>
                  <div className={styles.sparkHeader}>
                    <span className={styles.sparkLabel}>Network</span>
                    <span className={styles.sparkValue}>{netRecvHist.at(-1)?.toFixed(2) ?? '0'} MB</span>
                  </div>
                  <Sparkline history={netRecvHist} color="var(--primary)" label="Network recv" />
                  <Sparkline history={netSentHist} color="var(--secondary)" label="Network sent" />
                </div>
              </div>

              {/* Disk */}
              <div className={styles.diskCard}>
                <span className={styles.diskLabel}>Disk C:</span>
                <div className={styles.diskTrack}>
                  <SpringBar pct={metrics.disk_pct} className={styles.diskFill} />
                </div>
                <span className={styles.diskText}>
                  {metrics.disk_used_gb} / {metrics.disk_total_gb} GB ({metrics.disk_pct}%)
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </PageTransition>
  )
}
