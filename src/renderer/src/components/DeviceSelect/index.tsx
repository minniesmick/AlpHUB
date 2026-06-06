import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import styles from './DeviceSelect.module.css'

export interface DeviceOption { index: number; name: string }

interface Props {
  options:    DeviceOption[]
  value:      number
  onChange:   (idx: number) => void
  ariaLabel?: string
}

export function DeviceSelect({ options, value, onChange, ariaLabel }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef         = useRef<HTMLDivElement>(null)
  const selected        = options.find(o => o.index === value)

  useEffect(() => {
    if (!open) return
    const onMouse = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false) }
    const onKey   = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown',   onKey)
    return () => {
      document.removeEventListener('mousedown', onMouse)
      document.removeEventListener('keydown',   onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className={styles.deviceRoot}>
      <button
        className={`${styles.deviceTrigger}${open ? ` ${styles.open}` : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
      >
        <span className={`${styles.deviceTriggerText}${selected ? ` ${styles.hasValue}` : ''}`}>
          {selected ? selected.name : '— none —'}
        </span>
        <ChevronDown className={`${styles.deviceChevron}${open ? ` ${styles.open}` : ''}`} size={10} />
      </button>

      {open && (
        <div className={styles.deviceDropdown} role="listbox">
          <button
            className={`${styles.deviceOption}${value === -1 ? ` ${styles.selected}` : ''}`}
            role="option"
            aria-selected={value === -1}
            onClick={() => { onChange(-1); setOpen(false) }}
          >
            <Check className={styles.deviceCheck} size={10} />
            <span className={`${styles.deviceOptionName} ${styles.deviceNone}`}>— none —</span>
          </button>
          {options.map(o => (
            <button
              key={o.index}
              className={`${styles.deviceOption}${o.index === value ? ` ${styles.selected}` : ''}`}
              role="option"
              aria-selected={o.index === value}
              onClick={() => { onChange(o.index); setOpen(false) }}
            >
              <Check className={styles.deviceCheck} size={10} />
              <span className={styles.deviceOptionName}>{o.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
