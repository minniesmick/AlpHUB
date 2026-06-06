import styles from './ProgressBar.module.css'

interface Props {
  value: number           // 0–100
  label?: string
  eta?: number            // seconds
  animated?: boolean      // shimmer
  className?: string
}

function fmtEta(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
}

export function ProgressBar({ value, label, eta, animated = true, className }: Props) {
  const pct = Math.max(0, Math.min(100, value))

  return (
    <div className={`${styles.root}${className ? ` ${className}` : ''}`}>
      {(label || eta !== undefined) && (
        <div className={styles.header}>
          {label && <span className={styles.label}>{label}</span>}
          {eta !== undefined && eta > 0 && (
            <span className={styles.meta}>ETA {fmtEta(eta)}</span>
          )}
        </div>
      )}
      <div className={styles.track} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={styles.fill} style={{ transform: `scaleX(${pct / 100})` }}>
          {animated && pct < 100 && <div className={styles.shimmer} />}
        </div>
      </div>
    </div>
  )
}
