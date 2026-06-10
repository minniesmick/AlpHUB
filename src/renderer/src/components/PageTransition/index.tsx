import { motion } from 'motion/react'
import type { ReactNode } from 'react'

const variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -6 },
}

const transition = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1] as const,
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
      transition={transition}
      style={{ height: '100%', display: 'flex', flexDirection: 'column', ...style }}
    >
      {children}
    </motion.div>
  )
}
