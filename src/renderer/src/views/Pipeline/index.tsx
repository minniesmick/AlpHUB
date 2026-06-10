import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'motion/react'
import { ChevronDown, Check, Play, X } from 'lucide-react'
import { FileDropZone } from '@renderer/components/FileDropZone'
import { ModelSelector } from '@renderer/components/ModelSelector'
import { ProgressBar } from '@renderer/components/ProgressBar'
import { endpoints } from '@renderer/lib/api'
import type { Model } from '@renderer/lib/api'
import { ws } from '@renderer/lib/ws'
import { useToast } from '@renderer/context/Toast'
import { useSettings } from '@renderer/context/Settings'
import { useFileTransfer } from '@renderer/context/FileTransfer'
import { ParameterSlider } from '@renderer/components/ParameterSlider'
import { ModeSelector } from './components/ModeSelector'
import type { PipelineMode } from './components/ModeSelector'
import { OutputConfig } from './components/OutputConfig'
import { WaveformCard }          from './components/WaveformCard'
import { TypewriterCard }         from './components/TypewriterCard'
import { OutputFileList }         from './components/OutputFileList'
import { ProfileCreationSheet }   from './components/ProfileCreationSheet'
import { MicButton }              from './components/MicButton'
import { PipelineBg }             from './components/PipelineBg'
import styles from './Pipeline.module.css'
import { PageTransition } from '@renderer/components/PageTransition'

interface OutputFile { path: string; filename: string; createdAt?: number }
interface BatchItem  { job_id: string; filename: string; progress: number; status: 'queued' | 'running' | 'done' | 'error' }

const KOKORO_VOICES: { id: string; label: string; group: string }[] = [
  { id: 'af_heart',    label: 'Heart',    group: 'AF' },
  { id: 'af_sky',      label: 'Sky',      group: 'AF' },
  { id: 'af_bella',    label: 'Bella',    group: 'AF' },
  { id: 'af_sarah',    label: 'Sarah',    group: 'AF' },
  { id: 'af_nicole',   label: 'Nicole',   group: 'AF' },
  { id: 'am_adam',     label: 'Adam',     group: 'AM' },
  { id: 'am_michael',  label: 'Michael',  group: 'AM' },
  { id: 'bf_emma',     label: 'Emma',     group: 'BF' },
  { id: 'bf_isabella', label: 'Isabella', group: 'BF' },
  { id: 'bm_george',   label: 'George',   group: 'BM' },
  { id: 'bm_lewis',    label: 'Lewis',    group: 'BM' },
]

const GROUP_LABELS: Record<string, string> = {
  AF: 'American Female',
  AM: 'American Male',
  BF: 'British Female',
  BM: 'British Male',
}

// ── Language options ──────────────────────────────────────────────────────────

const LANG_OPTIONS: { value: string; label: string }[] = [
  { value: '',   label: 'Auto-detect' },
  { value: 'tr', label: 'Türkçe (tr)' },
  { value: 'en', label: 'English (en)' },
  { value: 'de', label: 'Deutsch (de)' },
  { value: 'fr', label: 'Français (fr)' },
  { value: 'es', label: 'Español (es)' },
  { value: 'it', label: 'Italiano (it)' },
  { value: 'pt', label: 'Português (pt)' },
  { value: 'ru', label: 'Русский (ru)' },
  { value: 'ja', label: '日本語 (ja)' },
  { value: 'zh', label: '中文 (zh)' },
  { value: 'ar', label: 'العربية (ar)' },
]

interface LangSelectProps { value: string; onChange: (v: string) => void }

