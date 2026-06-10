/**
 * SignalFlowBg — three aurora orbs drifting behind the node canvas.
 * Pure CSS, compositor-only (transform + opacity). No JS loop.
 */
import styles from './SignalFlowBg.module.css'

export function SignalFlowBg(): JSX.Element {
  return (
    <div className={styles.root} aria-hidden="true">
      <div className={`${styles.orb} ${styles.orb1}`} />
      <div className={`${styles.orb} ${styles.orb2}`} />
      <div className={`${styles.orb} ${styles.orb3}`} />
    </div>
  )
}
