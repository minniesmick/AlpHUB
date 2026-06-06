import { useState, useEffect } from 'react'
import { Square, Mic } from 'lucide-react'
import { endpoints } from '@renderer/lib/api'
import type { DevicesResult } from '@renderer/lib/api'
import { ws } from '@renderer/lib/ws'
import { useToast } from '@renderer/context/Toast'
import { DeviceSelect } from '@renderer/components/DeviceSelect'
import styles from './TransportBar.module.css'

type StreamState = 'stopped' | 'starting' | 'running' | 'stopping'

export interface StreamConfig {
  inputIdx:   number
  outputIdx:  number
  sampleRate: number
  blocksize:  number
}

interface Props {
  config?:         StreamConfig
  onDeviceChange?: (inputIdx: number, outputIdx: number) => void
}

export function TransportBar({ config, onDeviceChange }: Props): JSX.Element {
  const toast = useToast()
  const [devices, setDevices]     = useState<DevicesResult>({ input: [], output: [] })
  const [inputIdx, setInputIdx]   = useState<number>(config?.inputIdx   ?? -1)
  const [outputIdx, setOutputIdx] = useState<number>(config?.outputIdx  ?? -1)
  const [sampleRate]              = useState<number>(config?.sampleRate ?? 44100)
  const [blocksize]               = useState<number>(config?.blocksize  ?? 256)
  const [stream, setStream]       = useState<StreamState>('stopped')

  // Sync when DeviceManager applies a new config
  useEffect(() => {
    if (config) {
      setInputIdx(config.inputIdx)
      setOutputIdx(config.outputIdx)
    }
  }, [config])

  useEffect(() => {
    endpoints.dawDevices().then(setDevices).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return ws.on('stream_status', d => {
      setStream(d.active ? 'running' : 'stopped')
    })
  }, [])

  const toggle = async () => {
    if (stream === 'running') {
      setStream('stopping')
      await endpoints.dawStop().catch((e: Error) => {
        toast.error(`Stop failed: ${e.message}`)
      })
      setStream('stopped')
    } else if (stream === 'stopped') {
      setStream('starting')
      await endpoints.dawStart({
        input_idx:   inputIdx,
        output_idx:  outputIdx,
        sample_rate: config?.sampleRate ?? sampleRate,
        blocksize:   config?.blocksize  ?? blocksize,
      }).catch((e: Error) => {
        setStream('stopped')
        toast.error(`Stream failed: ${e.message}`)
      })
    }
  }

  const isRunning = stream === 'running'
  const busy      = stream === 'starting' || stream === 'stopping'
  const srLabel   = `${((config?.sampleRate ?? sampleRate) / 1000).toFixed(1)} kHz`
  const bufLabel  = `${config?.blocksize ?? blocksize} smp`

  return (
    <div className={styles.bar}>
      {/* Device pickers */}
      <div className={styles.section}>
        <span className={styles.label}>In</span>
        <DeviceSelect
          options={devices.input}
          value={inputIdx}
          onChange={idx => { setInputIdx(idx); onDeviceChange?.(idx, outputIdx) }}
          ariaLabel="ASIO input device"
        />
      </div>

      <div className={styles.section}>
        <span className={styles.label}>Out</span>
        <DeviceSelect
          options={devices.output}
          value={outputIdx}
          onChange={idx => { setOutputIdx(idx); onDeviceChange?.(inputIdx, idx) }}
          ariaLabel="ASIO output device"
        />
      </div>

      <div className={styles.divider} />

      {/* Sample rate / buffer chips — reflect current config */}
      <div className={styles.section}>
        <span className={styles.chip}>{srLabel}</span>
        <span className={styles.chip}>{bufLabel}</span>
      </div>

      <div className={styles.divider} />

      {/* Stream status */}
      <div className={styles.section}>
        <span
          className={`${styles.statusDot}${isRunning || stream === 'starting' ? ` ${styles.active}` : ''}`}
          aria-label={`Stream ${stream}`}
        />
        <span className={styles.label}>{stream}</span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Monitor / Stop */}
      <button
        className={`${styles.playBtn} ${isRunning ? styles.running : styles.stopped}`}
        onClick={toggle}
        disabled={busy}
        aria-label={isRunning ? 'Stop stream' : 'Start stream'}
      >
        {isRunning ? <Square size={12} /> : <Mic size={12} />}
        {busy ? '…' : isRunning ? 'Stop' : 'Monitor'}
      </button>
    </div>
  )
}
