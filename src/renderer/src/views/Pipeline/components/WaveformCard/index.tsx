/**
 * WaveformCard — animated SVG waveform output card for audio job results.
 *
 * - 48-bar decorative waveform seeded from filename (deterministic, visually unique per file)
 * - Bars stagger in with scaleY entrance animation
 * - Played bars filled with gradient-accent; unplayed bars muted
 * - Playhead indicator line tracks current time
 * - Full HTML5 audio playback (play/pause, click-to-seek, volume)
 * - Mutual exclusion: playing one card pauses all others
 */

import { useRef, useState, useEffect, useId, useMemo, useCallback } from 'react'
import { motion, useTransform, useMotionTemplate } from 'motion/react'
import { Play, Pause, Volume2, VolumeX } from 'lucide-react'
import { ParameterSlider } from '@renderer/components/ParameterSlider'
import { useSpotlight } from '@renderer/hooks/useSpotlight'
import { ShineBorder } from '@/components/ui/shine-border'
import { BorderBeam } from '@/components/ui/border-beam'
import styles from './WaveformCard.module.css'

// ── Mutual exclusion ─────────────────────────────────────────────────────────

let activeWaveformEl: HTMLAudioElement | null = null

// ── Constants ────────────────────────────────────────────────────────────────

const NUM_BARS  = 48
const SVG_W     = 192   // viewBox width  (48 bars × 4px — 1px gap = 191.  Round to 192)
const SVG_H     = 56    // viewBox height

// ── Seeded PRNG (LCG) ────────────────────────────────────────────────────────

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

