/**
 * StemGrid — animated per-stem output card grid for Splitter results.
 *
 * - Detects stem type from filename (vocals, drums, bass, other, piano, guitar)
 * - Each card has a unique accent color, a 16-bar mini waveform, and a "Send to Pipeline" button
 * - Staggered entrance animation
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { Play, Pause } from 'lucide-react'
import { useFileTransfer } from '@renderer/context/FileTransfer'
import styles from './StemGrid.module.css'

const cardVariants = {
  hidden:  { opacity: 0, y: 14, scale: 0.96 },
  visible: { opacity: 1, y: 0,  scale: 1    },
  exit:    { opacity: 0, y: 8,  scale: 0.97 },
}
const cardSpring = { type: 'spring' as const, stiffness: 320, damping: 24 }

// ── Types ─────────────────────────────────────────────────────────────────────

interface StemFile {
  path:      string
  filename:  string
  createdAt?: number
}

interface Props {
  files:    StemFile[]
  fromTool: string
  onClear?: () => void
}

// ── Stem color map ────────────────────────────────────────────────────────────

const STEM_COLORS: Record<string, string> = {
  vocals:    'var(--primary)',     // purple
  drums:     'var(--secondary)',   // hot pink
  bass:      'var(--success)',     // green
  other:     'var(--warning)',     // amber
  no_vocals: 'var(--secondary)',   // hot pink (htdemucs alias)
  piano:     'var(--info)',        // blue
  guitar:    'var(--source)',      // mint
}

const STEM_DIM: Record<string, string> = {
  vocals:    'var(--primary-dim)',
  drums:     'var(--secondary-dim)',
  bass:      'rgba(57, 217, 138, 0.55)',
  other:     'rgba(245, 166, 35, 0.55)',
  no_vocals: 'var(--secondary-dim)',
  piano:     'rgba(96, 180, 255, 0.55)',
  guitar:    'rgba(80, 230, 160, 0.55)',
}

const STEM_TINT: Record<string, string> = {
  vocals:    'var(--primary-tint)',
  drums:     'var(--secondary-tint)',
  bass:      'rgba(57, 217, 138, 0.08)',
  other:     'rgba(245, 166, 35, 0.08)',
  no_vocals: 'var(--secondary-tint)',
  piano:     'rgba(96, 180, 255, 0.08)',
  guitar:    'rgba(80, 230, 160, 0.08)',
}

// ── Mutual-exclusion: only one stem plays at a time ─────────────────────────

let activeStemEl: HTMLAudioElement | null = null

// ── Seeded PRNG (LCG) — identical to WaveformCard ────────────────────────────

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function makeRand(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MINI_BARS = 16
const MINI_W    = 64
const MINI_H    = 28

function detectStem(filename: string): string {
  const lower = filename.toLowerCase()
  for (const key of Object.keys(STEM_COLORS)) {
    if (lower.includes(key)) return key
  }
  return 'other'
}

function miniBarHeights(seed: number): number[] {
  const rand = makeRand(seed)
  return Array.from({ length: MINI_BARS }, () => {
    const base = rand()
    const bump = rand() > 0.7 ? rand() * 0.35 : 0
    return Math.min(1, Math.max(0.1, base * 0.7 + bump + 0.1))
  })
}

// ── Relative time helper ──────────────────────────────────────────────────────

function relTime(ts: number): string {
  const d = Date.now() - ts
  if (d < 60_000)       return 'just now'
  if (d < 3_600_000)    return `${Math.floor(d / 60_000)}m ago`
  if (d < 86_400_000)   return `${Math.floor(d / 3_600_000)}h ago`
  return `${Math.floor(d / 86_400_000)}d ago`
}

// ── StemCard (single) ─────────────────────────────────────────────────────────

interface StemCardProps {
  file:     StemFile
  fromTool: string
  index:    number
}

function StemCard({ file, fromTool, index }: StemCardProps): JSX.Element {
  const navigate       = useNavigate()
  const { setPending } = useFileTransfer()
  const audioRef       = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [audioError, setAudioError] = useState(false)

  // Stop audio when card unmounts (e.g. navigating away)
  useEffect(() => {
    return () => {
      const el = audioRef.current
      if (el) { el.pause(); if (activeStemEl === el) activeStemEl = null }
    }
  }, [])

  const stem   = detectStem(file.filename)
  const color  = STEM_COLORS[stem]  ?? STEM_COLORS.other
  const dim    = STEM_DIM[stem]     ?? STEM_DIM.other
  const tint   = STEM_TINT[stem]    ?? STEM_TINT.other
  const label  = stem.charAt(0).toUpperCase() + stem.slice(1).replace('_', ' ')
  const bars   = miniBarHeights(hashStr(file.filename))

  // Convert OS path → file:// URL for <audio>
  const audioSrc = `file:///${file.path.replace(/\\/g, '/')}`

  const togglePlay = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    if (!el.paused) {
      el.pause()
      // setPlaying handled by onPause listener below
    } else {
      // Stop any other currently-playing stem
      if (activeStemEl && activeStemEl !== el) activeStemEl.pause()
      void el.play()
      activeStemEl = el
      setPlaying(true)
    }
  }, []) // reads el.paused directly — no state dep needed

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current
    if (!el || !el.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    el.currentTime = frac * el.duration
    setProgress(frac)
  }, [])

  const handleSeekKey = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = audioRef.current
    if (!el || !el.duration) return
    const step = e.shiftKey ? 15 : 5
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      el.currentTime = Math.min(el.duration, el.currentTime + step)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      el.currentTime = Math.max(0, el.currentTime - step)
    }
  }, [])

  const handleSendTo = useCallback((route: string) => {
    setPending({ path: file.path, filename: file.filename, fromTool })
    navigate(route)
  }, [file, fromTool, navigate, setPending])

  return (
    <motion.div
      className={`${styles.card}${playing ? ` ${styles.cardPlaying}` : ''}`}
      style={{ '--stem-color': color, '--stem-dim': dim, '--stem-tint': tint } as React.CSSProperties}
      variants={cardVariants}
      transition={{ ...cardSpring, delay: Math.min(index, 10) * 0.055 }}
    >
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={audioSrc}
        preload="none"
        onTimeUpdate={() => {
          const el = audioRef.current
          if (el && el.duration) setProgress(el.currentTime / el.duration)
        }}
        onPause={() => { setPlaying(false) }}
        onEnded={() => { setPlaying(false); setProgress(0); activeStemEl = null }}
        onError={() => { setAudioError(true); setPlaying(false) }}
      />

      {/* Mini waveform + play overlay */}
      <div className={styles.waveWrap} onClick={!audioError ? togglePlay : undefined}
           role="button" tabIndex={0}
           onKeyDown={e => !audioError && (e.key === 'Enter' || e.key === ' ') && togglePlay()}
           aria-label={audioError ? `${label} — file not found` : playing ? `Pause ${label}` : `Play ${label}`}
           aria-pressed={playing}
           aria-disabled={audioError}>
        <svg
          className={styles.miniWave}
          viewBox={`0 0 ${MINI_W} ${MINI_H}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={`mg-${stem}-${index}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor={color} />
              <stop offset="100%" stopColor={color} stopOpacity={0.6} />
            </linearGradient>
          </defs>
          {bars.map((h, i) => {
            const barH = Math.max(2, Math.round(h * MINI_H))
            const x    = i * (MINI_W / MINI_BARS) + 0.5
            const barW = MINI_W / MINI_BARS - 1
            const y    = MINI_H - barH
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={1}
                fill={`url(#mg-${stem}-${index})`}
                className={`${styles.miniBar}${playing ? ` ${styles.miniBarPlaying}` : ''}`}
                style={{ animationDelay: `${index * 65 + i * 12}ms` }}
              />
            )
          })}
        </svg>

        {/* Play/pause icon overlay */}
        <div className={`${styles.playOverlay}${audioError ? ` ${styles.playOverlayError}` : ''}`} aria-hidden="true">
          {audioError
            ? '?'
            : playing
              ? <Pause size={12} strokeWidth={2} />
              : <Play  size={12} strokeWidth={2} />}
        </div>
      </div>

      {/* Playback progress / seek bar */}
      <div
        className={styles.progressTrack}
        role="slider"
        tabIndex={0}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-orientation="horizontal"
        aria-label={`${label} playback position`}
        aria-hidden={audioError}
        onClick={handleSeek}
        onKeyDown={handleSeekKey}
      >
        <div
          className={styles.progressFill}
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>

      {/* Stem label */}
      <div className={styles.stemLabel}>{label}</div>

      {/* Filename */}
      <div className={styles.filename} title={file.filename}>
        {file.filename}
      </div>

      {/* Timestamp */}
      {file.createdAt && (
        <div className={styles.fileTime}>{relTime(file.createdAt)}</div>
      )}

      {/* Actions row */}
      <div className={styles.actions}>
        <button
          className={styles.folderBtn}
          onClick={() => window.api.showItemInFolder(file.path)}
          aria-label={`Show ${file.filename} in Explorer`}
          title="Show in Explorer"
        >
          ↗
        </button>
        <button className={styles.sendBtn} onClick={() => handleSendTo('/pipeline')} aria-label={`Send ${label} to Pipeline`}>
          → Pipeline
        </button>
        <button className={styles.sendBtn} onClick={() => handleSendTo('/daw')} aria-label={`Send ${label} to Signal Flow`}>
          → DAW
        </button>
      </div>
    </motion.div>
  )
}

// ── StemGrid ──────────────────────────────────────────────────────────────────

export function StemGrid({ files, fromTool, onClear }: Props): JSX.Element | null {
  if (files.length === 0) return null

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.title}>Stems</span>
        <span className={styles.count}>{files.length} file{files.length !== 1 ? 's' : ''}</span>
        {onClear && (
          <button className={styles.clearBtn} onClick={onClear} aria-label="Clear stem history">
            Clear
          </button>
        )}
      </div>
      <div className={styles.grid}>
        <AnimatePresence initial={false}>
          {files.map((f, i) => (
            <StemCard key={f.path} file={f} fromTool={fromTool} index={i} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
