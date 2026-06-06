/**
 * SplitterBg — animated stem-separation background.
 * 4 color zones (vocals / drums / bass / other) each containing
 * fader bars that breathe at different rates, visualising stem isolation.
 * Purely decorative; uses only CSS transforms on the compositor thread.
 */
import styles from './SplitterBg.module.css'

// Stems in display order with brand colors
const ZONES = [
  { key: 'vocals', color: '#C77DFF' }, // primary — neon purple
  { key: 'drums',  color: '#F72585' }, // secondary — hot pink
  { key: 'bass',   color: '#00C2C7' }, // teal / cyan
  { key: 'other',  color: '#F5A623' }, // amber
] as const

const BARS_PER_ZONE = 9
// Different speed pools per zone so zones don't move in unison
const SPEED_POOLS: number[][] = [
  [3.1, 4.6, 2.8, 5.0, 3.4],
  [4.2, 2.7, 5.3, 3.8, 4.9],
  [2.5, 4.1, 3.6, 5.5, 3.0],
  [4.8, 3.3, 5.1, 2.9, 4.4],
]
const MAX_HEIGHTS = [28, 50, 38, 64, 42, 56, 32, 68, 44]

export function SplitterBg(): JSX.Element {
  return (
    <div className={styles.root} aria-hidden="true">
      {ZONES.map((zone, zi) => (
        <div key={zone.key} className={styles.zone} style={{ '--col': zone.color } as React.CSSProperties}>
          {Array.from({ length: BARS_PER_ZONE }, (_, bi) => {
            const speeds = SPEED_POOLS[zi]
            const speed  = speeds[bi % speeds.length]
            const maxH   = MAX_HEIGHTS[bi % MAX_HEIGHTS.length]
            const delay  = -((bi / BARS_PER_ZONE + zi * 0.25) * speed * 1000).toFixed(0)
            return (
              <div
                key={bi}
                className={styles.bar}
                style={{
                  '--col':   zone.color,
                  '--spd':   `${speed}s`,
                  '--delay': `${delay}ms`,
                  '--maxH':  `${maxH}px`,
                } as React.CSSProperties}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
