import styles from './OutputConfig.module.css'
import type { PipelineMode } from '../ModeSelector'

const AUDIO_FORMATS  = ['wav', 'flac', 'mp3', 'ogg']
const TEXT_FORMATS   = ['txt', 'json', 'srt']

interface Props {
  mode:       PipelineMode
  outputPath: string
  format:     string
  onPathChange:   (path: string) => void
  onFormatChange: (fmt: string)  => void
}

export function OutputConfig({ mode, outputPath, format, onPathChange, onFormatChange }: Props): JSX.Element {
  const formats = (mode === 'stt' || mode === 'ttt') ? TEXT_FORMATS : AUDIO_FORMATS

  return (
    <div className={styles.root}>
      <div className={styles.row}>
        <span className={styles.label}>Output</span>
        <input
          className={styles.pathInput}
          type="text"
          value={outputPath}
          onChange={e => onPathChange(e.target.value)}
          placeholder="C:\Users\…\output"
          spellCheck={false}
          aria-label="Output path"
        />
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Format</span>
        <div className={styles.chips} role="group" aria-label="Output format">
          {formats.map(f => (
            <button
              key={f}
              className={`${styles.chip}${format === f ? ` ${styles.active}` : ''}`}
              onClick={() => onFormatChange(f)}
              aria-pressed={format === f}
            >
              .{f}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
