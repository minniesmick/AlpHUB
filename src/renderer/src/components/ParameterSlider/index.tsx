import { useRef, useCallback } from 'react'
import styles from './ParameterSlider.module.css'

interface Props {
  value: number
  min?: number
  max?: number
  step?: number
  label?: string
  unit?: string
  onChange?: (value: number) => void
  className?: string
}

export function ParameterSlider({ value, min = 0, max = 1, step, label, unit, onChange, className }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)

  const clamp = (v: number) => Math.max(min, Math.min(max, v))
  const norm  = (clamp(value) - min) / (max - min)

  const fromPointer = useCallback((e: React.PointerEvent | PointerEvent) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    let next    = min + ratio * (max - min)
    if (step) next = Math.round(next / step) * step
    onChange?.(clamp(next))
  }, [min, max, step, onChange]) // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    fromPointer(e)
  }

  const displayValue = (): string => {
    const v = typeof step === 'number' ? Math.round(value / step) * step : value
    return unit ? `${parseFloat(v.toFixed(3))}${unit}` : String(parseFloat(v.toFixed(3)))
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta = step ?? (max - min) / 100
    const fine  = e.shiftKey ? delta * 0.1 : delta
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp')   onChange?.(clamp(value + fine))
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowDown') onChange?.(clamp(value - fine))
    if (e.key === 'Home') onChange?.(min)
    if (e.key === 'End')  onChange?.(max)
  }

  return (
    <div className={`${styles.root}${className ? ` ${className}` : ''}`}>
      {(label || unit) && (
        <div className={styles.header}>
          {label && <span className={styles.label}>{label}</span>}
          <span className={styles.valueDisplay}>{displayValue()}</span>
        </div>
      )}
      <div
        ref={trackRef}
        className={styles.track}
        onPointerDown={onPointerDown}
        onPointerMove={e => { if (e.buttons === 1) fromPointer(e) }}
        role="slider"
        tabIndex={0}
        aria-label={label ?? 'Parameter'}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onKeyDown={onKeyDown}
      >
        <div className={styles.rail}>
          <div className={styles.fill} style={{ transform: `scaleX(${norm})` }} />
        </div>
        <div className={styles.thumb} style={{ left: `${norm * 100}%` }} />
      </div>
    </div>
  )
}