function LangSelect({ value, onChange }: LangSelectProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = LANG_OPTIONS.find(o => o.value === value) ?? LANG_OPTIONS[0]

  useEffect(() => {
    if (!open) return
    const onMouse = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown',   onKey)
    return () => { document.removeEventListener('mousedown', onMouse); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={rootRef} className={styles.langRoot}>
      <button
        className={`${styles.langTrigger}${open ? ` ${styles.langTriggerOpen}` : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Whisper language"
        type="button"
      >
        <span className={styles.langTriggerText}>{selected.label}</span>
        <ChevronDown size={12} className={styles.langChevron} />
      </button>
      {open && (
        <div className={styles.langDropdown} role="listbox" aria-label="Whisper language options">
          {LANG_OPTIONS.map(o => (
            <button
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`${styles.langOption}${o.value === value ? ` ${styles.langOptionActive}` : ''}`}
              onClick={() => { onChange(o.value); setOpen(false) }}
              type="button"
            >
              {o.value === value && <Check size={10} className={styles.langCheck} />}
              <span className={styles.langOptionText}>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Pipeline config presets (T2-D) ───────────────────────────────────────────

interface PipelinePreset {
  id: string
  name: string
  mode: PipelineMode
  modelId?: string
  ttsVoice: string
  ttsSpeed: number
  whisperLang: string
  format: string
}

const PRESET_KEY = 'alphub_pipeline_configs_v1'

const BUILTIN_PRESETS: PipelinePreset[] = [
  { id: '_stt_txt',  name: 'STT → TXT',   mode: 'stt', ttsVoice: 'af_heart', ttsSpeed: 1.0, whisperLang: '', format: 'txt' },
  { id: '_stt_srt',  name: 'STT → SRT',   mode: 'stt', ttsVoice: 'af_heart', ttsSpeed: 1.0, whisperLang: '', format: 'srt' },
  { id: '_tts_wav',  name: 'TTS → WAV',   mode: 'tts', ttsVoice: 'af_heart', ttsSpeed: 1.0, whisperLang: '', format: 'wav' },
  { id: '_ttt_txt',  name: 'TTT → TXT',   mode: 'ttt', ttsVoice: 'af_heart', ttsSpeed: 1.0, whisperLang: '', format: 'txt' },
]

function loadPresets(): PipelinePreset[] {
  try { return JSON.parse(localStorage.getItem(PRESET_KEY) ?? '[]') } catch { return [] }
}
function savePresetsToStorage(presets: PipelinePreset[]): void {
  localStorage.setItem(PRESET_KEY, JSON.stringify(presets))
}

interface PresetDropdownProps {
  presets:      PipelinePreset[]
  onApply:      (p: PipelinePreset) => void
  onSave:       (name: string) => void
  onDelete:     (id: string) => void
}

function PresetDropdown({ presets, onApply, onSave, onDelete }: PresetDropdownProps): JSX.Element {
  const [open, setOpen]       = useState(false)
  const [saveName, setSaveName] = useState('')
  const rootRef               = useRef<HTMLDivElement>(null)
  const inputRef              = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const onMouse = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown',   onKey)
    return () => { document.removeEventListener('mousedown', onMouse); document.removeEventListener('keydown', onKey) }
  }, [open])

  const commitSave = () => {
    const n = saveName.trim()
    if (!n) return
    onSave(n)
    setSaveName('')
    setOpen(false)
  }

  return (
    <div ref={rootRef} className={styles.presetRoot}>
      <button
        className={`${styles.presetTrigger}${open ? ` ${styles.presetTriggerOpen}` : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Pipeline presets"
        type="button"
        title="Load or save pipeline configuration"
      >
        <span className={styles.presetTriggerText}>Presets</span>
        <ChevronDown size={12} className={styles.presetChevron} />
      </button>
      {open && (
        <div className={styles.presetDropdown} role="listbox" aria-label="Pipeline presets">
          {/* Built-in presets */}
          {BUILTIN_PRESETS.map(p => (
            <button
              key={p.id}
              className={styles.presetItem}
              onClick={() => { onApply(p); setOpen(false) }}
              type="button"
            >
              <span className={`${styles.presetDot} ${styles.presetDotBuiltin}`} aria-hidden="true" />
              {p.name}
            </button>
          ))}

          {/* Custom presets */}
          {presets.length > 0 && <div className={styles.presetSep} />}
          {presets.map(p => (
            <div key={p.id} className={styles.presetItemWrap}>
              <button
                className={styles.presetItem}
                onClick={() => { onApply(p); setOpen(false) }}
                type="button"
              >
                <span className={`${styles.presetDot} ${styles.presetDotCustom}`} aria-hidden="true" />
                {p.name}
              </button>
              <button
                className={styles.presetDeleteBtn}
                onClick={() => onDelete(p.id)}
                aria-label={`Delete preset ${p.name}`}
                type="button"
              ><X size={10} strokeWidth={2} /></button>
            </div>
          ))}

          {/* Save current config */}
          <div className={styles.presetSep} />
          <div className={styles.presetSaveRow}>
            <input
              ref={inputRef}
              className={styles.presetNameInput}
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitSave() }}
              placeholder="Name config…"
              type="text"
              maxLength={40}
            />
            <button
              className={styles.presetSaveBtn}
              onClick={commitSave}
              disabled={!saveName.trim()}
              type="button"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Output history & preference persistence ──────────────────────────────────

const OUTPUTS_KEY = 'alphub_pipeline_outputs_v1'
const PREFS_KEY   = 'alphub_pipeline_prefs_v1'
const MAX_OUTPUTS = 50

interface PipelinePrefs {
  mode:        PipelineMode
  ttsVoice:    string
  ttsSpeed:    number
  whisperLang: string
}

const DEFAULT_PREFS: PipelinePrefs = {
  mode: 'stt', ttsVoice: 'af_heart', ttsSpeed: 1.0, whisperLang: '',
}

function loadPrefs(): PipelinePrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<PipelinePrefs>) } : DEFAULT_PREFS
  } catch { return DEFAULT_PREFS }
}

function savePrefs(p: PipelinePrefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)) } catch { /* quota */ }
}

