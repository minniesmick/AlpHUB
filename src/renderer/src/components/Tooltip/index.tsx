import { useState, useRef } from 'react'
import styles from './Tooltip.module.css'

interface Props {
  content: string
  placement?: 'above' | 'below'
  delay?: number
  children: React.ReactElement
}

export function Tooltip({ content, placement = 'above', delay = 150, children }: Props) {
  const [visible, setVisible] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = () => { timer.current = setTimeout(() => setVisible(true), delay) }
  const hide = () => { if (timer.current) clearTimeout(timer.current); setVisible(false) }

  return (
    <span
      className={styles.root}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <span className={`${styles.tip}${placement === 'below' ? ` ${styles.below}` : ''}`} role="tooltip">
          {content}
        </span>
      )}
    </span>
  )
}
