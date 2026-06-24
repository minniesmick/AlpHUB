import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ImageIcon, FolderOpen, RefreshCw } from 'lucide-react'
import { endpoints } from '@renderer/lib/api'
import { ws } from '@renderer/lib/ws'
import { useSettings } from '@renderer/context/Settings'
import { useToast } from '@renderer/context/Toast'
import { ProgressBar } from '@renderer/components/ProgressBar'
import { PageTransition } from '@renderer/components/PageTransition'
import { ShimmerButton } from '@/components/ui/shimmer-button'
import { useMagnetic } from '@renderer/hooks/useMagnetic'
import { BTN_SPRING } from '@renderer/lib/motion'
import { Loader2 } from 'lucide-react'
import styles from './IdeogramLocal.module.css'

// ── Aspect ratio presets ──────────────────────────────────────────────────────

interface Ratio {
  label:  string
  w:      number
  h:      number
  pw:     number   // preview box width  (px)
  ph:     number   // preview box height (px)
}

const RATIOS: Ratio[] = [
  { label: '1:1',   w: 1024, h: 1024, pw: 28, ph: 28 },
  { label: '4:3',   w: 1344, h: 1024, pw: 34, ph: 26 },
  { label: '3:4',   w: 1024, h: 1344, pw: 26, ph: 34 },
  { label: '16:9',  w: 1536, h:  864, pw: 38, ph: 22 },
  { label: '9:16',  w:  864, h: 1536, pw: 22, ph: 38 },
  { label: '2K',    w: 2048, h: 2048, pw: 28, ph: 28 },
]

// ─────────────────────────────────────────────────────────────────────────────

interface OutputFile { path: string; filename: string; mtime: number }

