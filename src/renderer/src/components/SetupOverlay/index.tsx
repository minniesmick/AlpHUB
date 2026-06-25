import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import { endpoints } from '@renderer/lib/api'
import { ws } from '@renderer/lib/ws'
import styles from './SetupOverlay.module.css'

const SETUP_DONE_KEY = 'alphub_setup_done_v2'

interface StageState {
  demucs:  'pending' | 'running' | 'done'
  whisper: 'pending' | 'running' | 'done'
  kokoro:  'pending' | 'running' | 'done'
}

interface Props {
  onDone: () => void
}

export function SetupOverlay({ onDone }: Props): JSX.Element | null {
  const [visible,  setVisible]  = useState(false)
  const [pct,      setPct]      = useState(0)
  const [msg,      setMsg]      = useState('Checking models…')
  const [stages,   setStages]   = useState<StageState>({ demucs: 'pending', whisper: 'pending', kokoro: 'pending' })
  const [error,    setError]    = useState<string | null>(null)
  const [skipped,  setSkipped]  = useState(false)

  useEffect(() => {
    if (localStorage.getItem(SETUP_DONE_KEY)) {
      onDone()
      return
    }

    endpoints.setupStatus()
      .then(s => {
        if (s.all_ready) {
          localStorage.setItem(SETUP_DONE_KEY, '1')
          onDone()
          return
        }
        // Some models missing — show overlay and start prefetch
        setVisible(true)
        setStages({
          demucs:  Object.values(s.demucs).every(Boolean) ? 'done' : 'pending',
          whisper: s.whisper  ? 'done' : 'pending',
          kokoro:  s.kokoro   ? 'done' : 'pending',
        })
        return endpoints.setupPrefetch()
      })
      .catch(() => {
        // Backend not ready yet or check failed — skip setup silently
        onDone()
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unsubs = [
      ws.on('setup_progress', d => {
        setPct(d.pct)
        setMsg(d.msg)
        const stage = d.stage as keyof StageState
        if (stage === 'done') return
        setStages(prev => ({
          ...prev,
          ...(stage in prev ? { [stage]: d.pct >= 25 && stage === 'demucs' ? 'done'
                                       : d.pct >= 65 && stage === 'whisper' ? 'done'
                                       : d.pct >= 90 && stage === 'kokoro'  ? 'done'
                                       : 'running' } : {}),
        }))
      }),
      ws.on('setup_complete', () => {
        setPct(100)
        setMsg('All models ready')
        setStages({ demucs: 'done', whisper: 'done', kokoro: 'done' })
        setTimeout(() => {
          localStorage.setItem(SETUP_DONE_KEY, '1')
          setVisible(false)
          onDone()
        }, 800)
      }),
      ws.on('setup_error', d => {
        setError(d.error)
      }),
    ]
    return () => unsubs.forEach(u => u())
  }, [onDone])

  const skip = () => {
    setSkipped(true)
    localStorage.setItem(SETUP_DONE_KEY, '1')
    setVisible(false)
    onDone()
  }

  if (!visible || skipped) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        className={styles.backdrop}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className={styles.panel}
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0,  scale: 1    }}
          exit={{    opacity: 0, y: 12, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
        >
          <div className={styles.logo}>AlpHUB</div>
          <h2 className={styles.title}>First-run setup</h2>
          <p className={styles.sub}>Downloading AI models. This only happens once.</p>

          {/* Stage list */}
          <div className={styles.stages}>
            {([
              { key: 'demucs',  label: 'Demucs  (stem splitter)',       approx: '~83 MB'  },
              { key: 'whisper', label: 'Whisper  (speech recognition)', approx: '~780 MB' },
              { key: 'kokoro',  label: 'Kokoro  (text-to-speech)',      approx: '~100 MB' },
            ] as const).map(({ key, label, approx }) => (
              <div key={key} className={`${styles.stage} ${styles[stages[key]]}`}>
                <span className={styles.stageIcon}>
                  {stages[key] === 'done'    ? '✓' :
                   stages[key] === 'running' ? '…' : '○'}
                </span>
                <span className={styles.stageLabel}>{label}</span>
                <span className={styles.stageSize}>{approx}</span>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div className={styles.barTrack}>
            <motion.div
              className={styles.barFill}
              animate={{ width: `${pct}%` }}
              transition={{ ease: 'easeOut', duration: 0.4 }}
            />
          </div>
          <div className={styles.msgRow}>
            <span className={styles.msgText}>{error ?? msg}</span>
            <span className={styles.pctText}>{pct}%</span>
          </div>

          {error && (
            <p className={styles.errorHint}>
              Check your internet connection and restart, or skip to download on first use.
            </p>
          )}

          <button className={styles.skipBtn} onClick={skip} type="button">
            Skip — download on first use
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
