import { useEffect, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import styles from './JobQueueOverlay.module.css'

export interface QueuedJob {
  job_id:   string
  name:     string
  tool:     string
  progress: number
  status:   'running' | 'queued'
  eta?:     number   // seconds remaining
  stage?:   string   // e.g. "loading model", "transcribing"
}

interface Props {
  open:      boolean
  jobs:      QueuedJob[]
  onClose:   () => void
  onCancel?: (job_id: string) => void
}

export function JobQueueOverlay({ open, jobs, onClose, onCancel }: Props) {
  // Track which jobs are pending cancellation (show spinner-like state)
  const [cancelling, setCancelling] = useState<Set<string>>(new Set())

  // ESC to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  const handleCancel = useCallback(async (job_id: string) => {
    if (!onCancel || cancelling.has(job_id)) return
    setCancelling(prev => new Set([...prev, job_id]))
    try {
      onCancel(job_id)
    } finally {
      // Job will disappear from list when job_cancelled WS fires
      // Reset after a timeout in case backend doesn't respond
      setTimeout(() => {
        setCancelling(prev => {
          const next = new Set(prev)
          next.delete(job_id)
          return next
        })
      }, 3000)
    }
  }, [onCancel, cancelling])

  if (!open) return null

  return createPortal(
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="GPU Job Queue"
      >
        <div className={styles.header}>
          <span className={styles.title}>GPU Queue</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={12} />
          </button>
        </div>

        <div className={styles.list}>
          {jobs.length === 0 ? (
            <div className={styles.empty}>No active jobs</div>
          ) : (
            jobs.map(job => {
              const isCancelling = cancelling.has(job.job_id)
              return (
                <div key={job.job_id} className={`${styles.job}${isCancelling ? ` ${styles.jobCancelling}` : ''}`}>
                  <div className={styles.jobHeader}>
                    <span className={`${styles.statusDot} ${job.status === 'running' ? styles.active : styles.queued}`} />
                    <span className={styles.jobName}>{job.name}</span>
                    <span className={styles.jobTool}>{job.tool}</span>
                    {onCancel && (
                      <button
                        className={styles.cancelBtn}
                        onClick={() => void handleCancel(job.job_id)}
                        disabled={isCancelling}
                        aria-label={`Cancel ${job.name}`}
                        title="Cancel job"
                      >
                        {isCancelling ? '…' : '×'}
                      </button>
                    )}
                  </div>
                  {job.status === 'running' && (
                    <>
                      <div className={styles.progressBar}>
                        <div className={styles.progressFill} style={{ transform: `scaleX(${job.progress / 100})` }} />
                      </div>
                      <div className={styles.jobMeta}>
                        <span className={styles.pct}>{job.progress}%</span>
                        {job.stage && <span className={styles.stage}>{job.stage}</span>}
                        {job.eta != null && job.eta > 0 && (
                          <span className={styles.eta}>
                            ~{Math.floor(job.eta / 60)}:{String(Math.round(job.eta % 60)).padStart(2, '0')}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </>,
    document.body
  )
}
