import { motion, useMotionValue, useSpring } from 'motion/react'
import { useEffect } from 'react'
import styles from './CursorGlow.module.css'

export function CursorGlow(): JSX.Element {
  const cursorX = useMotionValue(-300)
  const cursorY = useMotionValue(-300)
  const springX = useSpring(cursorX, { stiffness: 120, damping: 20 })
  const springY = useSpring(cursorY, { stiffness: 120, damping: 20 })

  useEffect(() => {
    const move = (e: MouseEvent) => {
      cursorX.set(e.clientX)
      cursorY.set(e.clientY)
    }
    window.addEventListener('mousemove', move)
    return () => window.removeEventListener('mousemove', move)
  }, [cursorX, cursorY])

  return (
    <motion.div
      className={styles.glow}
      style={{ x: springX, y: springY }}
      aria-hidden="true"
    />
  )
}
