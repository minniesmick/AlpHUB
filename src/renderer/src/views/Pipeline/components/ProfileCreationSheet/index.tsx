import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { FileDropZone } from '@renderer/components/FileDropZone'
import { ProgressBar } from '@renderer/components/ProgressBar'
import styles from './ProfileCreationSheet.module.css'

interface Props {
  open:     boolean
  onClose:  () => void
  onCreate: (name: string, file: File) => Promise<void>
}

export function ProfileCreationSheet({ open, onClose, onCreate }: Props): JSX.Element | null {
  const [name, setName]       = useState('')
  const [file, setFile]       = useState<File | null>(null)
  const [progress, setProgress] = useState(0)
  const [busy, setBusy]       = useState(false)

  useEffect(() => {
    if (!open) { setName(''); setFile(null); setProgress(0); setBusy(false) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, busy, onClose])

  if (!open) return null

  const canExtract = name.trim().length > 0 && file !== null && !busy

  const handleExtract = async () => {
    if (!canExtract || !file) return
    setBusy(true)
    setProgress(0)
    // Simulate progress ticks while actual job runs
    const ticker = setInterval(() => setProgress(p => Math.min(p + 8, 90)), 500)
    await onCreate(name.trim(), file).catch(() => {})
    clearInterval(ticker)
    setProgress(100)
    setTimeout(onClose, 800)
  }

  return createPortal(
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <div className={styles.header}>
          <span id="profile-title" className={styles.title}>New Voice Profile</span>
          <button className={styles.closeBtn} onClick={onClose} disabled={busy} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        <div className={styles.body}>
          <input
            className={styles.nameInput}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Profile name…"
            disabled={busy}
            maxLength={64}
            aria-label="Profile name"
          />
          <FileDropZone
            accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a"
            file={file}
            onFile={setFile}
            onClear={() => setFile(null)}
            title="Drop reference audio"
            subtitle="10–60s clean speech · wav, mp3, flac"
          />
          {busy && <ProgressBar value={progress} label="Extracting voice embedding…" animated />}
        </div>

        <div className={styles.footer}>
          <button className={styles.extractBtn} onClick={handleExtract} disabled={!canExtract}>
            {busy ? 'Extracting…' : 'Extract Profile'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
