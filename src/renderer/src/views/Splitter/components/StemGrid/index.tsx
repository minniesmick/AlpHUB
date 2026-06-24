/**
 * StemGrid — animated per-stem output card grid for Splitter results.
 *
 * - Detects stem type from filename (vocals, drums, bass, other, piano, guitar)
 * - Each card has a unique accent color, a 16-bar mini waveform, and a "Send to Pipeline" button
 * - Staggered entrance animation
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useTransform, useMotionTemplate } from 'motion/react'
import type { PanInfo } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { Play, Pause, AudioLines } from 'lucide-react'
import { toast } from 'sonner'
import { useFileTransfer } from '@renderer/context/FileTransfer'
import { endpoints } from '@renderer/lib/api'
import { CARD_SPRING } from '@renderer/lib/motion'
import { useTilt } from '@renderer/hooks/useTilt'
import { useSpotlight } from '@renderer/hooks/useSpotlight'
import { EmptyState } from '@renderer/components/EmptyState'
import { ShineBorder } from '@/components/ui/shine-border'
import { BorderBeam } from '@/components/ui/border-beam'
import styles from './StemGrid.module.css'

const STEM_DRAG_EVENT = 'stem-drag-over'

function dispatchStemDrag(route: string | null) {
  window.dispatchEvent(new CustomEvent(STEM_DRAG_EVENT, { detail: { route } }))
}

function findNavRouteAtPoint(x: number, y: number): string | null {
  const items = document.querySelectorAll<HTMLElement>('[data-nav-route]')
  for (const el of items) {
    const r = el.getBoundingClientRect()
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      return el.getAttribute('data-nav-route')
    }
  }
  return null
}

const cardVariants = {
  hidden:  { opacity: 0, y: 14, scale: 0.96 },
  visible: { opacity: 1, y: 0,  scale: 1    },
  exit:    { opacity: 0, y: 8,  scale: 0.97, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } },
}
const cardSpring = CARD_SPRING

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
  file:           StemFile
  fromTool:       string
  index:          number
  isSelected:     boolean
  anySelected:    boolean
  onToggleSelect: () => void
}

function StemCard({ file, fromTool, index, isSelected, anySelected, onToggleSelect }: StemCardProps): JSX.Element {
  const navigate       = useNavigate()
  const { setPending } = useFileTransfer()
  const audioRef       = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [audioError, setAudioError] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const tilt = useTilt({ maxAngle: 8 })
  const spot = useSpotlight()
  const filterStyle       = useTransform(tilt.brightness, b => `brightness(${b})`)
  const spotOpacityScaled = useTransform(spot.spotOpacity, o => o * 0.06)
  const spotBg            = useMotionTemplate`radial-gradient(280px circle at ${spot.spotX}px ${spot.spotY}px, rgba(199, 125, 255, ${spotOpacityScaled}), transparent 80%)`
  const handleMouseMove   = (e: React.MouseEvent<HTMLElement>): void => { if (isDragging) return; tilt.onMouseMove(e); spot.onMouseMove(e) }
  const handleMouseLeave  = (): void => { tilt.onMouseLeave(); spot.onMouseLeave() }

  const handleDrag = useCallback((_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const route = findNavRouteAtPoint(info.point.x, info.point.y)
    dispatchStemDrag(route)
  }, [])

  const handleDragEnd = useCallback((_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false)
    dispatchStemDrag(null)
    const route = findNavRouteAtPoint(info.point.x, info.point.y)
    if (route) {
      setPending({ path: file.path, filename: file.filename, fromTool })
      navigate(route)
    }
  }, [file, fromTool, navigate, setPending])

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
      className={`${styles.card}${playing ? ` ${styles.cardPlaying}` : ''}${isDragging ? ` ${styles.cardDragging}` : ''}${isSelected ? ` ${styles.cardSelected}` : ''}${anySelected ? ` ${styles.cardSelectable}` : ''}`}
      style={{
        ...({ '--stem-color': color, '--stem-dim': dim, '--stem-tint': tint } as React.CSSProperties),
        rotateX: tilt.rotateX,
        rotateY: tilt.rotateY,
        filter: filterStyle,
        backgroundImage: spotBg,
        transformPerspective: 800,
      }}
      variants={cardVariants}
      layout
      transition={{ ...cardSpring, delay: Math.min(index, 6) * 0.035 }}
      drag
      dragSnapToOrigin
      dragElastic={0.12}
      whileDrag={{ scale: 1.05, zIndex: 50, cursor: 'grabbing' }}
      onDragStart={() => setIsDragging(true)}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <ShineBorder borderWidth={1} duration={7} shineColor={['#C77DFF', '#F72585']} />
      <BorderBeam size={60} duration={9} colorFrom="#C77DFF" colorTo="#F72585" />
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

      {/* Select for merge */}
      <button
        className={`${styles.selectBtn}${isSelected ? ` ${styles.selectBtnActive}` : ''}`}
        onClick={e => { e.stopPropagation(); onToggleSelect() }}
        onPointerDown={e => e.stopPropagation()}
        aria-label={isSelected ? `Deselect ${label}` : `Select ${label} for merge`}
        aria-pressed={isSelected}
        title={isSelected ? 'Deselect' : 'Select for merge'}
      >
        {isSelected ? '✓' : '+'}
      </button>
    </motion.div>
  )
}

