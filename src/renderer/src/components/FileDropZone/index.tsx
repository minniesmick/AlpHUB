import { useRef, useState, useCallback } from 'react'
import { Upload, X, FileAudio } from 'lucide-react'
import styles from './FileDropZone.module.css'

interface Props {
  accept?: string          // e.g. 'audio/*,.wav,.mp3'
  onFile?: (file: File) => void
  onFiles?: (files: File[]) => void  // multiple-mode callback
  multiple?: boolean                 // allow multi-file drop + picker
  file?: File | null
  onClear?: () => void
  showClear?: boolean      // force × button even when file is null (external state)
  title?: string
  subtitle?: string
  className?: string
}

function classNames(...cls: (string | false | undefined)[]) {
  return cls.filter(Boolean).join(' ')
}

export function FileDropZone({ accept, onFile, onFiles, multiple, file, onClear, showClear, title = 'Drop audio file', subtitle = 'or click to browse', className }: Props) {
  const inputRef  = useRef<HTMLInputElement>(null)
  const [over,  setOver]  = useState(false)
  const [wrong, setWrong] = useState(false)

  const validate = useCallback((f: File): boolean => {
    if (!accept) return true
    const exts = accept.split(',').map(s => s.trim())
    return exts.some(ext => {
      if (ext.startsWith('.'))   return f.name.toLowerCase().endsWith(ext.toLowerCase())
      if (ext.endsWith('/*'))    return f.type.startsWith(ext.replace('/*', '/'))
      return f.type === ext
    })
  }, [accept])

  const handleFiles = useCallback((rawFiles: FileList | File[]) => {
    const all = Array.from(rawFiles)
    if (multiple && onFiles) {
      const valid = all.filter(validate)
      if (valid.length === 0) { setWrong(true); setTimeout(() => setWrong(false), 400); return }
      onFiles(valid)
    } else {
      const f = all[0]
      if (!f) return
      if (!validate(f)) { setWrong(true); setTimeout(() => setWrong(false), 400); return }
      onFile?.(f)
    }
  }, [accept, onFile, onFiles, multiple, validate])

  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setOver(true) }
  const onDragLeave = ()                       => setOver(false)
  const onDrop      = (e: React.DragEvent) => {
    e.preventDefault()
    setOver(false)
    handleFiles(e.dataTransfer.files)
  }
  const onClick = () => inputRef.current?.click()

  return (
    <div
      className={classNames(
        styles.zone,
        over  && styles.over,
        wrong && styles.wrong,
        !!file && styles['has-file'],
        className,
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClick()}
      role="button"
      tabIndex={0}
      aria-label={file ? `File: ${file.name}. Click to replace.` : title}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className={styles.hiddenInput}
        onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }}
      />

      {file ? (
        <>
          <FileAudio className={styles.icon} size={24} />
          <span className={styles.file}>{file.name}</span>
          {onClear && (
            <button
              className={styles.clearBtn}
              onClick={e => { e.stopPropagation(); onClear() }}
              aria-label="Remove file"
            >
              <X size={12} />
            </button>
          )}
        </>
      ) : (
        <>
          <Upload className={styles.icon} size={24} />
          <span className={styles.title}>{title}</span>
          <span className={styles.subtitle}>{subtitle}</span>
          {showClear && onClear && (
            <button
              className={styles.clearBtn}
              onClick={e => { e.stopPropagation(); onClear() }}
              aria-label="Clear"
            >
              <X size={12} />
            </button>
          )}
        </>
      )}
    </div>
  )
}
