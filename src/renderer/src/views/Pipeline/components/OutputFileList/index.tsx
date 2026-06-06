import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useFileTransfer } from '@renderer/context/FileTransfer'
import styles from './OutputFileList.module.css'

interface OutputFile {
  path:      string
  filename:  string
  createdAt?: number   // Unix ms — undefined for pre-timestamp entries
}

function relTime(ts: number): string {
  const d = Date.now() - ts
  if (d < 60_000)         return 'just now'
  if (d < 3_600_000)      return `${Math.floor(d / 60_000)}m ago`
  if (d < 86_400_000)     return `${Math.floor(d / 3_600_000)}h ago`
  return `${Math.floor(d / 86_400_000)}d ago`
}

const TEXT_EXTS = new Set(['.txt', '.srt', '.json'])

function isTextFile(filename: string): boolean {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
  return TEXT_EXTS.has(ext)
}

interface Props {
  files:    OutputFile[]
  fromTool: string    // 'pipeline' | 'splitter'
  onClear?: () => void
}

const TARGETS: { label: string; route: string }[] = [
  { label: 'Signal Flow', route: '/daw' },
  { label: 'Splitter',    route: '/splitter' },
]

export function OutputFileList({ files, fromTool, onClear }: Props): JSX.Element | null {
  const navigate             = useNavigate()
  const { setPending }       = useFileTransfer()
  const [confirmed, setConfirmed] = useState<string | null>(null)
  const [copied, setCopied]       = useState<string | null>(null)
  const [expanded, setExpanded]   = useState<Set<string>>(new Set())
  const [previews, setPreviews]   = useState<Record<string, string>>({})
  const [loadingP, setLoadingP]   = useState<Set<string>>(new Set())

  const flash = useCallback((key: string, setter: (v: string | null) => void) => {
    setter(key)
    setTimeout(() => setter(null), 1200)
  }, [])

  const togglePreview = useCallback(async (file: OutputFile) => {
    const p = file.path
    if (expanded.has(p)) {
      setExpanded(prev => { const s = new Set(prev); s.delete(p); return s })
      return
    }
    setExpanded(prev => new Set(prev).add(p))
    if (previews[p] !== undefined || loadingP.has(p)) return
    setLoadingP(prev => new Set(prev).add(p))
    try {
      const text = await window.api.readTextFile(p)
      setPreviews(prev => ({ ...prev, [p]: text }))
    } catch {
      setPreviews(prev => ({ ...prev, [p]: '(could not load file)' }))
    } finally {
      setLoadingP(prev => { const s = new Set(prev); s.delete(p); return s })
    }
  }, [expanded, previews, loadingP])

  if (files.length === 0) return null

  const handleSend = (file: OutputFile, route: string) => {
    setPending({ path: file.path, filename: file.filename, fromTool })
    navigate(route)
    flash(file.path, setConfirmed)
  }

  const handleCopy = async (file: OutputFile) => {
    try {
      const text = await window.api.readTextFile(file.path)
      await navigator.clipboard.writeText(text)
      flash(file.path, setCopied)
    } catch {
      // silently ignore — user can open file manually
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.title}>Output files</span>
        {onClear && (
          <button className={styles.clearBtn} onClick={onClear} aria-label="Clear output history">
            Clear
          </button>
        )}
      </div>
      <div className={styles.list}>
        {files.map(f => {
          const isText  = isTextFile(f.filename)
          const isOpen  = expanded.has(f.path)
          return (
            <div key={f.path} className={styles.itemWrap}>
              <div className={styles.item}>
                <span className={styles.filename}>{f.filename}</span>
                {f.createdAt && (
                  <span className={styles.fileTime}>{relTime(f.createdAt)}</span>
                )}
                <button
                  className={styles.folderBtn}
                  onClick={() => window.api.showItemInFolder(f.path)}
                  aria-label={`Show ${f.filename} in Explorer`}
                  title="Show in Explorer"
                >
                  ↗
                </button>
                {/* Text preview toggle */}
                {isText && (
                  <button
                    className={`${styles.expandBtn}${isOpen ? ` ${styles.expandBtnActive}` : ''}`}
                    onClick={() => void togglePreview(f)}
                    aria-label={isOpen ? `Hide preview of ${f.filename}` : `Preview ${f.filename}`}
                    title={isOpen ? 'Hide preview' : 'Preview'}
                  >
                    {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                )}
                {/* Clipboard copy — text files only */}
                {isText && (
                  copied === f.path ? (
                    <span className={styles.confirmed}>Copied ✓</span>
                  ) : (
                    <button
                      className={styles.copyBtn}
                      onClick={() => void handleCopy(f)}
                      aria-label={`Copy ${f.filename} to clipboard`}
                      title="Copy to clipboard"
                    >
                      ⎘
                    </button>
                  )
                )}
                {confirmed === f.path ? (
                  <span className={styles.confirmed}>Sent ✓</span>
                ) : (
                  /* Audio files: offer Signal Flow + Splitter. Text files: no send targets */
                  !isText && TARGETS
                    .filter(t => t.route !== `/${fromTool}`)
                    .map(t => (
                      <button
                        key={t.route}
                        className={styles.sendBtn}
                        onClick={() => handleSend(f, t.route)}
                        aria-label={`Send ${f.filename} to ${t.label}`}
                      >
                        → {t.label}
                      </button>
                    ))
                )}
              </div>
              {/* Inline text preview */}
              {isText && isOpen && (
                <div className={styles.preview}>
                  {loadingP.has(f.path) ? (
                    <span className={styles.previewLoading}>Loading…</span>
                  ) : (
                    <pre className={styles.previewText}>{previews[f.path]}</pre>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