function loadOutputs(): OutputFile[] {
  try {
    const raw = localStorage.getItem(OUTPUTS_KEY)
    return raw ? (JSON.parse(raw) as OutputFile[]) : []
  } catch { return [] }
}

function saveOutputsToStorage(outputs: OutputFile[]): void {
  try {
    localStorage.setItem(OUTPUTS_KEY, JSON.stringify(outputs.slice(0, MAX_OUTPUTS)))
  } catch { /* quota */ }
}

// ─────────────────────────────────────────────────────────────────────────────

export default function PipelineView(): JSX.Element {
  const toast = useToast()
  const { settings, set: setSetting } = useSettings()
  const { pending, setPending }   = useFileTransfer()
  const [mode, setMode]           = useState<PipelineMode>(() => loadPrefs().mode)
  const [models, setModels]       = useState<Model[]>([])
  const [modelId, setModelId]     = useState<string | undefined>(undefined)
  const [ttsVoice, setTtsVoice]   = useState(() => loadPrefs().ttsVoice)
  const [ttsSpeed, setTtsSpeed]   = useState(() => loadPrefs().ttsSpeed)
  const [whisperLang, setWhisperLang] = useState(() => loadPrefs().whisperLang)   // '' = auto
  const [inputFile, setInputFile]   = useState<File | null>(null)
  const [micPath,   setMicPath]     = useState<string | null>(null)   // temp path from mic recording
  const [incomingPath, setIncomingPath] = useState<string | null>(null) // cross-tool transfer
  const [inputText, setInputText]   = useState('')
  const [format, setFormat]       = useState('wav')
  const [jobId, setJobId]         = useState<string | null>(null)
  const [progress, setProgress]   = useState(0)
  const [eta, setEta]             = useState<number | undefined>(undefined)
  const [outputs, setOutputs]     = useState<OutputFile[]>(loadOutputs)
  const [lastAudio, setLastAudio] = useState<string | null>(null)
  const [lastText,  setLastText]  = useState<string | null>(null)
  const [profileSheetOpen, setProfileSheetOpen] = useState(false)

  // Voice preview (T2-B)
  const [previewJobId,        setPreviewJobId]        = useState<string | null>(null)
  const [previewLoadingVoice, setPreviewLoadingVoice] = useState<string | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement>(null)
  // Stable refs for keyboard shortcut handler — updated inline each render
  const runRef    = useRef<() => unknown>(() => undefined)
  const cancelRef = useRef<() => unknown>(() => undefined)

  // Batch STT (T2-A)
  const [batchItems, setBatchItems] = useState<BatchItem[]>([])
  const batchItemsRef = useRef<BatchItem[]>([])

  // Config presets (T2-D)
  const [presets, setPresets] = useState<PipelinePreset[]>(loadPresets)

  // TTT system prompt
  const [systemPrompt, setSystemPrompt] = useState('')

  // Ollama state (TTT mode)
  const [ollamaRunning,  setOllamaRunning]  = useState(false)
  const [ollamaModels,   setOllamaModels]   = useState<{ id: string; name: string; size_gb: number }[]>([])
  const [ollamaModelId,  setOllamaModelId]  = useState<string>('')
  const [ollamaStarting, setOllamaStarting] = useState(false)

  // Auto-reset format + clear output + clear mic when mode changes
  useEffect(() => {
    const producesText = mode === 'stt' || mode === 'ttt'
    setFormat(producesText ? 'txt' : 'wav')
    setLastAudio(null)
    setLastText(null)
    setMicPath(null)
    if (!producesText && (mode === 'tts')) setIncomingPath(null)  // clear audio input when switching to text-only input modes
  }, [mode])

  // Consume incoming file from cross-tool transfer (e.g. StemGrid → Pipeline)
  useEffect(() => {
    if (pending && pending.fromTool !== 'pipeline') {
      setIncomingPath(pending.path)
      setInputFile(null)
      setMicPath(null)
      // Switch to STT mode if coming from Splitter (stem files are audio)
      if (pending.fromTool === 'splitter') setMode('stt')
      setPending(null)
    }
  }, [pending, setPending])

  // Load models on mount + refresh when a rescan completes (from Settings)
  useEffect(() => {
    endpoints.models(settings.modelsPath || undefined)
      .then(r => setModels(Object.values(r.models).flat()))
      .catch(() => toast.error('Failed to load models — check Settings → Paths'))

    return ws.on('scan_complete', d => {
      const flat = Object.values(d.models as Record<string, Model[]>).flat()
      setModels(flat)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll Ollama status when in TTT mode
  useEffect(() => {
    if (mode !== 'ttt') return
    let cancelled = false

    const check = async (): Promise<void> => {
      try {
        const s = await endpoints.ollamaStatus()
        if (cancelled) return
        setOllamaRunning(s.running)
        if (s.running) {
          const m = await endpoints.ollamaModels()
          if (cancelled) return
          setOllamaModels(m.models)
          if (!ollamaModelId && m.models.length > 0) setOllamaModelId(m.models[0].id)
        }
      } catch { /* backend not ready yet */ }
    }

    check()
    const id = setInterval(check, 4000)
    return () => { cancelled = true; clearInterval(id) }
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStartOllama = async (): Promise<void> => {
    setOllamaStarting(true)
    try {
      await window.api.startOllama()
      // Give Ollama a moment to bind the port, then re-check
      await new Promise(r => setTimeout(r, 2500))
      const s = await endpoints.ollamaStatus()
      setOllamaRunning(s.running)
      if (s.running) {
        const m = await endpoints.ollamaModels()
        setOllamaModels(m.models)
        if (!ollamaModelId && m.models.length > 0) setOllamaModelId(m.models[0].id)
        toast.success('Ollama started')
      } else {
        toast.warning('Ollama may still be starting — wait a moment')
      }
    } catch (e) {
      toast.error(`Failed to start Ollama: ${(e as Error).message}`)
    } finally {
      setOllamaStarting(false)
    }
  }

  // Keep batchItemsRef in sync so WS handlers can read current batch without causing re-registration
  batchItemsRef.current = batchItems

  // WS job events (handles both single job and batch items via ref)
  useEffect(() => {
    const unsubs = [
      ws.on('job_progress', d => {
        if (d.job_id === jobId) {
          setProgress(d.progress); setEta(d.eta_seconds)
        } else {
          const bIdx = batchItemsRef.current.findIndex(b => b.job_id === d.job_id)
          if (bIdx !== -1) setBatchItems(prev => prev.map((b, i) => i === bIdx ? { ...b, progress: d.progress, status: 'running' } : b))
        }
      }),
      ws.on('job_complete', d => {
        if (d.job_id === jobId) {
          setProgress(100)
          const filename = d.result_path.split(/[\\/]/).pop() ?? d.result_path
          setOutputs(prev => [{ path: d.result_path, filename, createdAt: Date.now() }, ...prev])
          if (mode === 'tts' || mode === 'sts') {
            setLastAudio(`file:///${d.result_path}`)
          } else if (mode === 'stt' || mode === 'ttt') {
            window.api.readTextFile(d.result_path)
              .then(text => setLastText(text))
              .catch(() => {})
          }
          setJobId(null)
        } else {
          const bIdx = batchItemsRef.current.findIndex(b => b.job_id === d.job_id)
          if (bIdx !== -1) {
            setBatchItems(prev => prev.map((b, i) => i === bIdx ? { ...b, progress: 100, status: 'done' } : b))
            const filename = d.result_path.split(/[\\/]/).pop() ?? d.result_path
            setOutputs(prev => [{ path: d.result_path, filename, createdAt: Date.now() }, ...prev].slice(0, 50))
          }
        }
      }),
      ws.on('job_error', d => {
        if (d.job_id === jobId) {
          setJobId(null); setProgress(0)
          toast.error(`Job failed: ${d.error}`)
        } else {
          const bIdx = batchItemsRef.current.findIndex(b => b.job_id === d.job_id)
          if (bIdx !== -1) setBatchItems(prev => prev.map((b, i) => i === bIdx ? { ...b, status: 'error' } : b))
        }
      }),
      ws.on('job_cancelled', d => {
        if (d.job_id === jobId) {
          setJobId(null); setProgress(0)
          toast.warning('Job cancelled')
        }
      }),
    ]
    return () => unsubs.forEach(u => u())
  }, [jobId, mode])

  // Voice preview WS events (separate from main job — no output history update)
  useEffect(() => {
    if (!previewJobId) return
    const unsubs = [
      ws.on('job_complete', d => {
        if (d.job_id !== previewJobId) return
        setPreviewJobId(null)
        setPreviewLoadingVoice(null)
        const el = previewAudioRef.current
        if (el) {
          el.src = `file:///${d.result_path.replace(/\\/g, '/')}`
          void el.play()
        }
      }),
      ws.on('job_error', d => {
        if (d.job_id !== previewJobId) return
        setPreviewJobId(null)
        setPreviewLoadingVoice(null)
      }),
      ws.on('job_cancelled', d => {
        if (d.job_id !== previewJobId) return
        setPreviewJobId(null)
        setPreviewLoadingVoice(null)
      }),
    ]
    return () => unsubs.forEach(u => u())
  }, [previewJobId])

  const handlePreview = useCallback(async (voiceId: string) => {
    // Cancel previous preview if still running
    if (previewJobId) {
      try { await endpoints.pipelineCancel(previewJobId) } catch { /* already done */ }
    }
    setPreviewLoadingVoice(voiceId)
    try {
      const res = await endpoints.pipelineRun({
        mode:        'tts',
        input_text:  'Hello, this is a preview of my voice.',
        voice_id:    voiceId,
        speed:       1.0,
        format:      'wav',
        output_path: settings.outputPath,
      })
      setPreviewJobId(res.job_id)
    } catch (e) {
      setPreviewLoadingVoice(null)
      toast.error(`Preview failed: ${(e as Error).message}`)
    }
  }, [previewJobId, settings.outputPath, toast])

  // Persist output history
  useEffect(() => { saveOutputsToStorage(outputs) }, [outputs])

  // Persist user preferences (mode, voice, speed, language)
  useEffect(() => {
    savePrefs({ mode, ttsVoice, ttsSpeed, whisperLang })
  }, [mode, ttsVoice, ttsSpeed, whisperLang])

  // Effective audio input path: mic > dropped file > cross-tool transfer
  const effectiveAudioPath = micPath ?? inputFile?.path ?? incomingPath ?? null

  const batchActive = batchItems.some(b => b.status === 'queued' || b.status === 'running')

  const canRun = !jobId && !batchActive && (
    (mode === 'stt' && effectiveAudioPath !== null) ||
    (mode === 'tts' && inputText.trim().length > 0) ||
    (mode === 'sts' && effectiveAudioPath !== null) ||
    (mode === 'ttt' && inputText.trim().length > 0 && ollamaRunning && !!ollamaModelId)
  )

  const cancel = useCallback(async () => {
    if (!jobId) return
    try { await endpoints.pipelineCancel(jobId) } catch { /* already done */ }
  }, [jobId])

  // Batch STT: queue multiple files
  const runBatch = useCallback(async (files: File[]) => {
    const items: BatchItem[] = []
    for (const f of files) {
      try {
        const res = await endpoints.pipelineRun({
          mode:        'stt',
          input_file:  f.path,
          model_id:    modelId,
          language:    whisperLang || undefined,
          format,
          output_path: settings.outputPath,
        })
        items.push({ job_id: res.job_id, filename: f.name, progress: 0, status: 'queued' })
      } catch (e) {
        toast.error(`Failed to queue ${f.name}: ${(e as Error).message}`)
      }
    }
    setBatchItems(items)
  }, [modelId, whisperLang, format, settings.outputPath, toast])

  // Preset persistence
  useEffect(() => { savePresetsToStorage(presets) }, [presets])

  const applyPreset = useCallback((p: PipelinePreset) => {
    setMode(p.mode)
    if (p.modelId) setModelId(p.modelId)
    setTtsVoice(p.ttsVoice)
    setTtsSpeed(p.ttsSpeed)
    setWhisperLang(p.whisperLang)
    setFormat(p.format)
    setInputFile(null); setInputText(''); setMicPath(null)
  }, [])

  const savePreset = useCallback((name: string) => {
    const preset: PipelinePreset = {
      id: `custom_${Date.now()}`,
      name,
      mode,
      modelId,
      ttsVoice,
      ttsSpeed,
      whisperLang,
      format,
    }
    setPresets(prev => [...prev, preset])
  }, [mode, modelId, ttsVoice, ttsSpeed, whisperLang, format])

  const deletePreset = useCallback((id: string) => {
    setPresets(prev => prev.filter(p => p.id !== id))
  }, [])

  const closeProfileSheet = useCallback(() => setProfileSheetOpen(false), [])

  const createProfile = useCallback(async (name: string, file: File) => {
    const refPath = (file as File & { path: string }).path
    if (!refPath) { toast.error('Could not get file path'); return }
    try {
      await endpoints.pipelineProfiles({ reference_path: refPath, profile_name: name })
      toast.success(`Profile "${name}" queued — check GPU bar for progress`)
    } catch (e) {
      toast.error(`Profile creation failed: ${(e as Error).message}`)
    }
  }, [toast])

  const run = useCallback(async () => {
    const payload = {
      mode,
      model_id: mode === 'ttt' ? ollamaModelId : modelId,
      // TTS + STS both synthesise with Kokoro — send ttsVoice + speed
      voice_id: (mode === 'tts' || mode === 'sts') ? ttsVoice : undefined,
      speed:    (mode === 'tts' || mode === 'sts') ? ttsSpeed : undefined,
      // STT + STS transcribe with Whisper — send language if forced
      language: (mode === 'stt' || mode === 'sts') ? (whisperLang || undefined) : undefined,
      input_file:    effectiveAudioPath ?? undefined,
      input_text:    inputText,
      system_prompt: mode === 'ttt' ? (systemPrompt || undefined) : undefined,
      output_path:   settings.outputPath,
      format,
    }
    try {
      const r = await endpoints.pipelineRun(payload)
      setJobId(r.job_id)
      setProgress(0)
    } catch (e) {
      toast.error(`Run failed: ${(e as Error).message}`)
    }
  }, [mode, modelId, ollamaModelId, ttsVoice, ttsSpeed, whisperLang, effectiveAudioPath, inputText, systemPrompt, settings.outputPath, format])

  // Drag a .txt file onto the textarea → read and fill inputText
  const onTextFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return
    const ok = file.name.endsWith('.txt') || file.type === 'text/plain'
    if (!ok) return
    const reader = new FileReader()
    reader.onload = ev => setInputText((ev.target?.result as string) ?? '')
    reader.readAsText(file, 'utf-8')
  }, [])

  const needsAudioInput   = mode === 'stt' || mode === 'sts'
  const needsTextInput    = mode === 'tts' || mode === 'ttt'
  const needsWhisperModel = mode === 'stt' || mode === 'sts'   // STS also transcribes
  const needsKokoroVoice  = mode === 'tts' || mode === 'sts'   // both synthesise with Kokoro
  const needsSpeedControl = mode === 'tts' || mode === 'sts'   // Kokoro speed param
  const needsLangSelect   = mode === 'stt' || mode === 'sts'   // Whisper language
  const needsOllama       = mode === 'ttt'
  const isRunning = jobId !== null || batchActive

  const disabledReason: string = canRun ? '' :
    isRunning                          ? 'Job running — cancel first'     :
    mode === 'ttt' && !ollamaRunning   ? 'Start Ollama first'             :
    mode === 'ttt' && !ollamaModelId   ? 'Select an Ollama model'         :
    (mode === 'stt' || mode === 'sts') ? 'Drop or record an audio file'   :
    mode === 'tts'                     ? 'Enter text to synthesize'       :
    mode === 'ttt'                     ? 'Enter text to process'          :
    ''

  // Keep refs current so the keydown effect never needs re-registration
  runRef.current    = run
  cancelRef.current = cancel

  // Keyboard shortcuts: Ctrl+Enter → run, Escape → cancel
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
      <PipelineBg />

      <div className={styles.toolbar}>
        <span className={styles.toolbarTitle}>Pipeline</span>
        <ModeSelector value={mode} onChange={m => { setMode(m); setInputFile(null); setInputText(''); setMicPath(null) }} />
        <PresetDropdown
          presets={presets}
          onApply={applyPreset}
          onSave={savePreset}
          onDelete={deletePreset}
        />
      </div>

      <div className={styles.body}>
        {/* Input zone */}
        {needsAudioInput && (
          <>
            <FileDropZone
              accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a"
              multiple={mode === 'stt'}
              file={inputFile}
              onFile={f => { setInputFile(f); setMicPath(null); setIncomingPath(null) }}
              onFiles={files => {
                if (files.length === 1) {
                  setInputFile(files[0]); setMicPath(null); setIncomingPath(null)
                } else {
                  void runBatch(files)
                }
              }}
              onClear={() => { setInputFile(null); setMicPath(null); setIncomingPath(null) }}
              showClear={!!incomingPath || !!micPath}
              title={
                micPath        ? `Mic recording ready — ${micPath.split(/[\\/]/).pop()}` :
                incomingPath   ? `← ${incomingPath.split(/[\\/]/).pop()}` :
                                 mode === 'stt' ? 'Drop audio files' : 'Drop audio file'
              }
              subtitle={
                micPath        ? 'Click × to clear and re-record' :
                incomingPath   ? 'From Splitter · click × to clear' :
                                 mode === 'stt' ? 'wav · mp3 · flac · ogg · m4a · multiple OK' : 'wav · mp3 · flac · ogg · m4a'
              }
            />
            {/* Batch progress list */}
            {batchItems.length > 0 && (
              <div className={styles.batchList}>
                <div className={styles.batchHeader}>
                  <span className={styles.batchTitle}>Batch — {batchItems.filter(b => b.status === 'done').length}/{batchItems.length} done</span>
                  {!batchActive && (
                    <button className={styles.batchClearBtn} onClick={() => setBatchItems([])} aria-label="Clear batch">
                      Clear
                    </button>
                  )}
                </div>
                {batchItems.map(b => (
                  <div key={b.job_id} className={styles.batchItem}>
                    <span className={`${styles.batchDot} ${styles[`batchDot_${b.status}`]}`} aria-hidden="true" />
                    <span className={styles.batchFilename}>{b.filename}</span>
                    <div className={styles.batchBar}>
                      <div className={styles.batchFill} style={{ transform: `scaleX(${b.progress / 100})` }} />
                    </div>
                    <span className={styles.batchPct}>{b.status === 'error' ? '✕' : b.status === 'done' ? '✓' : `${Math.round(b.progress)}%`}</span>
                  </div>
                ))}
              </div>
            )}
            <MicButton
              onRecorded={path => { setMicPath(path); setInputFile(null) }}
              onError={err => toast.error(`Mic error: ${err.message}`)}
              disabled={isRunning}
            />
          </>
        )}

        {needsTextInput && (
          <div className={styles.textareaWrap}>
            <textarea
              className={styles.textarea}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onDragOver={e => e.preventDefault()}
              onDrop={onTextFileDrop}
              placeholder={mode === 'tts' ? 'Enter text to synthesize… (or drop a .txt file)' : 'Enter text to translate… (or drop a .txt file)'}
              aria-label="Text input"
            />
            {inputText.length > 0 && (
              <>
                <button
                  className={styles.textareaClearBtn}
                  onClick={() => setInputText('')}
                  aria-label="Clear text input"
                  title="Clear"
                  tabIndex={-1}
                >
                  ×
                </button>
                <span className={styles.charCount} aria-live="polite">
                  {inputText.length.toLocaleString()} chars
                </span>
              </>
            )}
          </div>
        )}

        {/* Ollama section — TTT mode */}
        {needsOllama && (
          <div className={styles.ollamaSection}>
            <div className={styles.ollamaStatusRow}>
              <span className={`${styles.ollamaDot} ${ollamaRunning ? styles.ollamaDotOn : ''}`} />
              <span className={styles.ollamaLabel}>
                Ollama · {ollamaRunning ? 'running' : 'offline'}
              </span>
              {!ollamaRunning && (
                <button
                  className={styles.ollamaStartBtn}
                  onClick={handleStartOllama}
                  disabled={ollamaStarting}
                >
                  {ollamaStarting ? 'Starting…' : 'Start'}
                </button>
              )}
            </div>

            {ollamaRunning && ollamaModels.length > 0 && (
              <div className={styles.row}>
                <span className={styles.fieldLabel}>Model</span>
                <div className={styles.voiceChips}>
                  {ollamaModels.map(m => (
                    <button
                      key={m.id}
                      className={`${styles.voiceChip}${ollamaModelId === m.id ? ` ${styles.voiceChipActive}` : ''}`}
                      onClick={() => setOllamaModelId(m.id)}
                      aria-pressed={ollamaModelId === m.id}
                      title={`${m.size_gb} GB`}
                    >
                      {m.name}
                      {m.size_gb > 0 && (
                        <span className={styles.voiceGroup}>{m.size_gb}G</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {ollamaRunning && ollamaModels.length === 0 && (
              <p className={styles.ollamaHint}>No models found. Run <code>ollama pull llama3.2:3b</code></p>
            )}

            {/* System prompt */}
            <div>
              <label className={styles.syspromptLabel} htmlFor="ttt-sysprompt">
                System prompt
                <span className={styles.syspromptHint}>(optional)</span>
              </label>
              <textarea
                id="ttt-sysprompt"
                className={styles.syspromptArea}
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                placeholder="You are a helpful assistant…"
                rows={2}
                aria-label="Ollama system prompt"
                spellCheck={false}
              />
            </div>
          </div>
        )}

        {/* Whisper model — STT + STS both transcribe */}
        {needsWhisperModel && (
          <div className={styles.row}>
            <span className={styles.fieldLabel}>Whisper</span>
            <ModelSelector
              models={models}
              tool="whisper"
              value={modelId}
              onChange={m => setModelId(m.id)}
              placeholder="Select Whisper model…"
            />
          </div>
        )}

        {/* Kokoro voice — TTS + STS both synthesise */}
        {needsKokoroVoice && (
          <div className={styles.voiceRow}>
            {/* Hidden audio element for voice preview playback */}
            <audio ref={previewAudioRef} style={{ display: 'none' }} aria-hidden="true" />
            <span className={styles.fieldLabel}>Voice</span>
            <div className={styles.voiceChips} role="group" aria-label="Kokoro voice">
              {(() => {
                let chipIdx = 0
                let prevGroup = ''
                const els: JSX.Element[] = []
                for (const v of KOKORO_VOICES) {
                  if (v.group !== prevGroup) {
                    prevGroup = v.group
                    els.push(
                      <div key={`hdr-${v.group}`} className={styles.voiceGroupHeader} title={GROUP_LABELS[v.group]}>
                        {v.group}
                      </div>
                    )
                  }
                  const delay = chipIdx * 25
                  els.push(
                    <div key={v.id} className={styles.voiceChipGroup} style={{ animationDelay: `${delay}ms` }}>
                      <button
                        className={`${styles.voiceChip}${ttsVoice === v.id ? ` ${styles.voiceChipActive}` : ''}`}
                        onClick={() => setTtsVoice(v.id)}
                        aria-pressed={ttsVoice === v.id}
                        title={v.id}
                      >
                        {v.label}
                      </button>
                      <button
                        className={`${styles.voicePreviewBtn}${previewLoadingVoice === v.id ? ` ${styles.voicePreviewBusy}` : ''}`}
                        onClick={(e) => { e.stopPropagation(); void handlePreview(v.id) }}
                        aria-label={`Preview ${v.label} voice`}
                        title="Preview voice"
                        disabled={previewLoadingVoice !== null && previewLoadingVoice !== v.id}
                      >
                        {previewLoadingVoice === v.id ? '…' : <Play size={9} strokeWidth={2} />}
                      </button>
                    </div>
                  )
                  chipIdx++
                }
                return els
              })()}
              <button
                className={styles.newProfileBtn}
                onClick={() => setProfileSheetOpen(true)}
                title="Create a new RVC voice profile from reference audio"
                aria-label="New voice profile"
              >
                + Profile
              </button>
            </div>
          </div>
        )}

        {/* Kokoro speed — TTS + STS */}
        {needsSpeedControl && (
          <div className={styles.speedWrap}>
            <ParameterSlider
              label="Speed"
              value={ttsSpeed}
              min={0.5}
              max={2.0}
              step={0.05}
              unit="×"
              onChange={setTtsSpeed}
            />
          </div>
        )}

        {/* Whisper language — STT + STS */}
        {needsLangSelect && (
          <div className={styles.row}>
            <span className={styles.fieldLabel}>Language</span>
            <LangSelect value={whisperLang} onChange={setWhisperLang} />
          </div>
        )}

        <div className={styles.sectionDivider} />

        <OutputConfig
          mode={mode}
          outputPath={settings.outputPath}
          format={format}
          onPathChange={v => setSetting('outputPath', v)}
          onFormatChange={setFormat}
        />

        {isRunning && (
          <div className={styles.progressWrap}>
            <ProgressBar value={progress} label="Processing…" eta={eta} animated />
          </div>
        )}

        <div className={styles.runRow}>
          {isRunning && (
            <button className={styles.cancelBtn} onClick={cancel} aria-label="Cancel job">
              Cancel
            </button>
          )}
          <motion.button
            className={styles.runBtn}
            onClick={run}
            disabled={!canRun}
            title={disabledReason || undefined}
            whileTap={canRun ? { scale: 0.94 } : undefined}
            transition={{ type: 'spring', stiffness: 380, damping: 22 }}
          >
            {isRunning ? 'Running…' : 'Run'}
          </motion.button>
        </div>

        {lastAudio && (
          <WaveformCard
            src={lastAudio}
            filename={lastAudio.split(/[\\/]/).pop()}
            mode={mode}
          />
        )}

        {lastText && (
          <TypewriterCard text={lastText} mode={mode} />
        )}

        <OutputFileList files={outputs} fromTool="pipeline" onClear={() => setOutputs([])} />
      </div>

      <ProfileCreationSheet
        open={profileSheetOpen}
        onClose={closeProfileSheet}
        onCreate={createProfile}
      />
    </div>
    </PageTransition>
  )
}
