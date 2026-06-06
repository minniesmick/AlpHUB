import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useToasts, type ToastItem } from '../../context/Toast'
import styles from './ToastStack.module.css'

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const barRef = useRef<HTMLDivElement>(null)

  // Animate countdown bar shrink over duration via scaleX (GPU composited)
  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    bar.style.transition = 'none'
    bar.style.transform = 'scaleX(1)'
    // Force reflow then start shrink
    void bar.offsetWidth
    bar.style.transition = `transform ${toast.duration}ms linear`
    bar.style.transform = 'scaleX(0)'
  }, [toast.duration])

  return (
    <div className={`${styles.card} ${styles[toast.type]}${toast.exiting ? ` ${styles.exiting}` : ''}`} role="alert">
      <div className={styles.bar} ref={barRef} />
      <div className={styles.body}>
        <span className={styles.message}>{toast.message}</span>
        <button className={styles.close} onClick={onDismiss} aria-label="Dismiss">
          <X size={11} />
        </button>
      </div>
    </div>
  )
}

export function ToastStack() {
  const { toasts, dismiss } = useToasts()
  if (toasts.length === 0) return null

  return createPortal(
    <div className={styles.stack} aria-live="polite" aria-atomic="false">
      {toasts.map(t => (
        <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>,
    document.body,
  )
}
