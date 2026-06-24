import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { X } from 'lucide-react'
import { endpoints } from '@renderer/lib/api'
import type { DevicesResult } from '@renderer/lib/api'
import { useEscapeKey } from '@renderer/hooks/useEscapeKey'
import { DeviceSelect } from '@renderer/components/DeviceSelect'
import { PANEL_SPRING } from '@renderer/lib/motion'
import styles from './DeviceManager.module.css'

const panelVariants = {
  hidden: { opacity: 0, scale: 0.95, y: -14 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit:   { opacity: 0, scale: 0.95, y: -10 },
}
const panelSpring = PANEL_SPRING

const SAMPLE_RATES = ['44100', '48000', '88200', '96000']
const BUFFER_SIZES = ['64', '128', '256', '512', '1024']

interface Props {
  onClose: () => void
  onApply: (config: { inputIdx: number; outputIdx: number; sampleRate: number; bufferSize: number }) => void
}

export function DeviceManager({ onClose, onApply }: Props): JSX.Element {
  const [devices, setDevices]     = useState<DevicesResult>({ input: [], output: [] })
  const [inputIdx, setInputIdx]   = useState(-1)
  const [outputIdx, setOutputIdx] = useState(-1)
  const [sr, setSr]               = useState('44100')
  const [buf, setBuf]             = useState('256')
  const [testing, setTesting]     = useState(false)

  useEscapeKey(onClose)

  useEffect(() => {
    endpoints.dawDevices().then(setDevices).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleTest = async () => {
    setTesting(true)
    // TODO: hit /api/daw/test when backend supports it
    await new Promise(r => setTimeout(r, 1200))
    setTesting(false)
  }

  return (
    <motion.div
      className={styles.panel}
      role="dialog"
      aria-label="Device manager"
      aria-modal="false"
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={panelSpring}
    >
      <div className={styles.header}>
        <span className={styles.title}>ASIO Device</span>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close device manager">
          <X size={12} />
        </button>
      </div>

      <div className={styles.body}>
        {/* Input device */}
        <div className={styles.row}>
          <span className={styles.rowLabel}>Input</span>
          <DeviceSelect
            options={devices.input}
            value={inputIdx}
            onChange={setInputIdx}
            ariaLabel="ASIO input"
          />
        </div>

        {/* Output device */}
        <div className={styles.row}>
          <span className={styles.rowLabel}>Output</span>
          <DeviceSelect
            options={devices.output}
            value={outputIdx}
            onChange={setOutputIdx}
            ariaLabel="ASIO output"
          />
        </div>

        <div className={styles.divider} />

        {/* Sample rate */}
        <div className={styles.row}>
          <span className={styles.rowLabel}>SR</span>
          <div className={styles.chips} role="group" aria-label="Sample rate">
            {SAMPLE_RATES.map(r => (
              <button
                key={r}
                className={`${styles.chip}${sr === r ? ` ${styles.active}` : ''}`}
                onClick={() => setSr(r)}
                aria-pressed={sr === r}
              >
                {Number(r) / 1000}k
              </button>
            ))}
          </div>
        </div>

        {/* Buffer size */}
        <div className={styles.row}>
          <span className={styles.rowLabel}>Buf</span>
          <div className={styles.chips} role="group" aria-label="Buffer size">
            {BUFFER_SIZES.map(b => (
              <button
                key={b}
                className={`${styles.chip}${buf === b ? ` ${styles.active}` : ''}`}
                onClick={() => setBuf(b)}
                aria-pressed={buf === b}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.footer}>
          <button className={styles.testBtn} onClick={handleTest} disabled={testing}>
            {testing ? 'Testing…' : 'Test'}
          </button>
          <button
            className={styles.applyBtn}
            onClick={() => { onApply({ inputIdx, outputIdx, sampleRate: Number(sr), bufferSize: Number(buf) }); onClose() }}
          >
            Apply
          </button>
        </div>
      </div>
    </motion.div>
  )
}
