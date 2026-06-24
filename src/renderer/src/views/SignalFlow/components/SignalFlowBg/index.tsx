/**
 * SignalFlowBg — three aurora orbs drifting behind the node canvas.
 * Pure CSS, compositor-only (transform + opacity). No JS loop.
 */
import styles from './SignalFlowBg.module.css'

export function SignalFlowBg(): JSX.Element {
  return (
    <div className={styles.root} aria-hidden="true">
      <svg className={styles.filterDefs}>
        <defs>
          <filter id="aurora-distort" x="-50%" y="-50%" width="200%" height="200%">
            <feTurbulence type="turbulence" baseFrequency="0.005 0.003" numOctaves="2" seed="5" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="65" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>
      <div className={`${styles.orb} ${styles.orb1}`} />
      <div className={`${styles.orb} ${styles.orb2}`} />
      <div className={`${styles.orb} ${styles.orb3}`} />
      <div className={`${styles.orb} ${styles.orb4}`} />
      <div className={`${styles.orb} ${styles.orb5}`} />
    </div>
  )
}
