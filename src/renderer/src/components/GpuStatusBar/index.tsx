import { useEffect, useState, useCallback, useRef } from 'react'
import { Cpu } from 'lucide-react'
import { ws } from '../../lib/ws'
import type { JobProgressEvent, JobCompleteEvent, JobErrorEvent, JobQueuedEvent, JobCancelledEvent } from '../../lib/ws'
import { endpoints } from '../../lib/api'
import { JobQueueOverlay } from '../JobQueueOverlay'
import type { QueuedJob } from '../JobQueueOverlay'
import styles from './GpuStatusBar.module.css'

// Helper: remove job_id from list and promote next queued job to running
function removeJob(prev: QueuedJob[], job_id: string): QueuedJob[] {
  const next = prev.filter(j => j.job_id !== job_id)
  if (next[0] && next[0].status === 'queued') next[0] = { ...next[0], status: 'running' }
  return next
}

export default function GpuStatusBar(): JSX.Element {
  const [jobs, setJobs] = useState<QueuedJob[]>([])
  const jobsRef = useRef<QueuedJob[]>([])
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [glitching, setGlitching] = useState(false)
  const glitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep ref in sync so handleCancel stays stable across job list updates
  jobsRef.current = jobs

  const activeJob = jobs.find(j => j.status === 'running') ?? null

  const triggerGlitch = useCallback(() => {
    setGlitching(true)
    if (glitchTimer.current) clearTimeout(glitchTimer.current)
    glitchTimer.current = setTimeout(() => setGlitching(false), 320)
  }, [])

  useEffect(() => {
    const unsubs = [
      ws.on('job_queued', (d: JobQueuedEvent) => {
        setJobs(prev => {
          const isFirst = prev.length === 0
          return [...prev, { job_id: d.job_id, name: d.name, tool: d.tool, progress: 0, status: isFirst ? 'running' : 'queued' }]
        })
        triggerGlitch()
      }),
      ws.on('job_progress', (d: JobProgressEvent) => {
        setJobs(prev => prev.map(j =>
          j.job_id === d.job_id
            ? { ...j, progress: d.progress, eta: d.eta_seconds, stage: d.stage }
            : j
        ))
      }),
      ws.on('job_complete', (d: JobCompleteEvent) => {
        setJobs(prev => removeJob(prev, d.job_id))
        // Native OS notification — fires even when window is behind other apps
        window.api.notifyJobDone('AlpHUB — Done', d.name)
      }),
      ws.on('job_error', (d: JobErrorEvent) => {
        setJobs(prev => removeJob(prev, d.job_id))
      }),
      ws.on('job_cancelled', (d: JobCancelledEvent) => {
        setJobs(prev => removeJob(prev, d.job_id))
      }),
    ]
    return () => unsubs.forEach(u => u())
  }, [triggerGlitch])

  const closeOverlay = useCallback(() => setOverlayOpen(false), [])

  const handleCancel = useCallback((job_id: string) => {
    // Route to the correct cancel endpoint based on the job's tool
    const job = jobsRef.current.find(j => j.job_id === job_id)
    const cancelFn = job?.tool === 'splitter'
      ? endpoints.splitterCancel
      : endpoints.pipelineCancel
    cancelFn(job_id).catch(() => {/* already done */})
  }, []) // jobsRef is a ref — stable, no dep needed

  const queueCount = jobs.length

  return (
    <>
      <div
        className={`${styles.bar}${queueCount > 0 ? ` ${styles.clickable}` : ''}`}
        onClick={() => queueCount > 0 && setOverlayOpen(o => !o)}
        role={queueCount > 0 ? 'button' : undefined}
        tabIndex={queueCount > 0 ? 0 : undefined}
        onKeyDown={e => { if (queueCount > 0 && (e.key === 'Enter' || e.key === ' ')) setOverlayOpen(o => !o) }}
        aria-label={queueCount > 0 ? `GPU queue: ${queueCount} job${queueCount !== 1 ? 's' : ''}. Click to view.` : 'GPU ready'}
      >
        <div className={styles.left}>
          <Cpu size={14} strokeWidth={1.5} className={`${styles.icon}${activeJob ? ` ${styles.iconActive}` : ''}`} aria-hidden="true" />
          {activeJob ? (
            <>
              <span className={`${styles.jobName}${glitching ? ' animate-glitch' : ''}`}>{activeJob.name}</span>
              {activeJob.stage && (
                <span className={styles.stage}>{activeJob.stage}</span>
              )}
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ transform: `scaleX(${activeJob.progress / 100})` }} />
              </div>
              <span className={styles.pct}>{activeJob.progress}%</span>
              {activeJob.eta != null && activeJob.eta > 0 && (
                <span className={styles.eta}>
                  ~{Math.floor(activeJob.eta / 60)}:{String(Math.round(activeJob.eta % 60)).padStart(2, '0')}
                </span>
              )}
            </>
          ) : (
            <span className={styles.idle}>GPU ready</span>
          )}
        </div>

        <div className={styles.right}>
          {queueCount > 1 && (
            <span className={styles.queueBadge}>{queueCount - 1} waiting</span>
          )}
        </div>
      </div>

      <JobQueueOverlay
        open={overlayOpen}
        jobs={jobs}
        onClose={closeOverlay}
        onCancel={handleCancel}
      />
    </>
  )
}
