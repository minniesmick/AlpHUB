import { useCallback } from 'react'
import { useMotionValue } from 'motion/react'
import type { MotionValue } from 'motion/react'

type Direction = 'left' | 'right' | 'top' | 'bottom'

const ORIGINS: Record<Direction, string> = {
  left:   '0% 50%',
  right:  '100% 50%',
  top:    '50% 0%',
  bottom: '50% 100%',
}

interface DirectionalFillReturn {
  fillOrigin:   MotionValue<string>
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => void
}

export function useDirectionalFill(): DirectionalFillReturn {
  const fillOrigin = useMotionValue('50% 50%')

  const onMouseEnter = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const rect  = e.currentTarget.getBoundingClientRect()
    const dx    = e.clientX - (rect.left + rect.width  / 2)
    const dy    = e.clientY - (rect.top  + rect.height / 2)
    const angle = Math.atan2(dy, dx) * (180 / Math.PI)  // -180 to 180

    let dir: Direction
    if      (angle >  -45 && angle <=  45)  dir = 'right'
    else if (angle >   45 && angle <= 135)  dir = 'bottom'
    else if (angle >  135 || angle <= -135) dir = 'left'
    else                                     dir = 'top'

    fillOrigin.set(ORIGINS[dir])
  }, [fillOrigin])

  return { fillOrigin, onMouseEnter }
}
