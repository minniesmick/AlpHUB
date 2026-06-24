import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'motion/react'
import { FileDropZone } from '@renderer/components/FileDropZone'
import { ProgressBar } from '@renderer/components/ProgressBar'
import { endpoints } from '@renderer/lib/api'
import { ws } from '@renderer/lib/ws'
import { useFileTransfer } from '@renderer/context/FileTransfer'
import { useToast } from '@renderer/context/Toast'
import { useSettings } from '@renderer/context/Settings'
import { StemGrid } from './components/StemGrid'
import { SplitterBg } from './components/SplitterBg'
import { BTN_SPRING } from '@renderer/lib/motion'
import { Loader2 } from 'lucide-react'
import { ShimmerButton } from '@/components/ui/shimmer-button'
import { useMagnetic } from '@renderer/hooks/useMagnetic'
import { useParticleBurst } from '@renderer/hooks/useParticleBurst'
import { ProcessingMarquee } from '@renderer/components/ProcessingMarquee'
import styles from './Splitter.module.css'
import { PageTransition } from '@renderer/components/PageTransition'

// ── Stem definitions ────────────────────────────────────────────────────────

type StemKey = 'vocals' | 'drums' | 'bass' | 'other' | 'piano' | 'guitar'

const STEMS_4: StemKey[] = ['vocals', 'drums', 'bass', 'other']
const STEMS_6: StemKey[] = ['vocals', 'drums', 'bass', 'other', 'piano', 'guitar']

const STEM_LABELS: Record<StemKey, string> = {
  vocals: 'Vocals', drums: 'Drums', bass: 'Bass',
  other: 'Other', piano: 'Piano', guitar: 'Guitar',
}

// ── Model definitions ───────────────────────────────────────────────────────

const MODELS = [
  { id: 'htdemucs_ft', name: 'htdemucs_ft', desc: 'Fine-tuned · best quality · 4-stem', stems: 4 },
  { id: 'htdemucs_6s', name: 'htdemucs_6s', desc: '6-stem · vocals/drums/bass/other/piano/guitar', stems: 6 },
  { id: 'mdx_extra',   name: 'mdx_extra',   desc: 'MDX · fast · strong separation · 4-stem', stems: 4 },
]

// ── Component ───────────────────────────────────────────────────────────────

interface OutputFile { path: string; filename: string; createdAt?: number }

// ── Persistence helpers ───────────────────────────────────────────────────────

const SPLITTER_OUTPUTS_KEY = 'alphub_splitter_outputs_v1'
const SPLITTER_PREFS_KEY   = 'alphub_splitter_prefs_v1'
const MAX_SPLITTER_OUTPUTS = 100   // stems accumulate fast

interface SplitterPrefs {
  modelId: string
  format:  'wav' | 'flac' | 'mp3'
  checked: StemKey[]
}

const DEFAULT_SPLITTER_PREFS: SplitterPrefs = {
  modelId: 'htdemucs_ft', format: 'wav', checked: [...STEMS_4],
}

function loadSplitterPrefs(): SplitterPrefs {
  try {
    const raw = localStorage.getItem(SPLITTER_PREFS_KEY)
    return raw ? { ...DEFAULT_SPLITTER_PREFS, ...(JSON.parse(raw) as Partial<SplitterPrefs>) } : DEFAULT_SPLITTER_PREFS
  } catch { return DEFAULT_SPLITTER_PREFS }
}

function saveSplitterPrefs(p: SplitterPrefs): void {
  try { localStorage.setItem(SPLITTER_PREFS_KEY, JSON.stringify(p)) } catch { /* quota */ }
}

function loadSplitterOutputs(): OutputFile[] {
  try {
    const raw = localStorage.getItem(SPLITTER_OUTPUTS_KEY)
    return raw ? (JSON.parse(raw) as OutputFile[]) : []
  } catch { return [] }
}

function saveSplitterOutputs(outputs: OutputFile[]): void {
  try {
    localStorage.setItem(SPLITTER_OUTPUTS_KEY, JSON.stringify(outputs.slice(0, MAX_SPLITTER_OUTPUTS)))
  } catch { /* quota */ }
}

