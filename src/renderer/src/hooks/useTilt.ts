import { useCallback } from 'react'
import { useMotionValue, useSpring } from 'motion/react'
import type { MotionValue } from 'motion/react'

interface TiltConfig {
  maxAngle?: number
}

interface TiltReturn {
  rotateX:    MotionValue<number>
  rotateY:    MotionValue<number>
  brightness: MotionValue<number>
  onMouseMove:  (e: React.MouseEvent<HTMLElement>) => void
  onMouseLeave: () => void
}

const SPRING = { stiffness: 200, damping: 28 }

export function useTilt({ maxAngle = 8 }: TiltConfig = {}): TiltReturn {
  const rawRX = useMotionValue(0)
  const rawRY = useMotionValue(0)
  const rawBr = useMotionValue(1)

  const rotateX    = useSpring(rawRX, SPRING)
  const rotateY    = useSpring(rawRY, SPRING)
  const brightness = useSpring(rawBr, SPRING)

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const dx   = ((e.clientX - rect.left) / rect.width  - 0.5) * 2
    const dy   = ((e.clientY - rect.top)  / rect.height - 0.5) * 2
    rawRX.set(-dy * maxAngle)
    rawRY.set(dx  * maxAngle)
    rawBr.set(1.03)
  }, [maxAngle, rawRX, rawRY, rawBr])

  const onMouseLeave = useCallback(() => {
    rawRX.set(0)
    rawRY.set(0)
    rawBr.set(1)
  }, [rawRX, rawRY, rawBr])

  return { rotateX, rotateY, brightness, onMouseMove, onMouseLeave }
}
