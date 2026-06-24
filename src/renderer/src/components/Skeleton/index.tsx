import styles from './Skeleton.module.css'

// ── SkeletonLine ──────────────────────────────────────────────────────────────

interface LineProps {
  width?:  string
  height?: string
  className?: string
}

export function SkeletonLine({ width = '100%', height = '12px', className }: LineProps): JSX.Element {
  return (
    <span
      className={`${styles.base}${className ? ` ${className}` : ''}`}
      style={{ width, height, borderRadius: 'var(--radius-sm)' }}
      aria-hidden="true"
    />
  )
}

// ── SkeletonCard ──────────────────────────────────────────────────────────────

interface CardProps {
  lines?:  number
  header?: string
  className?: string
}

export function SkeletonCard({ lines = 3, header = '60%', className }: CardProps): JSX.Element {
  return (
    <div className={`${styles.card}${className ? ` ${className}` : ''}`} aria-hidden="true" aria-busy="true">
      <SkeletonLine height="14px" width={header} />
      {Array.from({ length: lines - 1 }, (_, i) => (
        <SkeletonLine key={i} height="12px" width={i === lines - 2 ? '45%' : '100%'} />
      ))}
    </div>
  )
}

// ── SkeletonRing ──────────────────────────────────────────────────────────────

interface RingProps {
  size?: number
  className?: string
}

export function SkeletonRing({ size = 108, className }: RingProps): JSX.Element {
  return (
    <div className={`${styles.ringCard}${className ? ` ${className}` : ''}`} aria-hidden="true" aria-busy="true">
      <SkeletonLine height="10px" width="40%" />
      <span
        className={`${styles.base} ${styles.ring}`}
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
      <SkeletonLine height="22px" width="50%" />
      <SkeletonLine height="10px" width="55%" />
    </div>
  )
}
