/**
 * MicButton — toggleable microphone recording control for Pipeline STT / STS modes.
 *
 * - Idle:      Mic icon, dashed border, secondary color
 * - Recording: pulsing hot-pink glow, live duration counter
 * - Stop:      saves to temp file via IPC → calls onRecorded(path)
 */

import { useCallback } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { useMicRecorder } from '@renderer/hooks/useMicRecorder'
import styles from './MicButton.module.css'

interface Props {
  onRecorded: (tempPath: string) => void
  onError?:   (err: Error) => void
  disabled?:  boolean
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function MicButton({ onRecorded, onError, disabled }: Props): JSX.Element {
  const { recording, duration, start, stop, cancel } = useMicRecorder()

  const handleClick = useCallback(async () => {
    if (disabled) return

    if (recording) {
      // Stop and save
      const path = await stop()
      if (path) onRecorded(path)
    } else {
      // Start recording
      try {
        await start()
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)))
      }
    }
  }, [disabled, recording, start, stop, onRecorded, onError])

  return (
    <div className={`${styles.wrap}${recording ? ` ${styles.wrapRecording}` : ''}`}>
      <button
        className={`${styles.btn}${recording ? ` ${styles.btnRecording}` : ''}`}
        onClick={handleClick}
        disabled={disabled && !recording}
        aria-label={recording ? `Stop recording (${fmtDuration(duration)})` : 'Record from microphone'}
        title={recording ? 'Click to stop' : 'Record from mic'}
      >
        {recording ? <MicOff size={16} strokeWidth={1.5} /> : <Mic size={16} strokeWidth={1.5} />}
      </button>

      {recording && (
        <span className={styles.duration} aria-live="polite">
          {fmtDuration(duration)}
        </span>
      )}

      {recording && (
        <button
          className={styles.cancelBtn}
          onClick={cancel}
          aria-label="Cancel recording"
          title="Cancel"
        >
          ✕
        </button>
      )}
    </div>
  )
}
