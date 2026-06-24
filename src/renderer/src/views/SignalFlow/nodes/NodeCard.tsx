import { useReactFlow, Handle, Position, type NodeProps } from '@xyflow/react'
import { motion } from 'motion/react'
import { Power } from 'lucide-react'
import { CARD_SPRING } from '@renderer/lib/motion'
import styles from './NodeCard.module.css'

function staggerDelay(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xfffff
  return (h % 8) * 0.05
}

export interface NodeCardData extends Record<string, unknown> {
  label:     string
  nodeType?: 'source' | 'effect' | 'sink'
  params?:   { label: string; value: string | number; min?: number; max?: number; unit?: string; type?: 'text' }[]
  hasInput?:  boolean
  hasOutput?: boolean
  bypassed?:  boolean   // stored in node data → synced to backend graph
}

function classNames(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

export function NodeCard({ id, data, selected }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const d = data as NodeCardData
  const bypassed  = d.bypassed ?? false
  const nodeType  = d.nodeType ?? 'effect'
  const hasInput  = d.hasInput  ?? nodeType !== 'source'
  const hasOutput = d.hasOutput ?? nodeType !== 'sink'

  const toggleBypass = (e: React.MouseEvent) => {
    e.stopPropagation()
    updateNodeData(id, { bypassed: !bypassed })
  }

  const typeClass = nodeType === 'source' ? styles.typeSource
    : nodeType === 'sink'   ? styles.typeSink
    : styles.typeEffect

  return (
    <motion.div
      className={classNames(
        styles.card,
        typeClass,
        selected && styles.selected,
        bypassed && styles.bypassed,
      )}
      initial={{ opacity: 0, y: 12, scale: 0.94 }}
      animate={{ opacity: 1, y: 0,  scale: 1    }}
      transition={{ ...CARD_SPRING, delay: staggerDelay(id) }}
    >
      {hasInput && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ background: 'var(--border-strong)', border: '1.5px solid var(--surface-3)', width: 10, height: 10 }}
        />
      )}
      {hasOutput && (
        <Handle
          type="source"
          position={Position.Right}
          style={{ background: 'var(--primary)', border: '1.5px solid var(--surface-3)', width: 10, height: 10 }}
        />
      )}

      <div className={styles.header}>
        <span className={classNames(styles.typeTag, nodeType === 'sink' && styles.sink, nodeType === 'source' && styles.source)}>
          {nodeType}
        </span>
        <span className={styles.name}>{d.label}</span>
        {nodeType === 'effect' && (
          <button
            className={styles.bypassBtn}
            onClick={toggleBypass}
            title={bypassed ? 'Enable' : 'Bypass'}
            aria-label={bypassed ? 'Enable node' : 'Bypass node'}
            aria-pressed={bypassed}
          >
            <Power size={10} />
          </button>
        )}
      </div>

      {d.params && d.params.length > 0 && (
        <div className={styles.params}>
          {d.params.map((p, i) => (
            <div key={i} className={styles.paramRow}>
              <span className={styles.paramLabel}>{p.label}</span>
              <span className={styles.paramValue}>
                {typeof p.value === 'number'
                  ? `${parseFloat(p.value.toFixed(2))}${p.unit ?? ''}`
                  : p.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
