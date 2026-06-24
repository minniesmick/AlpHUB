import { useLocation } from 'react-router-dom'
import { motion } from 'motion/react'
import styles from './CinematicOverlay.module.css'

const BAR_DUR   = 0.32
const BAR_TIMES = [0, 0.15, 0.68, 1] as const

function CinematicScene() {
  return (
    <>
      {/* Vignette pulse */}
      <motion.div
        className={styles.vignette}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.55, 0] }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      />

      {/* Letterbox — top */}
      <motion.div
        className={styles.barTop}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: [0, 1, 1, 0] }}
        transition={{ duration: BAR_DUR, times: BAR_TIMES, ease: [[0.16, 1, 0.3, 1], 'linear', [0.4, 0, 1, 1]] }}
      />

      {/* Letterbox — bottom */}
      <motion.div
        className={styles.barBottom}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: [0, 1, 1, 0] }}
        transition={{ duration: BAR_DUR, times: BAR_TIMES, ease: [[0.16, 1, 0.3, 1], 'linear', [0.4, 0, 1, 1]] }}
      />

      {/* Scan sweep — starts after 160ms (exit phase), races through */}
      <motion.div
        className={styles.scanLine}
        initial={{ x: '-100%', opacity: 0 }}
        animate={{ x: '320%', y: [0, -4, 0], opacity: [0, 1, 1, 0] }}
        transition={{
          duration: 0.34,
          delay: 0.08,
          x: { ease: [0.16, 1, 0.3, 1] },
          y: { ease: [0.16, 1, 0.3, 1] },
          opacity: { times: [0, 0.08, 0.70, 1], ease: 'linear' },
        }}
      />
    </>
  )
}

export function CinematicOverlay(): JSX.Element {
  const { pathname } = useLocation()

  return (
    <div className={styles.root} aria-hidden="true">
      <CinematicScene key={pathname} />
    </div>
  )
}
