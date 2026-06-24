import { motion } from 'motion/react'
import type { ReactNode } from 'react'

// ── Cinematic zoom + rack-focus blur ────────────────────────────────────────
//
// Enter: new page zooms INTO focus from slightly enlarged + blurred state
//        (like a camera rack focusing from background to foreground)
//
// Exit:  current page shrinks + blurs away as it "recedes" behind the camera
//
// Spring governs scale so it overshoots exactly 0.8px before settling —
// enough to feel physical, not enough to look wobbly.

const variants = {
  initial: {
    opacity: 0,
    scale: 1.045,
    filter: 'blur(9px)',
  },
  animate: {
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      opacity: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
      scale:   { type: 'spring', stiffness: 210, damping: 22, mass: 0.85 },
      filter:  { duration: 0.3,  ease: [0.22, 1, 0.36, 1] },
    },
  },
  exit: {
    opacity: 0,
    scale: 0.965,
    filter: 'blur(7px)',
    transition: {
      duration: 0.2,
      ease: [0.55, 0, 1, 0.45],
    },
  },
}

interface Props {
  children: ReactNode
  style?:   React.CSSProperties
}

export function PageTransition({ children, style }: Props): JSX.Element {
  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      style={{ height: '100%', display: 'flex', flexDirection: 'column', ...style }}
    >
      {children}
    </motion.div>
  )
}
