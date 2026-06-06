/**
 * TypewriterCard — animated character-reveal card for STT / TTT text results.
 *
 * - Adaptive-speed reveal: always completes in ~3 seconds regardless of text length
 * - Blinking cursor (CSS animation) disappears when reveal is complete
 * - Copy button slides in on completion
 * - Mode badge (STT / TTT) top-left
 */

import { useState, useEffect, useCallback } from 'react'
import styles from './TypewriterCard.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const TOTAL_DURATION_MS = 3000   // Always finish in ~3 seconds
const STEP_MS           = 16     // ~60fps reveal ticks
const MIN_STEPS         = 60     // Minimum steps for short texts (smooth visual)

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  text: string
  mode?: string   // 'stt' | 'ttt' — shown as badge
}

export function TypewriterCard({ text, mode }: Props): JSX.Element {
  const [displayed, setDisplayed] = useState('')
  const [done,      setDone]      = useState(false)
  const [copied,    setCopied]    = useState(false)

  useEffect(() => {
    if (!text) {
      setDisplayed('')
      setDone(false)
      return
    }

    // Adaptive chunk size: always finish in TOTAL_DURATION_MS
    const totalSteps = Math.max(MIN_STEPS, Math.floor(TOTAL_DURATION_MS / STEP_MS))
    const chunkSize  = Math.max(1, Math.ceil(text.length / totalSteps))

    setDisplayed('')
    setDone(false)

    let current = 0
    const id = setInterval(() => {
      current = Math.min(text.length, current + chunkSize)
      setDisplayed(text.slice(0, current))
      if (current >= text.length) {
        clearInterval(id)
        setDone(true)
      }
    }, STEP_MS)

    return () => clearInterval(id)
  }, [text])

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])

  const badge     = mode?.toUpperCase()
  const wordCount = done ? text.split(/\s+/).filter(Boolean).length : null

  return (
    <div className={styles.card}>
      {/* Header */}
      <div className={styles.header}>
        {badge && <span className={styles.badge}>{badge}</span>}
        <span className={styles.label}>Output</span>
        {wordCount !== null && (
          <span className={styles.wordCount} aria-label={`${wordCount} words`}>
            {wordCount} words
          </span>
        )}
        {done && (
          <button
            className={`${styles.copyBtn} ${styles.copyBtnVisible}`}
            onClick={copy}
            aria-label="Copy to clipboard"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        )}
      </div>

      {/* Text content */}
      <div className={styles.content} aria-live="polite" aria-label="Transcription output">
        <span className={styles.text}>{displayed}</span>
        {!done && <span className={styles.cursor} aria-hidden="true" />}
      </div>
    </div>
  )
}
