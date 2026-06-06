import styles from './ModeSelector.module.css'

export type PipelineMode = 'stt' | 'tts' | 'sts' | 'ttt'

const MODES: { id: PipelineMode; label: string; title: string }[] = [
  { id: 'stt', label: 'STT', title: 'Speech to Text' },
  { id: 'tts', label: 'TTS', title: 'Text to Speech' },
  { id: 'sts', label: 'STS', title: 'Speech to Speech' },
  { id: 'ttt', label: 'TTT', title: 'Text to Text (translate)' },
]

interface Props {
  value: PipelineMode
  onChange: (mode: PipelineMode) => void
}

export function ModeSelector({ value, onChange }: Props): JSX.Element {
  return (
    <div className={styles.root} role="tablist" aria-label="Pipeline mode">
      {MODES.map(m => (
        <button
          key={m.id}
          className={`${styles.tab}${value === m.id ? ` ${styles.active}` : ''}`}
          role="tab"
          aria-selected={value === m.id}
          title={m.title}
          onClick={() => onChange(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