function fmtTime(sec: number): string {
  if (!isFinite(sec) || isNaN(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  src:       string
  filename?: string
  mode?:     string   // 'tts' | 'sts' — shown as badge
}

export function WaveformCard({ src, filename, mode }: Props): JSX.Element {
  const uid        = useId()
  const gradPlayed = `wf-p-${uid.replace(/:/g, '')}`
  const gradDim    = `wf-d-${uid.replace(/:/g, '')}`
  const audioRef  = useRef<HTMLAudioElement>(null)
  const svgRef    = useRef<SVGSVGElement>(null)
  const [playing,  setPlaying]  = useState(false)
  const [current,  setCurrent]  = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume,   setVolume]   = useState(1)

  // Wire up audio element events
  useEffect(() => {
    setPlaying(false)
    setCurrent(0)
    setDuration(0)
    const el = audioRef.current
    if (!el) return
    const onTime  = () => setCurrent(el.currentTime)
    const onMeta  = () => setDuration(el.duration)
    const onPlay  = () => {
      if (activeWaveformEl && activeWaveformEl !== el) activeWaveformEl.pause()
      activeWaveformEl = el
      setPlaying(true)
    }
    const onPause = () => {
      if (activeWaveformEl === el) activeWaveformEl = null
      setPlaying(false)
    }
    const onEnded = () => {
      if (activeWaveformEl === el) activeWaveformEl = null
      setPlaying(false)
    }
    el.addEventListener('timeupdate',     onTime)
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('play',           onPlay)
    el.addEventListener('pause',          onPause)
    el.addEventListener('ended',          onEnded)
    return () => {
      el.removeEventListener('timeupdate',     onTime)
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('play',           onPlay)
      el.removeEventListener('pause',          onPause)
      el.removeEventListener('ended',          onEnded)
      if (activeWaveformEl === el) activeWaveformEl = null
    }
  }, [src])

  // Sync volume to audio element
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  // Generate seeded bar heights (stable across renders as long as filename is stable)
  const barHeights = useMemo(() => {
    const rand = makeRand(hashStr(filename ?? 'alphub-default'))
    return Array.from({ length: NUM_BARS }, () => {
      // Bias toward mid-range heights; avoid flat lines
      const base = rand()
      const bump = rand() > 0.75 ? rand() * 0.4 : 0
      return Math.min(1, Math.max(0.08, base * 0.75 + bump + 0.08))
    })
  }, [filename])

  const pct        = duration > 0 ? current / duration : 0
  const playedBars = Math.round(pct * NUM_BARS)
  const playheadX  = pct * SVG_W

  const toggle = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) void el.play()
    else           el.pause()
  }, [])

  const seek = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const el = audioRef.current
    if (!el || !el.duration) return
    const rect  = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    el.currentTime = ratio * el.duration
  }, [])

  const handleWaveKeyDown = useCallback((e: React.KeyboardEvent) => {
    const el = audioRef.current
    if (!el) return
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      if (el.paused) void el.play()
      else           el.pause()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      el.currentTime = Math.max(0, el.currentTime - (e.shiftKey ? 15 : 5))
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      el.currentTime = Math.min(el.duration, el.currentTime + (e.shiftKey ? 15 : 5))
    }
  }, [])

  const displayName = filename ?? src.split(/[\\/]/).pop() ?? 'audio'
  const badge       = mode?.toUpperCase()

  const spot              = useSpotlight()
  const spotOpacityScaled = useTransform(spot.spotOpacity, o => o * 0.07)
  const spotBg            = useMotionTemplate`radial-gradient(240px circle at ${spot.spotX}px ${spot.spotY}px, rgba(199, 125, 255, ${spotOpacityScaled}), transparent 80%)`

  return (
    <motion.div
      className={styles.card}
      style={{ backgroundImage: spotBg }}
      onMouseMove={spot.onMouseMove}
      onMouseLeave={spot.onMouseLeave}
    >
      <ShineBorder borderWidth={1} duration={8} shineColor={['#C77DFF', '#F72585']} />
      <BorderBeam size={70} duration={10} colorFrom="#C77DFF" colorTo="#F72585" />
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Header row */}
      <div className={styles.header}>
        {badge && <span className={styles.badge}>{badge}</span>}
        <span className={styles.filename} title={displayName}>{displayName}</span>
      </div>

      {/* SVG Waveform */}
      <svg
        ref={svgRef}
        className={styles.waveform}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="none"
        onClick={seek}
        onKeyDown={handleWaveKeyDown}
        tabIndex={0}
        aria-label={`Audio waveform — ${playing ? 'playing' : 'paused'}. Space to play/pause, arrow keys ±5 s, Shift+arrow ±15 s.`}
        role="slider"
        aria-valuenow={Math.round(current)}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
      >
        <defs>
          <linearGradient id={gradPlayed} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#C77DFF" />
            <stop offset="100%" stopColor="#F72585" />
          </linearGradient>
          <linearGradient id={gradDim} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#C77DFF" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#F72585" stopOpacity={0.18} />
          </linearGradient>
        </defs>

        {/* Bars */}
        {barHeights.map((h, i) => {
          const barH  = Math.max(3, Math.round(h * SVG_H))
          const x     = i * (SVG_W / NUM_BARS) + 0.5
          const barW  = SVG_W / NUM_BARS - 1
          const y     = SVG_H - barH
          const played = i < playedBars
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barW}
              height={barH}
              rx={1}
              fill={played ? `url(#${gradPlayed})` : `url(#${gradDim})`}
              className={styles.bar}
              style={{ animationDelay: `${i * 6}ms` }}
            />
          )
        })}

        {/* Playhead */}
        {duration > 0 && (
          <line
            x1={playheadX}
            y1={0}
            x2={playheadX}
            y2={SVG_H}
            stroke="white"
            strokeWidth={1.5}
            strokeOpacity={0.55}
            strokeLinecap="round"
          />
        )}
      </svg>

      {/* Controls */}
      <div className={styles.controls}>
        <button
          className={styles.playBtn}
          onClick={toggle}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause size={14} strokeWidth={2} /> : <Play size={14} strokeWidth={2} />}
        </button>
        <span className={styles.time}>
          {fmtTime(current)} <span className={styles.timeSep}>/</span> {fmtTime(duration)}
        </span>
        <div className={styles.volumeArea}>
          {volume === 0
            ? <VolumeX className={styles.volumeIcon} size={12} />
            : <Volume2 className={styles.volumeIcon} size={12} />
          }
          <div className={styles.volumeWrap}>
            <ParameterSlider value={volume} min={0} max={1} step={0.01} onChange={setVolume} />
          </div>
        </div>
      </div>
    </motion.div>
  )
}
