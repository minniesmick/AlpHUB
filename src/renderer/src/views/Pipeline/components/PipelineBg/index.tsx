/**
 * PipelineBg — animated EQ / fader-strip background.
 * 40 vertical bars pulse with staggered sine-wave phases,
 * creating an organic frequency-analyzer feel at very low opacity.
 * Pure CSS — no JS animation loop, GPU composited (transform only).
 */
import styles from './PipelineBg.module.css'

const BAR_COUNT = 40
// Alternating speeds so bars don't lock in sync
const SPEEDS = [3.6, 4.8, 2.9, 5.2, 3.2, 4.4, 2.6, 5.8, 3.9, 4.1]
// Max heights vary across 5 groups for visual texture
const MAX_HEIGHTS = [28, 44, 60, 52, 36, 68, 40, 56, 32, 72]

export function PipelineBg(): JSX.Element {
  return (
    <div className={styles.root} aria-hidden="true">
      {Array.from({ length: BAR_COUNT }, (_, i) => {
        const speed  = SPEEDS[i % SPEEDS.length]
        const maxH   = MAX_HEIGHTS[i % MAX_HEIGHTS.length]
        // Negative delay = start mid-animation (phase offset per bar)
        const delay  = -((i / BAR_COUNT) * speed * 1000).toFixed(0)
        const isPink = i % 5 === 2   // every 5th bar = secondary (hot pink)

        return (
          <div
            key={i}
            className={`${styles.bar} ${isPink ? styles.barPink : ''}`}
            style={{
              '--spd':   `${speed}s`,
              '--delay': `${delay}ms`,
              '--maxH':  `${maxH}px`,
            } as React.CSSProperties}
          />
        )
      })}
    </div>
  )
}
