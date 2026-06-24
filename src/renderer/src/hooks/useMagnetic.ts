import { useCallback, useRef } from 'react'
import { useMotionValue, useSpring } from 'motion/react'
import type { MotionValue } from 'motion/react'

interface MagneticConfig {
  threshold?: number   // px radius within which the pull activates
  strength?:  number   // 0–1, fraction of offset to apply
}

interface MagneticReturn {
  x: MotionValue<number>
  y: MotionValue<number>
  onMouseMove:  (e: React.MouseEvent<HTMLElement>) => void
  onMouseLeave: () => void
}

const SPRING = { stiffness: 180, damping: 14 }

export function useMagnetic({ threshold = 80, strength = 0.35 }: MagneticConfig = {}): MagneticReturn {
  const rawX = useMotionValue(0)
  const rawY = useMotionValue(0)
  const x    = useSpring(rawX, SPRING)
  const y    = useSpring(rawY, SPRING)
  const rectRef = useRef<DOMRect | null>(null)

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    rectRef.current = rect
    const cx   = rect.left + rect.width  / 2
    const cy   = rect.top  + rect.height / 2
    const dx   = e.clientX - cx
    const dy   = e.clientY - cy
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < threshold) {
      rawX.set(dx * strength)
      rawY.set(dy * strength)
    }
  }, [threshold, strength, rawX, rawY])

  const onMouseLeave = useCallback(() => {
    rawX.set(0)
    rawY.set(0)
  }, [rawX, rawY])

  return { x, y, onMouseMove, onMouseLeave }
}