// ─────────────────────────────────────────────────────────────────────────────

export default function SplitterView(): JSX.Element {
  const toast = useToast()
  const { settings } = useSettings()
  const { pending, setPending }   = useFileTransfer()
  const runMagnetic = useMagnetic({ threshold: 80, strength: 0.35 })
  const burst       = useParticleBurst()
  const runBtnRef   = useRef<HTMLDivElement>(null)
  const [inputFile, setInputFile] = useState<File | null>(null)
  const [incomingPath, setIncomingPath] = useState<string | null>(null)
  const [modelId, setModelId]     = useState(() => loadSplitterPrefs().modelId)
  const [sixStem, setSixStem]     = useState(false)
  const [checked, setChecked]     = useState<Set<StemKey>>(() => new Set(loadSplitterPrefs().checked))
  const [format, setFormat]       = useState<'wav' | 'flac' | 'mp3'>(() => loadSplitterPrefs().format)
  const [jobId, setJobId]         = useState<string | null>(null)
  const [progress, setProgress]   = useState(0)
  const [eta, setEta]             = useState<number | undefined>(undefined)
  const [outputs, setOutputs]     = useState<OutputFile[]>(loadSplitterOutputs)
  const [jobGlow, setJobGlow]     = useState(false)
  const prevOutputsLenRef         = useRef(outputs.length)

  // Pick up file transferred from another tool
  useEffect(() => {
    if (pending && pending.fromTool !== 'splitter') {
      setIncomingPath(pending.path)
      setInputFile(null)
      setPending(null)
    }
  }, [pending, setPending])

  // Auto-enable 6-stem when htdemucs_6s selected, revert when switching away
  useEffect(() => {
    const model = MODELS.find(m => m.id === modelId)
    if (model) setSixStem(model.stems === 6)
  }, [modelId])

  const availableStems = sixStem ? STEMS_6 : STEMS_4

  // Clamp checked stems to available set when toggling 6-stem
  useEffect(() => {
    setChecked(prev => new Set([...prev].filter(s => availableStems.includes(s))))
  }, [sixStem]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (outputs.length > prevOutputsLenRef.current) {
      setJobGlow(true)
      const t = setTimeout(() => setJobGlow(false), 600)
      prevOutputsLenRef.current = outputs.length
      return () => clearTimeout(t)
    }
    prevOutputsLenRef.current = outputs.length
  }, [outputs])

  // WS job events
  useEffect(() => {
    const unsubs = [
      ws.on('job_progress', d => {
        if (d.job_id === jobId) { setProgress(d.progress); setEta(d.eta_seconds) }
      }),
      ws.on('job_complete', d => {
        if (d.job_id === jobId) {
          setProgress(100)
          // result_path is JSON array of exported stem file paths
          let stemPaths: string[] = []
          try { stemPaths = JSON.parse(d.result_path) } catch { stemPaths = [d.result_path] }
          const ts    = Date.now()
          const files = stemPaths.map(p => ({
            path:      p,
            filename:  p.split(/[\\/]/).pop() ?? p,
            createdAt: ts,
          }))
          setOutputs(prev => [...files, ...prev])
          toast.success(`${files.length} stem${files.length !== 1 ? 's' : ''} extracted`)
          const rect = runBtnRef.current?.getBoundingClientRect()
          if (rect) burst(rect.left + rect.width / 2, rect.top + rect.height / 2)
          setJobId(null)
        }
      }),
      ws.on('job_error', d => {
        if (d.job_id === jobId) {
          setJobId(null)
          setProgress(0)
          toast.error(`Stem split failed — ${d.error}`)
        }
      }),
      ws.on('job_cancelled', d => {
        if (d.job_id === jobId) {
          setJobId(null)
          setProgress(0)
          toast.warning('Split cancelled')
        }
      }),
    ]
    return () => unsubs.forEach(u => u())
  }, [jobId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist outputs history
  useEffect(() => { saveSplitterOutputs(outputs) }, [outputs])

  // Persist user preferences
  useEffect(() => {
    saveSplitterPrefs({ modelId, format, checked: [...checked] })
  }, [modelId, format, checked])

  const toggleStem = (stem: StemKey) => {
    setChecked(prev => {
      const next = new Set(prev)
      next.has(stem) ? next.delete(stem) : next.add(stem)
      return next
    })
  }

  // Electron exposes full OS path via File.path (declared in env.d.ts)
  const effectivePath = inputFile?.path ?? incomingPath ?? null

  const run = useCallback(async () => {
    if (!effectivePath || jobId) return
    const payload = {
      input_path:    effectivePath,
      model_id:      modelId,
      stems:         [...checked],
      output_folder: settings.outputPath,
      format,
    }
    try {
      const r = await endpoints.splitterRun(payload)
      setJobId(r.job_id)
      setProgress(0)
    } catch (e) {
      toast.error(`Split failed: ${(e as Error).message}`)
    }
  }, [effectivePath, jobId, modelId, checked, settings.outputPath, format])

  const isRunning = !!jobId
  const canRun = effectivePath !== null && checked.size > 0 && !jobId

  const disabledReason: string = canRun ? '' :
    isRunning              ? 'Job running — cancel first'   :
    effectivePath === null ? 'Drop an audio file first'     :
    checked.size === 0     ? 'Select at least one stem'     :
    ''

  // Stable refs so keydown effect re-registers only when canRun/isRunning changes
  const runRef    = useRef<() => unknown>(() => undefined)
  const cancelRef = useRef<() => unknown>(() => undefined)
  runRef.current    = run
  cancelRef.current = () => endpoints.splitterCancel(jobId!).catch(() => {})

  // Keyboard shortcuts: Ctrl+Enter → split, Escape → cancel
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        if (canRun) void (runRef.current as () => Promise<void>)()
      } else if (e.key === 'Escape' && isRunning) {
        e.preventDefault()
        void (cancelRef.current as () => Promise<void>)()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [canRun, isRunning])

  return (
    <PageTransition>
      <div className={styles.view}>
      <SplitterBg />
      <div className={styles.ambientOrb} />

      <div className={styles.toolbar}>
        <span className={styles.toolbarTitle}>Stem Splitter</span>
      </div>

      <div className={styles.body}>
        {/* Input file */}
        <FileDropZone
          accept="audio/*,.wav,.mp3,.flac,.ogg,.opus,.m4a"
          file={inputFile}
          onFile={f => { setInputFile(f); setIncomingPath(null) }}
          onClear={() => { setInputFile(null); setIncomingPath(null) }}
          showClear={!!incomingPath}
          title={incomingPath ? `← ${incomingPath.split(/[\\/]/).pop()}` : 'Drop audio to split'}
          subtitle={incomingPath ? 'From Pipeline · click × to clear' : 'wav · mp3 · flac · ogg · opus (WhatsApp)'}
        />

        <div className={styles.divider} />

        {/* Model */}
        <div>
          <div className={styles.sectionLabel}>Model</div>
          <div className={styles.modelGroup} role="radiogroup" aria-label="Model">
            {MODELS.map(m => (
              <motion.div
                key={m.id}
                className={`${styles.modelCard}${modelId === m.id ? ` ${styles.selected}` : ''}`}
                onClick={() => setModelId(m.id)}
                role="radio"
                aria-checked={modelId === m.id}
                tabIndex={0}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setModelId(m.id)}
                whileHover={{ y: -2, boxShadow: '0 8px 28px rgba(199,125,255,0.16)' }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              >
                <div className={styles.modelName}>{m.name}</div>
                <div className={styles.modelDesc}>{m.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Stems */}
        <div>
          <div className={styles.sectionLabel}>Stems</div>
          <div className={styles.stemGrid}>
            {STEMS_6.map(stem => {
              const available = availableStems.includes(stem)
              const isChecked = checked.has(stem)
              return (
                <button
                  key={stem}
                  className={`${styles.stemChip}${isChecked ? ` ${styles.checked}` : ''}${!available ? ` ${styles.disabled}` : ''}`}
                  onClick={() => available && toggleStem(stem)}
                  aria-pressed={isChecked}
                  aria-disabled={!available}
                >
                  {STEM_LABELS[stem]}
                </button>
              )
            })}
          </div>

          <div className={styles.stemActions}>
            <button className={styles.stemToggle} onClick={() => setChecked(new Set(availableStems))}>All</button>
            <button className={styles.stemToggle} onClick={() => setChecked(new Set())}>None</button>
            <div style={{ flex: 1 }} />
            <button
              className={`${styles.sixStemToggle}${sixStem ? ` ${styles.on}` : ''}`}
              onClick={() => modelId !== 'htdemucs_6s' && setSixStem(s => !s)}
              aria-pressed={sixStem}
              disabled={modelId === 'htdemucs_6s'}
              title={modelId === 'htdemucs_6s' ? '6-stem forced by model' : undefined}
            >
              6-stem {sixStem ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        <div className={styles.divider} />

        {/* Output format */}
        <div>
          <div className={styles.sectionLabel}>Format</div>
          <div className={styles.stemGrid}>
            {(['wav', 'flac', 'mp3'] as const).map(f => (
              <button
                key={f}
                className={`${styles.stemChip}${format === f ? ` ${styles.checked}` : ''}`}
                onClick={() => setFormat(f)}
                aria-pressed={format === f}
              >
                .{f}
              </button>
            ))}
          </div>
        </div>

        {jobId && (
          <>
            <ProgressBar value={progress} label="Splitting stems…" eta={eta} animated />
            <ProcessingMarquee
              stages={['Loading demucs model', 'Separating sources', 'Extracting stems', 'Writing files']}
              className={styles.marquee}
            />
          </>
        )}

        <div className={styles.runRow}>
          <span className={styles.outputHint}>
            <span className={styles.outputHintLabel}>Out</span>
            {settings.outputPath}
          </span>
          {effectivePath && (
            <span className={styles.inputHint}>
              <span className={styles.inputHintLabel}>In</span>
              {effectivePath.split(/[\\/]/).pop()}
            </span>
          )}
          {jobId && (
            <button
              className={styles.cancelBtn}
              onClick={() => endpoints.splitterCancel(jobId).catch(() => {})}
              aria-label="Cancel split job"
            >
              Cancel
            </button>
          )}
          <motion.div
            ref={runBtnRef}
            style={{ x: runMagnetic.x, y: runMagnetic.y }}
            onMouseMove={runMagnetic.onMouseMove}
            onMouseLeave={runMagnetic.onMouseLeave}
            whileHover={{ scale: 1.025, y: -1 }}
            whileTap={{ scale: 0.94, y: 1 }}
          >
            <ShimmerButton
              onClick={run}
              disabled={!canRun || !!jobId}
              shimmerColor="#ffffff"
              shimmerSize="0.06em"
              shimmerDuration="2.5s"
              background="linear-gradient(135deg, #C77DFF 0%, #F72585 100%)"
              borderRadius="var(--radius-md)"
              className="h-9 px-5 text-sm font-bold tracking-wider font-display"
            >
              {!!jobId && <Loader2 size={13} className="animate-spin mr-1.5 inline-block" />}
              {jobId ? 'Running…' : 'Split'}
            </ShimmerButton>
          </motion.div>
        </div>

        <motion.div
          animate={{
            scale: jobGlow ? [1, 1.008, 1] : 1,
            boxShadow: jobGlow
              ? ['0 0 0 0px rgba(199,125,255,0)', '0 0 0 1px rgba(199,125,255,0.45), 0 0 28px rgba(199,125,255,0.14)', '0 0 0 0px rgba(199,125,255,0)']
              : '0 0 0 0px rgba(199,125,255,0)',
          }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          style={{ borderRadius: 'var(--radius-xl)' }}
        >
          <StemGrid files={outputs} fromTool="splitter" onClear={() => setOutputs([])} />
        </motion.div>
      </div>
    </div>
    </PageTransition>
  )
}
