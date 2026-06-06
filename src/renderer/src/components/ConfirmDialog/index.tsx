import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import styles from './ConfirmDialog.module.css'

interface Props {
  open: boolean
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel }: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  // Focus confirm button on open; close on ESC
  useEffect(() => {
    if (!open) return
    confirmRef.current?.focus()
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onCancel])

  if (!open) return null

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
      role="presentation"
    >
      <div
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={body ? 'confirm-body' : undefined}
      >
        <div id="confirm-title" className={styles.title}>{title}</div>
        {body && <p id="confirm-body" className={styles.body}>{body}</p>}
        <div className={styles.actions}>
          <button className={`${styles.btn} ${styles.btnCancel}`} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button ref={confirmRef} className={`${styles.btn} ${styles.btnConfirm}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