export default function IdeogramLocalView(): JSX.Element {
  const toast        = useToast()
  const { settings } = useSettings()
  const runMagnetic  = useMagnetic({ threshold: 80, strength: 0.35 })
  const runBtnRef    = useRef<HTMLDivElement>(null)

  const [prompt,    setPrompt]    = useState('')
  const [ratio,     setRatio]     = useState<Ratio>(RATIOS[0])
  const [steps,     setSteps]     = useState(28)
  const [guidance,  setGuidance]  = useState(3.5)
  const [seed,      setSeed]      = useState(-1)

  const [jobId,     setJobId]     = useState<string | null>(null)
  const [progress,  setProgress]  = useState(0)
  const [stage,     setStage]     = useState('')
  const [eta,       setEta]       = useState<number | undefined>(undefined)

  const [outputs,   setOutputs]   = useState<OutputFile[]>([])
  const [active,    setActive]    = useState<OutputFile | null>(null)

  // Load recent outputs on mount
  useEffect(() => {
    endpoints.ideogramOutputs(40)
      .then(r => { setOutputs(r.outputs); if (r.outputs.length) setActive(r.outputs[0]) })
      .catch(() => {})
  }, [])

  // WS job events
  useEffect(() => {
    const unsubs = [
      ws.on('job_progress', d => {
        if (d.job_id === jobId) { setProgress(d.progress); setStage(d.stage ?? ''); setEta(d.eta_seconds) }
      }),
      ws.on('job_complete', d => {
        if (d.job_id === jobId) {
          setProgress(100)
          const out: OutputFile = {
            path:     d.result_path,
            filename: d.result_path.split(/[\\/]/).pop() ?? d.result_path,
            mtime:    Math.floor(Date.now() / 1000),
          }
          setOutputs(prev => [out, ...prev])
          setActive(out)
          setJobId(null)
          toast.success('Image generated')
        }
      }),
      ws.on('job_error', d => {
        if (d.job_id === jobId) {
          setJobId(null)
          setProgress(0)
          toast.error(`Generation failed — ${d.error}`)
        }
      }),
      ws.on('job_cancelled', d => {
        if (d.job_id === jobId) {
          setJobId(null)
          setProgress(0)
          toast.warning('Cancelled')
        }
      }),
    ]
    return () => unsubs.forEach(u => u())
  }, [jobId]) // eslint-disable-line react-hooks/exhaustive-deps

  const isRunning = !!jobId
  const canRun    = prompt.trim().length > 0 && !jobId

  const run = useCallback(async () => {
    if (!canRun) return
    try {
      const r = await endpoints.ideogramGenerate({
        prompt:   prompt.trim(),
        width:    ratio.w,
        height:   ratio.h,
        steps,
        guidance,
        seed,
      })
      setJobId(r.job_id)
      setProgress(0)
      setStage('')
    } catch (e) {
      toast.error(`Failed to start: ${(e as Error).message}`)
    }
  }, [canRun, prompt, ratio, steps, guidance, seed]) // eslint-disable-line react-hooks/exhaustive-deps

  const randomSeed = () => setSeed(Math.floor(Math.random() * 2147483647))

  // Ctrl+Enter shortcut
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canRun) { e.preventDefault(); void run() }
      if (e.key === 'Escape' && isRunning) endpoints.ideogramCancel(jobId!).catch(() => {})
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [canRun, isRunning, run, jobId])

  return (
    <PageTransition>
      <div className={styles.view}>
        {/* Toolbar */}
        <div className={styles.toolbar}>
          <span className={styles.toolbarTitle}>Ideogram 4 · Local</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-disabled)' }}>
            {ratio.w}×{ratio.h} · NF4
          </span>
        </div>

        <div className={styles.body}>
          {/* ── Left controls ── */}
          <div className={styles.controls}>

            {/* Prompt */}
            <div className={styles.promptWrap}>
              <div className={styles.sectionLabel}>Prompt</div>
              <textarea
                className={styles.promptTextarea}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Describe the image…"
                rows={5}
                aria-label="Image prompt"
              />
              <span className={styles.promptCount}>{prompt.length} chars</span>
            </div>

            {/* Aspect ratio */}
            <div>
              <div className={styles.sectionLabel}>Aspect Ratio</div>
              <div className={styles.ratioGrid}>
                {RATIOS.map(r => (
                  <button
                    key={r.label}
                    className={`${styles.ratioBtn}${ratio.label === r.label ? ` ${styles.ratioBtnActive}` : ''}`}
                    onClick={() => setRatio(r)}
                    aria-pressed={ratio.label === r.label}
                    title={`${r.w}×${r.h}`}
                  >
                    <div
                      className={styles.ratioPreview}
                      style={{ width: r.pw, height: r.ph }}
                    />
                    <span className={styles.ratioLabel}>{r.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Steps */}
            <div>
              <div className={styles.sectionLabel}>Steps</div>
              <div className={styles.sliderRow}>
                <span className={styles.sliderLabel}>Inference</span>
                <input
                  className={styles.slider}
                  type="range" min={10} max={50} step={1}
                  value={steps}
                  onChange={e => setSteps(Number(e.target.value))}
                  aria-label="Inference steps"
                />
                <span className={styles.sliderVal}>{steps}</span>
              </div>
            </div>

            {/* Guidance */}
            <div>
              <div className={styles.sectionLabel}>Guidance</div>
              <div className={styles.sliderRow}>
                <span className={styles.sliderLabel}>Scale</span>
                <input
                  className={styles.slider}
                  type="range" min={1} max={10} step={0.5}
                  value={guidance}
                  onChange={e => setGuidance(Number(e.target.value))}
                  aria-label="Guidance scale"
                />
                <span className={styles.sliderVal}>{guidance}</span>
              </div>
            </div>

            {/* Seed */}
            <div>
              <div className={styles.sectionLabel}>Seed</div>
              <div className={styles.seedRow}>
                <input
                  className={styles.seedInput}
                  type="number"
                  value={seed}
                  onChange={e => setSeed(Number(e.target.value))}
                  placeholder="-1 = random"
                  aria-label="Seed"
                />
                <button className={styles.randomBtn} onClick={randomSeed} title="Random seed">
                  <RefreshCw size={11} />
                </button>
              </div>
            </div>

            {/* Run row */}
            <div className={styles.runRow}>
              {isRunning && (
                <ProgressBar value={progress} label={stage || 'Generating…'} eta={eta} animated />
              )}
              {isRunning && (
                <button
                  className={styles.cancelBtn}
                  onClick={() => endpoints.ideogramCancel(jobId!).catch(() => {})}
                >
                  Cancel
                </button>
              )}
              {!canRun && !isRunning && (
                <span className={styles.disabledReason}>Enter a prompt to generate</span>
              )}
              <motion.div
                ref={runBtnRef}
                style={{ x: runMagnetic.x, y: runMagnetic.y }}
                onMouseMove={runMagnetic.onMouseMove}
                onMouseLeave={runMagnetic.onMouseLeave}
                whileHover={{ scale: 1.025, y: -1 }}
                whileTap={{ scale: 0.94, y: 1 }}
                transition={BTN_SPRING}
              >
                <ShimmerButton
                  onClick={run}
                  disabled={!canRun || isRunning}
                  shimmerColor="#ffffff"
                  shimmerSize="0.08em"
                  shimmerDuration="2.4s"
                  borderRadius="10px"
                  background="linear-gradient(135deg, #C77DFF 0%, #F72585 100%)"
                  style={{ width: '100%', height: '42px', fontSize: 'var(--text-sm)', fontWeight: 700 }}
                  aria-label="Generate image"
                  title="Ctrl+Enter"
                >
                  {isRunning ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : 'Generate'}
                </ShimmerButton>
              </motion.div>
            </div>

          </div>

          {/* ── Right canvas ── */}
          <div className={styles.canvas}>
            {active ? (
              <>
                <div className={styles.resultWrap}>
                  <img
                    className={styles.resultImg}
                    src={`file:///${active.path.replace(/\\/g, '/')}`}
                    alt="Generated image"
                    key={active.path}
                  />
                  <div className={styles.resultActions}>
                    <button
                      className={styles.actionBtn}
                      onClick={() => window.api.showItemInFolder(active.path)}
                      title="Show in Explorer"
                    >
                      <FolderOpen size={12} />
                      Show
                    </button>
                    <button
                      className={styles.actionBtn}
                      onClick={() => {
                        const a = document.createElement('a')
                        a.href = `file:///${active.path.replace(/\\/g, '/')}`
                        a.download = active.filename
                        a.click()
                      }}
                      title="Download"
                    >
                      ↓ Save
                    </button>
                  </div>
                </div>

                {outputs.length > 1 && (
                  <div className={styles.gallery}>
                    {outputs.map(o => (
                      <img
                        key={o.path}
                        className={`${styles.galleryThumb}${active.path === o.path ? ` ${styles.galleryThumbActive}` : ''}`}
                        src={`file:///${o.path.replace(/\\/g, '/')}`}
                        alt={o.filename}
                        onClick={() => setActive(o)}
                        title={o.filename}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className={styles.emptyCanvas}>
                <ImageIcon size={48} className={styles.emptyIcon} />
                <span className={styles.emptyText}>
                  {isRunning ? `${stage || 'Generating…'} ${progress}%` : 'Generated images appear here'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  )
}
