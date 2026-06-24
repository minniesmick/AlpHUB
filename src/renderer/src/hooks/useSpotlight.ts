import { useCallback } from 'react'
import { useMotionValue } from 'motion/react'
import type { MotionValue } from 'motion/react'

interface SpotlightReturn {
  spotX:    MotionValue<number>
  spotY:    MotionValue<number>
  spotOpacity: MotionValue<number>
  onMouseMove:  (e: React.MouseEvent<HTMLElement>) => void
  onMouseLeave: () => void
}

export function useSpotlight(): SpotlightReturn {
  const spotX       = useMotionValue(0)
  const spotY       = useMotionValue(0)
  const spotOpacity = useMotionValue(0)

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    spotX.set(e.clientX - rect.left)
    spotY.set(e.clientY - rect.top)
    spotOpacity.set(1)
  }, [spotX, spotY, spotOpacity])

  const onMouseLeave = useCallback(() => {
    spotOpacity.set(0)
  }, [spotOpacity])

  return { spotX, spotY, spotOpacity, onMouseMove, onMouseLeave }
}
