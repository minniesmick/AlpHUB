import { useState } from 'react'
import { motion } from 'motion/react'
import { Loader2 } from 'lucide-react'
import { useDirectionalFill } from '@renderer/hooks/useDirectionalFill'
import styles from './RunButton.module.css'

interface Props {
  children:  React.ReactNode
  onClick?:  () => void
  disabled?: boolean
  loading?:  boolean
  className?: string
  type?: 'button' | 'submit' | 'reset'
}

const TAP_SPRING = { type: 'spring' as const, stiffness: 400, damping: 22 }
const FILL_SPRING = { type: 'spring' as const, stiffness: 320, damping: 26 }

export function RunButton({ children, onClick, disabled, loading, className, type = 'button' }: Props) {
  const [hovered, setHovered] = useState(false)
  const fill       = useDirectionalFill()
  const isDisabled = disabled || loading

  return (
    <motion.button
      type={type}
      className={[
        styles.btn,
        loading   && styles.loading,
        isDisabled && styles.disabled,
        className,
      ].filter(Boolean).join(' ')}
      disabled={isDisabled}
      onClick={onClick}
      onMouseEnter={e => { setHovered(true); fill.onMouseEnter(e) }}
      onMouseLeave={() => setHovered(false)}
      whileHover={!isDisabled ? { y: -1, scale: 1.02 } : undefined}
      whileTap={!isDisabled   ? { scale: 0.96, y: 1 }  : undefined}
      transition={TAP_SPRING}
    >
      {/* Directional fill highlight */}
      <motion.span
        className={styles.fillLayer}
        animate={hovered && !isDisabled
          ? { scaleX: 1, scaleY: 1, opacity: 1 }
          : { scaleX: 0, scaleY: 0, opacity: 0 }
        }
        transition={FILL_SPRING}
        style={{ transformOrigin: fill.fillOrigin }}
        aria-hidden="true"
      />

      {loading && <Loader2 className={styles.spinner} size={13} aria-hidden="true" />}
      <span className={styles.label}>{children}</span>
    </motion.button>
  )
}
