import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import type { Node } from '@xyflow/react'
import { SpectrumCanvas } from '@renderer/components/SpectrumCanvas'
import { ParameterKnob } from '@renderer/components/ParameterKnob'
import { ws } from '@renderer/lib/ws'
import { endpoints } from '@renderer/lib/api'
import type { NodeCardData } from '../../nodes/NodeCard'
import { useEscapeKey } from '@renderer/hooks/useEscapeKey'
import styles from './NodeInspector.module.css'

interface Props {
  node:          Node | null
  onClose:       () => void
  onParamChange: (nodeId: string, label: string, value: number | string) => void
}

export function NodeInspector({ node, onClose, onParamChange }: Props): JSX.Element | null {
  const [fftData,     setFftData]     = useState<number[] | undefined>(undefined)
  const [paramValues, setParamValues] = useState<Record<string, number>>({})
  const [textValues,  setTextValues]  = useState<Record<string, string>>({})

  useEscapeKey(onClose)

  useEffect(() => {
    if (!node) return
    return ws.on('spectrum_data', d => {
      // accept node-specific or the global stream output ('asio-out')
      if (d.node_id === node.id || d.node_id === 'asio-out') {
        setFftData(d.fft)
      }
    })
  }, [node?.id])

  useEffect(() => { if (!node) setFftData(undefined) }, [node])

  if (!node) return null

  const data   = node.data as NodeCardData
  const params = data.params ?? []

  return (
    <div className={styles.panel} role="region" aria-label={`Node inspector: ${data.label}`}>
      <div className={styles.header}>
        <span className={styles.nodeType}>{data.nodeType ?? 'effect'}</span>
        <span className={styles.nodeName}>{data.label}</span>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close inspector">
          <X size={12} />
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.spectrum}>
          <SpectrumCanvas data={fftData} frozen={!fftData} />
        </div>

        <div className={styles.params}>
          {params.length === 0 ? (
            <span className={styles.emptyParams}>No parameters</span>
          ) : (
            params.map((p, i) => {
              const key = `${node.id}-${p.label}`

              if (p.type === 'text') {
                const currentText = textValues[key] ?? (typeof p.value === 'string' ? p.value : '')
                return (
                  <div key={i} className={styles.textParam}>
                    <label className={styles.textParamLabel} htmlFor={key}>{p.label}</label>
                    <input
                      id={key}
                      className={styles.textParamInput}
                      type="text"
                      value={currentText}
                      spellCheck={false}
                      placeholder="Path…"
                      onChange={e => {
                        setTextValues(prev => ({ ...prev, [key]: e.target.value }))
                        onParamChange(node.id, p.label, e.target.value)
                      }}
                      aria-label={p.label}
                    />
                  </div>
                )
              }

              const initial = typeof p.value === 'number' ? p.value : 0
              const current = paramValues[key] ?? initial
              const lo      = p.min ?? 0
              const hi      = p.max ?? 1
              return (
                <ParameterKnob
                  key={i}
                  label={p.label}
                  value={current}
                  min={lo}
                  max={hi}
                  unit={p.unit}
                  onChange={v => {
                    setParamValues(prev => ({ ...prev, [key]: v }))
                    onParamChange(node.id, p.label, v)      // keep node data in sync
                    endpoints.dawParam(node.id, p.label, v).catch(() => {})
                  }}
                />
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