// ── StemGrid ──────────────────────────────────────────────────────────────────

export function StemGrid({ files, fromTool, onClear }: Props): JSX.Element {
  const [selected,  setSelected]  = useState<Set<string>>(new Set())
  const [mergeName, setMergeName] = useState('merged')
  const [merging,   setMerging]   = useState(false)

  const toggleSelect = useCallback((path: string) => {
    setSelected(prev => {
      const s = new Set(prev)
      if (s.has(path)) s.delete(path)
      else s.add(path)
      return s
    })
  }, [])

  const handleMerge = useCallback(async () => {
    const paths = files.filter(f => selected.has(f.path)).map(f => f.path)
    if (paths.length < 2) return
    setMerging(true)
    try {
      const outFolder = paths[0].replace(/[/\\][^/\\]+$/, '') || '.'
      const result = await endpoints.splitterMerge({
        input_paths:   paths,
        output_folder: outFolder,
        output_name:   mergeName.trim() || 'merged',
        format:        'wav',
      })
      toast.success(`Merged → ${result.filename}`)
      setSelected(new Set())
    } catch {
      toast.error('Merge failed')
    } finally {
      setMerging(false)
    }
  }, [files, selected, mergeName])

  if (files.length === 0) {
    return (
      <EmptyState
        icon={<AudioLines size={20} />}
        title="No stems yet"
        description="Separate a track to see stems here"
      />
    )
  }

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

      {selected.size >= 1 && (
        <div className={styles.mergeBar}>
          <span className={styles.mergeInfo}>
            {selected.size} stem{selected.size !== 1 ? 's' : ''} selected
          </span>
          <input
            className={styles.mergeName}
            type="text"
            value={mergeName}
            onChange={e => setMergeName(e.target.value)}
            placeholder="output name…"
            aria-label="Merged output file name"
            maxLength={60}
          />
          <button
            className={styles.mergeBtn}
            onClick={handleMerge}
            disabled={merging || selected.size < 2}
            aria-label="Merge selected stems"
          >
            {merging ? 'Merging…' : 'Merge'}
          </button>
          <button
            className={styles.mergeClearBtn}
            onClick={() => setSelected(new Set())}
            aria-label="Clear selection"
            title="Clear selection"
          >
            ✕
          </button>
        </div>
      )}

      <motion.div className={styles.grid} layout>
        <AnimatePresence initial={false}>
          {files.map((f, i) => (
            <StemCard
              key={f.path}
              file={f}
              fromTool={fromTool}
              index={i}
              isSelected={selected.has(f.path)}
              anySelected={selected.size > 0}
              onToggleSelect={() => toggleSelect(f.path)}
            />
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
