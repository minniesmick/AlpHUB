/**
 * useMicRecorder — MediaRecorder wrapper for browser-side mic capture.
 *
 * Records audio in webm/opus format (Chromium default).
 * On stop: concatenates chunks → ArrayBuffer → IPC `saveTempAudio` → returns OS temp path.
 * faster-whisper accepts webm via its internal ffmpeg decoder.
 */

import { useState, useRef, useCallback } from 'react'

interface MicRecorderState {
  recording:  boolean
  duration:   number   // seconds elapsed
  start:      () => Promise<void>
  stop:       () => Promise<string | null>   // resolves to temp file path
  cancel:     () => void
}

export function useMicRecorder(): MicRecorderState {
  const [recording, setRecording] = useState(false)
  const [duration,  setDuration]  = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef   = useRef<Blob[]>([])
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  const stopTracks = () => {
    recorderRef.current?.stream.getTracks().forEach(t => t.stop())
  }

  const start = useCallback(async () => {
    // Guard: already recording
    if (recorderRef.current) return

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    } catch (err) {
      console.error('[MicRecorder] getUserMedia failed:', err)
      throw err
    }

    const recorder = new MediaRecorder(stream, {
      // Prefer a widely-supported codec; Chromium fallback picks webm/opus automatically
      mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm',
    })

    chunksRef.current = []
    recorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.start(200)   // 200ms timeslice for smooth progress
    setRecording(true)
    setDuration(0)

    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
  }, [])

  const stop = useCallback((): Promise<string | null> => {
    const recorder = recorderRef.current
    if (!recorder) return Promise.resolve(null)

    return new Promise<string | null>(resolve => {
      recorder.onstop = async () => {
        clearTimer()
        try {
          const blob        = new Blob(chunksRef.current, { type: recorder.mimeType })
          const arrayBuffer = await blob.arrayBuffer()
          const path        = await window.api.saveTempAudio(arrayBuffer)
          stopTracks()
          recorderRef.current = null
          resolve(path)
        } catch (err) {
          console.error('[MicRecorder] save failed:', err)
          stopTracks()
          recorderRef.current = null
          resolve(null)
        }
      }

      recorder.stop()
      setRecording(false)
    })
  }, [])

  const cancel = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder) return
    clearTimer()
    recorder.onstop = null
    recorder.stop()
    stopTracks()
    recorderRef.current = null
    chunksRef.current = []
    setRecording(false)
    setDuration(0)
  }, [])

  return { recording, duration, start, stop, cancel }
}
