import { motion } from 'motion/react'
import { CARD_SPRING } from '@renderer/lib/motion'
import styles from './EmptyState.module.css'

interface Props {
  icon:         React.ReactNode
  title:        string
  description?: string
  action?:      React.ReactNode
  className?:   string
}

export function EmptyState({ icon, title, description, action, className }: Props) {
  return (
    <motion.div
      className={`${styles.root}${className ? ` ${className}` : ''}`}
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0,  scale: 1    }}
      transition={{ ...CARD_SPRING, delay: 0.05 }}
      role="status"
    >
      <motion.div
        className={styles.iconWrap}
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1,   opacity: 1 }}
        transition={{ ...CARD_SPRING, delay: 0.12 }}
      >
        {icon}
      </motion.div>

      <motion.span
        className={styles.title}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...CARD_SPRING, delay: 0.18 }}
      >
        {title}
      </motion.span>

      {description && (
        <motion.span
          className={styles.description}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, delay: 0.24 }}
        >
          {description}
        </motion.span>
      )}

      {action && (
        <motion.div
          className={styles.action}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...CARD_SPRING, delay: 0.28 }}
        >
          {action}
        </motion.div>
      )}
    </motion.div>
  )
}
