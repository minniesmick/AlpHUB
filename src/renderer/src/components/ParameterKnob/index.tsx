import { useCallback, useEffect, useId, useRef, useState } from 'react'
import styles from './ParameterKnob.module.css'

interface Props {
  value: number
  min?: number
  max?: number
  step?: number
  label?: string
  unit?: string
  size?: number
  onChange?: (value: number) => void
}

const DEG_MIN  = -135
const DEG_MAX  = 135
const DRAG_PX_PER_UNIT = 180  // px of drag to go full range
const FINE_MOD = 0.1

function polarToXY(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const s = polarToXY(cx, cy, r, startDeg)
  const e = polarToXY(cx, cy, r, endDeg)
  const sweep = ((endDeg - startDeg) + 360) % 360
  const large = sweep > 180 ? 1 : 0
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`
}

export function ParameterKnob({ value, min = 0, max = 1, step, label, unit, size = 56, onChange }: Props) {
  const uid = useId()
  const gradId = `knob-grad-${uid.replace(/:/g, '')}`
  const [dragging, setDragging] = useState(false)
  const [showTip, setShowTip] = useState(false)
  const startY  = useRef(0)
  const startVal = useRef(0)

  const clamp = (v: number) => Math.max(min, Math.min(max, v))
  const norm  = (clamp(value) - min) / (max - min)          // 0–1
  const deg   = DEG_MIN + norm * (DEG_MAX - DEG_MIN)

  const cx  = size / 2
  const cy  = size / 2
  const r   = size * 0.36
  const sw  = size * 0.07                                    // stroke-width

  // Dot position at current value
  const dot = polarToXY(cx, cy, r, deg)

  const trackPath = arcPath(cx, cy, r, DEG_MIN, DEG_MAX)
  const valuePath = norm > 0.001 ? arcPath(cx, cy, r, DEG_MIN, deg) : ''

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setDragging(true)
    setShowTip(true)
    startY.current   = e.clientY
    startVal.current = value
  }, [value])

  const displayValue = (): string => {
    const v = typeof step === 'number' ? Math.round(value / step) * step : value
    const rounded = parseFloat(v.toFixed(3))
    return unit ? `${rounded}${unit}` : String(rounded)
  }

  useEffect(() => {
    if (!dragging) return

    const onMove = (e: MouseEvent) => {
      const fine    = e.shiftKey ? FINE_MOD : 1
      const delta   = (startY.current - e.clientY) / DRAG_PX_PER_UNIT * (max - min) * fine
      let next = startVal.current + delta
      if (step) next = Math.round(next / step) * step
      onChange?.(clamp(next))
    }

    const onUp = () => {
      setDragging(false)
      setTimeout(() => setShowTip(false), 600)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging, max, min, step, onChange]) // eslint-disable-line react-hooks/exhaustive-deps

  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta = (max - min) / 100
    const fine  = e.shiftKey ? delta * 0.1 : delta
    if (e.key === 'ArrowUp'   || e.key === 'ArrowRight') onChange?.(clamp(value + fine))
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft')  onChange?.(clamp(value - fine))
    if (e.key === 'Home') onChange?.(min)
    if (e.key === 'End')  onChange?.(max)
  }

  return (
    <div className={styles.root}>
      <div
        className={`${styles.svgWrap}${dragging ? ` ${styles.active}` : ''}`}
        onMouseDown={onMouseDown}
        onFocus={() => setShowTip(true)}
        onBlur={() => setShowTip(false)}
        onKeyDown={onKeyDown}
        role="slider"
        aria-label={label ?? 'Parameter'}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        tabIndex={0}
        style={{ width: size, height: size }}
      >
        {showTip && (
          <div className={styles.tooltip}>{displayValue()}</div>
        )}
        <svg width={size} height={size} overflow="visible">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="#C77DFF" />
              <stop offset="100%" stopColor="#F72585" />
            </linearGradient>
          </defs>
          {/* Track */}
          <path className={styles.track} d={trackPath} strokeWidth={sw} />
          {/* Value arc */}
          {valuePath && <path className={styles.value} d={valuePath} strokeWidth={sw} stroke={`url(#${gradId})`} />}
          {/* Indicator dot */}
          <circle className={styles.dot} cx={dot.x} cy={dot.y} r={sw * 0.9} />
        </svg>
      </div>
      {label && <span className={styles.label}>{label}</span>}
    </div>
  )
}
