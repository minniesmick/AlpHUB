import { motion } from 'motion/react'
import styles from './ProcessingMarquee.module.css'

interface Props {
  stages:    string[]
  className?: string
}

export function ProcessingMarquee({ stages, className }: Props) {
  // Duplicate for seamless loop
  const items = [...stages, ...stages]

  return (
    <div
      className={`${styles.root}${className ? ` ${className}` : ''}`}
      aria-live="polite"
      aria-atomic="false"
    >
      <div className={styles.fadeLeft}  aria-hidden="true" />
      <div className={styles.fadeRight} aria-hidden="true" />
      <motion.div
        className={styles.track}
        animate={{ x: ['0%', '-50%'] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
        aria-hidden="true"
      >
        {items.map((stage, i) => (
          <span key={i} className={styles.stage}>
            <span className={styles.dot} />
            {stage}
          </span>
        ))}
      </motion.div>
      {/* Screen-reader announces first stage only */}
      <span className={styles.srOnly}>{stages[0]}</span>
    </div>
  )
}
