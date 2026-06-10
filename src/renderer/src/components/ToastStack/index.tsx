import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react'
import { X } from 'lucide-react'
import { useToasts, type ToastItem } from '../../context/Toast'
import styles from './ToastStack.module.css'

const DRAG_DISMISS = 80    // px rightward drag to auto-dismiss
const DRAG_VEL     = 400   // px/s velocity to also auto-dismiss

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const barRef = useRef<HTMLDivElement>(null)
  const dragX  = useMotionValue(0)
  const opacity = useTransform(dragX, [0, DRAG_DISMISS], [1, 0.28])

  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    bar.style.transition = 'none'
    bar.style.transform  = 'scaleX(1)'
    void bar.offsetWidth
    bar.style.transition = `transform ${toast.duration}ms linear`
    bar.style.transform  = 'scaleX(0)'
  }, [toast.duration])

  return (
    <motion.div
      className={`${styles.card} ${styles[toast.type]}`}
      role="alert"
      layout
      initial={{ opacity: 0, x: 80, scale: 0.93 }}
      animate={{ opacity: 1, x: 0,  scale: 1    }}
      exit={{    opacity: 0, x: 80, scale: 0.94, transition: { duration: 0.16, ease: 'easeIn' } }}
      transition={{ type: 'spring', stiffness: 360, damping: 26 }}
      drag="x"
      dragConstraints={{ left: 0, right: 320 }}
      dragElastic={{ left: 0, right: 0.35 }}
      style={{ x: dragX, opacity }}
      onDragEnd={(_, info) => {
        if (info.offset.x > DRAG_DISMISS || info.velocity.x > DRAG_VEL) onDismiss()
      }}
      whileTap={{ cursor: 'grabbing' }}
    >
      <div className={styles.bar} ref={barRef} />
      <div className={styles.body}>
        <span className={styles.message}>{toast.message}</span>
        <button className={styles.close} onClick={onDismiss} aria-label="Dismiss">
          <X size={11} />
        </button>
      </div>
    </motion.div>
  )
}

export function ToastStack() {
  const { toasts, dismiss } = useToasts()

  return createPortal(
    <div className={styles.stack} aria-live="polite" aria-atomic="false">
      <AnimatePresence mode="popLayout" initial={false}>
        {toasts.map(t => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  )
}
