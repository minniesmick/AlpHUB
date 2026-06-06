import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import styles from './HelpModal.module.css'

interface Props {
  open:    boolean
  onClose: () => void
}

interface ShortcutRow { keys: string[]; desc: string }
interface ShortcutGroup { group: string; rows: ShortcutRow[] }

const SHORTCUTS: ShortcutGroup[] = [
  {
    group: 'Navigation',
    rows: [
      { keys: ['Ctrl', '1'],  desc: 'Signal Flow' },
      { keys: ['Ctrl', '2'],  desc: 'Pipeline' },
      { keys: ['Ctrl', '3'],  desc: 'Splitter' },
      { keys: ['Ctrl', ','],  desc: 'Settings' },
    ],
  },
  {
    group: 'Global',
    rows: [
      { keys: ['?'],      desc: 'Open this help' },
      { keys: ['Escape'], desc: 'Close modal / panel' },
    ],
  },
  {
    group: 'Pipeline — Waveform',
    rows: [
      { keys: ['Space'],              desc: 'Play / Pause' },
      { keys: ['Enter'],              desc: 'Play / Pause' },
      { keys: ['←', '→'],             desc: 'Seek ±5 s' },
      { keys: ['Shift', '←', '→'],    desc: 'Seek ±15 s' },
    ],
  },
  {
    group: 'Pipeline — Run',
    rows: [
      { keys: ['Ctrl', 'Enter'], desc: 'Run pipeline' },
      { keys: ['Escape'],        desc: 'Cancel running job' },
    ],
  },
  {
    group: 'Splitter — Run',
    rows: [
      { keys: ['Ctrl', 'Enter'], desc: 'Split stems' },
      { keys: ['Escape'],        desc: 'Cancel running job' },
    ],
  },
  {
    group: 'Splitter — Stem seek bar',
    rows: [
      { keys: ['←', '→'],             desc: 'Seek ±5 s' },
      { keys: ['Shift', '←', '→'],    desc: 'Seek ±15 s' },
    ],
  },
]

export function HelpModal({ open, onClose }: Props): JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-modal-title"
      >
        <div className={styles.header}>
          <span id="help-modal-title" className={styles.title}>Keyboard Shortcuts</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close help">
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        <div className={styles.body}>
          {SHORTCUTS.map(section => (
            <div key={section.group} className={styles.section}>
              <div className={styles.groupLabel}>{section.group}</div>
              <table className={styles.table}>
                <tbody>
                  {section.rows.map((row, i) => (
                    <tr key={i} className={styles.row}>
                      <td className={styles.keys}>
                        {row.keys.map((k, ki) => (
                          <span key={ki}>
                            <kbd className={styles.kbd}>{k}</kbd>
                            {ki < row.keys.length - 1 && (
                              <span className={styles.plus}> + </span>
                            )}
                          </span>
                        ))}
                      </td>
                      <td className={styles.desc}>{row.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <div className={styles.footer}>
          Press <kbd className={styles.kbd}>?</kbd> to toggle
        </div>
      </div>
    </>,
    document.body,
  )
}
