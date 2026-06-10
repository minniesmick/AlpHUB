import { useEffect, useRef, useCallback } from 'react'
import styles from './SpectrumCanvas.module.css'

interface Props {
  data?: number[]        // normalized 0–1 amplitude per FFT bin
  frozen?: boolean
  barGap?: number        // px between bars (default 1)
  className?: string
}

const IDLE_BARS        = 64
const DECAY_FACTOR     = 0.82   // per-frame decay (~17ms frames → ~50ms to half)
const PEAK_HOLD_FRAMES = 45     // frames at peak before sliding down (~750ms @ 60fps)
const PEAK_DECAY       = 0.963  // per-frame peak marker fall rate

export function SpectrumCanvas({ data, frozen = false, barGap = 1, className }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const rafRef       = useRef<number | null>(null)
  const smoothedRef  = useRef<Float32Array>(new Float32Array(IDLE_BARS))
  const peaksRef     = useRef<Float32Array>(new Float32Array(IDLE_BARS))
  const holdCntRef   = useRef<Float32Array>(new Float32Array(IDLE_BARS))
  const dataRef      = useRef<number[] | undefined>(undefined)
  const frozenRef    = useRef(frozen)
  frozenRef.current  = frozen
  dataRef.current    = data

  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w    = canvas.width
    const h    = canvas.height
    const bins = dataRef.current ?? []
    const n    = bins.length || IDLE_BARS

    // Resize smoothed/peak buffers if bin count changed
    if (smoothedRef.current.length !== n) {
      smoothedRef.current = new Float32Array(n)
      peaksRef.current    = new Float32Array(n)
      holdCntRef.current  = new Float32Array(n)
    }

    const smoothed = smoothedRef.current
    const peaks    = peaksRef.current
    const holdCnt  = holdCntRef.current

    // Update smoothed heights + peak hold per bin
    if (!frozenRef.current) {
      for (let i = 0; i < n; i++) {
        const target = bins[i] ?? 0
        smoothed[i]  = smoothed[i] * DECAY_FACTOR + target * (1 - DECAY_FACTOR)

        if (smoothed[i] >= peaks[i]) {
          peaks[i]    = smoothed[i]
          holdCnt[i]  = PEAK_HOLD_FRAMES
        } else if (holdCnt[i] > 0) {
          holdCnt[i]--
        } else {
          peaks[i] = Math.max(0, peaks[i] * PEAK_DECAY)
        }
      }
    }

    ctx.clearRect(0, 0, w, h)

    const barW = Math.max(1, (w - (n - 1) * barGap) / n)

    // Full-height gradient — bars reveal only their slice of it
    const grad = ctx.createLinearGradient(0, h, 0, 0)
    if (frozenRef.current) {
      grad.addColorStop(0, 'rgba(199,125,255,0.22)')
      grad.addColorStop(1, 'rgba(199,125,255,0.22)')
    } else {
      grad.addColorStop(0.00, '#F72585')
      grad.addColorStop(0.55, '#C77DFF')
      grad.addColorStop(1.00, '#9B4DFF')
    }

    for (let i = 0; i < n; i++) {
      const amp  = frozenRef.current ? (bins[i] ?? 0) : smoothed[i]
      const barH = Math.max(1, amp * h)
      const x    = i * (barW + barGap)
      const y    = h - barH

      ctx.fillStyle = grad
      ctx.fillRect(x, y, barW, barH)

      // Glow cap — tiny bright strip at top of each active bar
      if (!frozenRef.current && amp > 0.12) {
        ctx.save()
        ctx.shadowBlur  = barW * 3
        ctx.shadowColor = '#C77DFF'
        ctx.fillStyle   = 'rgba(199,125,255,0.92)'
        ctx.fillRect(x, y, barW, 1.5)
        ctx.restore()
      }

      // Peak hold marker — 1px hot-pink line that holds then slides down
      if (!frozenRef.current && peaks[i] > 0.06) {
        const peakY = h - peaks[i] * h
        const alpha = Math.min(0.9, peaks[i] * 1.8)
        ctx.fillStyle = `rgba(247,37,133,${alpha.toFixed(2)})`
        ctx.fillRect(x, peakY, barW, 1)
      }
    }

    // Idle noise floor
    if (!bins.length) {
      ctx.strokeStyle = 'rgba(199,125,255,0.09)'
      ctx.lineWidth   = 1
      ctx.beginPath()
      ctx.moveTo(0, h - 2)
      ctx.lineTo(w, h - 2)
      ctx.stroke()
    }
  }, [barGap])

  // Continuous rAF loop — drives smooth decay even without new WS events
  useEffect(() => {
    let running = true
    const loop = () => {
      if (!running) return
      renderFrame()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      running = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [renderFrame])

  // Resize observer — keeps canvas resolution in sync with CSS size
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        canvas.width  = Math.round(width  * devicePixelRatio)
        canvas.height = Math.round(height * devicePixelRatio)
      }
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  return (
    <div className={`${styles.root}${className ? ` ${className}` : ''}`}>
      <canvas ref={canvasRef} className={styles.canvas} />
      {frozen && (
        <div className={styles.frozenOverlay}>
          <span className={styles.frozenBadge}>Frozen</span>
        </div>
      )}
    </div>
  )
}
