import { useEffect, useRef, useCallback } from 'react'
import styles from './SpectrumCanvas.module.css'

interface Props {
  data?: number[]        // normalized 0–1 amplitude per FFT bin
  frozen?: boolean
  barGap?: number        // px between bars (default 1)
  className?: string
}

const COLOR_BOTTOM = '#F72585'
const COLOR_TOP    = '#C77DFF'
const IDLE_BARS    = 64

function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  bins: number[],
  barGap: number,
  frozen: boolean,
): void {
  ctx.clearRect(0, 0, w, h)

  const n       = bins.length || IDLE_BARS
  const barW    = Math.max(1, (w - (n - 1) * barGap) / n)

  const grad = ctx.createLinearGradient(0, h, 0, 0)
  grad.addColorStop(0,    COLOR_BOTTOM)
  grad.addColorStop(0.6,  '#C77DFF')
  grad.addColorStop(1,    COLOR_TOP)

  ctx.fillStyle = frozen ? 'rgba(199, 125, 255, 0.35)' : grad

  for (let i = 0; i < n; i++) {
    const amp  = bins[i] ?? 0
    const barH = Math.max(1, amp * h)
    const x    = i * (barW + barGap)
    const y    = h - barH
    ctx.fillRect(x, y, barW, barH)
  }

  // Idle noise floor line
  if (!bins.length) {
    ctx.strokeStyle = 'rgba(199, 125, 255, 0.12)'
    ctx.lineWidth   = 1
    ctx.beginPath()
    ctx.moveTo(0, h - 2)
    ctx.lineTo(w, h - 2)
    ctx.stroke()
  }
}

export function SpectrumCanvas({ data, frozen = false, barGap = 1, className }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const rafRef     = useRef<number | null>(null)
  const frozenRef  = useRef(frozen)
  frozenRef.current = frozen

  const draw = useCallback((bins: number[]) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawSpectrum(ctx, canvas.width, canvas.height, bins, barGap, frozenRef.current)
  }, [barGap])

  // Resize observer — keeps canvas resolution in sync with CSS size
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        canvas.width  = Math.round(width  * devicePixelRatio)
        canvas.height = Math.round(height * devicePixelRatio)
        draw(data ?? [])
      }
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [data, draw])

  // Redraw on data/frozen change
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => draw(data ?? []))
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [data, frozen, draw])

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
