import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import type { Model } from '@renderer/lib/api'
import styles from './ModelSelector.module.css'

interface Props {
  models: Model[]
  value?: string          // model id
  tool?: Model['tool']    // filter to one tool
  placeholder?: string
  onChange?: (model: Model) => void
}

function classNames(...cls: (string | false | undefined)[]) {
  return cls.filter(Boolean).join(' ')
}

export function ModelSelector({ models, value, tool, placeholder = 'Select model…', onChange }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const filtered  = tool ? models.filter(m => m.tool === tool) : models
  const selected  = filtered.find(m => m.id === value)

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return
    const onMouse = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false) }
    const onKey   = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown',   onKey)
    return () => { document.removeEventListener('mousedown', onMouse); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={rootRef} className={styles.root}>
      <button
        className={classNames(styles.trigger, open && styles.open)}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={classNames(styles.triggerText, selected && styles.hasValue)}>
          {selected?.name ?? placeholder}
        </span>
        <ChevronDown className={classNames(styles.chevron, open && styles.open)} size={14} />
      </button>

      {open && (
        <div className={styles.dropdown} role="listbox">
          {filtered.length === 0 ? (
            <div className={styles.empty}>No models found</div>
          ) : (
            filtered.map(m => (
              <button
                key={m.id}
                className={classNames(styles.option, m.id === value && styles.selected)}
                role="option"
                aria-selected={m.id === value}
                onClick={() => { onChange?.(m); setOpen(false) }}
              >
                <Check className={styles.check} size={12} />
                <span className={styles.optionName}>{m.name}</span>
                <span className={styles.optionTool}>{m.tool}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
