import { useState, useMemo, useCallback } from 'react'
import { motion } from 'motion/react'
import { X, Trash2, Save } from 'lucide-react'
import type { Node, Edge } from '@xyflow/react'
import { useEscapeKey } from '@renderer/hooks/useEscapeKey'
import styles from './PresetBrowser.module.css'

const panelVariants = {
  hidden:  { opacity: 0, x: 16 },
  visible: { opacity: 1, x: 0 },
  exit:    { opacity: 0, x: 16 },
}
const panelSpring = { type: 'spring' as const, stiffness: 280, damping: 24 }

// ── Preset definition ────────────────────────────────────────────────────────

interface Preset {
  id:        string
  name:      string
  nodes:     Node[]
  edges:     Edge[]
  builtIn?:  true
}

const BUILT_IN_PRESETS: Preset[] = [
  {
    id: 'passthrough',
    name: 'Passthrough',
    builtIn: true,
    nodes: [
      { id: 'in',  type: 'nodeCard', position: { x: 60,  y: 140 }, data: { label: 'ASIO In',  nodeType: 'source', hasInput:  false } },
      { id: 'out', type: 'nodeCard', position: { x: 460, y: 140 }, data: { label: 'ASIO Out', nodeType: 'sink',   hasOutput: false } },
    ],
    edges: [{ id: 'e1', source: 'in', target: 'out', type: 'gradient' }],
  },
  {
    id: 'comp-eq',
    name: 'Comp → EQ',
    builtIn: true,
    nodes: [
      { id: 'in',   type: 'nodeCard', position: { x: 40,  y: 140 }, data: { label: 'ASIO In',    nodeType: 'source', hasInput: false } },
      { id: 'comp', type: 'nodeCard', position: { x: 220, y: 80  }, data: { label: 'Compressor', nodeType: 'effect', params: [
        { label: 'Threshold', value: -18, min: -60, max: 0,  unit: 'dB' },
        { label: 'Ratio',     value: 4,   min: 1,   max: 20, unit: ':1' },
      ]}},
      { id: 'eq',   type: 'nodeCard', position: { x: 400, y: 200 }, data: { label: 'Equalizer',  nodeType: 'effect', params: [
        { label: 'Low Shelf', value: 0, min: -12, max: 12, unit: 'dB' },
      ]}},
      { id: 'out',  type: 'nodeCard', position: { x: 580, y: 140 }, data: { label: 'ASIO Out',   nodeType: 'sink',   hasOutput: false } },
    ],
    edges: [
      { id: 'e1', source: 'in',   target: 'comp', type: 'gradient' },
      { id: 'e2', source: 'comp', target: 'eq',   type: 'gradient' },
      { id: 'e3', source: 'eq',   target: 'out',  type: 'gradient' },
    ],
  },
  {
    id: 'reverb-send',
    name: 'Reverb Send',
    builtIn: true,
    nodes: [
      { id: 'in',     type: 'nodeCard', position: { x: 40,  y: 180 }, data: { label: 'ASIO In', nodeType: 'source', hasInput: false } },
      { id: 'gain',   type: 'nodeCard', position: { x: 220, y: 100 }, data: { label: 'Gain',    nodeType: 'effect', params: [
        { label: 'dB', value: 0, min: -24, max: 24, unit: 'dB' },
      ]}},
      { id: 'reverb', type: 'nodeCard', position: { x: 220, y: 260 }, data: { label: 'Reverb',  nodeType: 'effect', params: [
        { label: 'Room Size', value: 0.6, min: 0, max: 1 },
        { label: 'Wet',       value: 0.4, min: 0, max: 1 },
      ]}},
      { id: 'out',    type: 'nodeCard', position: { x: 440, y: 180 }, data: { label: 'ASIO Out', nodeType: 'sink',  hasOutput: false } },
    ],
    edges: [
      { id: 'e1', source: 'in',     target: 'gain',   type: 'gradient' },
      { id: 'e2', source: 'in',     target: 'reverb', type: 'gradient' },
      { id: 'e3', source: 'gain',   target: 'out',    type: 'gradient' },
      { id: 'e4', source: 'reverb', target: 'out',    type: 'gradient' },
    ],
  },
]

// ── localStorage helpers ──────────────────────────────────────────────────────

const STORAGE_KEY = 'alphub_presets_v1'

function loadCustomPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Preset[]) : []
  } catch { return [] }
}

function saveCustomPresets(presets: Preset[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(presets)) } catch { /* quota */ }
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  onClose:       () => void
  onLoad:        (nodes: Node[], edges: Edge[]) => void
  currentNodes:  Node[]
  currentEdges:  Edge[]
}

export function PresetBrowser({ onClose, onLoad, currentNodes, currentEdges }: Props): JSX.Element {
  const [query,        setQuery]        = useState('')
  const [saveName,     setSaveName]     = useState('')
  const [customPresets, setCustom]      = useState<Preset[]>(loadCustomPresets)

  useEscapeKey(onClose)

  const allPresets = useMemo(() => [
    ...BUILT_IN_PRESETS,
    ...customPresets,
  ], [customPresets])

  const filtered = useMemo(() =>
    allPresets.filter(p => p.name.toLowerCase().includes(query.toLowerCase())),
    [allPresets, query]
  )

  const handleLoad = useCallback((p: Preset) => {
    onLoad(p.nodes, p.edges)
    onClose()
  }, [onLoad, onClose])

  const handleSave = useCallback(() => {
    const name = saveName.trim()
    if (!name) return
    const id = `custom-${Date.now()}`
    const preset: Preset = { id, name, nodes: currentNodes, edges: currentEdges }
    const updated = [...customPresets, preset]
    setCustom(updated)
    saveCustomPresets(updated)
    setSaveName('')
  }, [saveName, currentNodes, currentEdges, customPresets])

  const handleDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const updated = customPresets.filter(p => p.id !== id)
    setCustom(updated)
    saveCustomPresets(updated)
  }, [customPresets])

  return (
    <motion.div
      className={styles.panel}
      role="dialog"
      aria-label="Preset browser"
      aria-modal="false"
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={panelSpring}
    >
      <div className={styles.header}>
        <span className={styles.title}>Presets</span>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close presets">
          <X size={12} />
        </button>
      </div>

      <div className={styles.search}>
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search presets…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label="Search presets"
        />
      </div>

      <div className={styles.list} role="list">
        {filtered.length === 0 ? (
          <div className={styles.empty}>No presets match "{query}"</div>
        ) : (
          filtered.map(p => (
            <div key={p.id} className={styles.presetRow} role="listitem">
              <button
                className={styles.preset}
                onClick={() => handleLoad(p)}
                title={`Load "${p.name}"`}
              >
                <span
                  className={styles.presetDot}
                  style={p.builtIn ? undefined : { background: 'var(--secondary)' }}
                  aria-hidden="true"
                />
                <span className={styles.presetName}>{p.name}</span>
                <span className={styles.presetNodes}>{p.nodes.length}n</span>
              </button>
              {!p.builtIn && (
                <button
                  className={styles.deleteBtn}
                  onClick={e => handleDelete(p.id, e)}
                  aria-label={`Delete preset "${p.name}"`}
                  title="Delete"
                >
                  <Trash2 size={10} />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Save current graph as new preset */}
      <div className={styles.saveRow}>
        <input
          className={styles.saveInput}
          type="text"
          placeholder="Preset name…"
          value={saveName}
          onChange={e => setSaveName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          maxLength={40}
          aria-label="New preset name"
        />
        <button
          className={styles.saveBtn}
          onClick={handleSave}
          disabled={!saveName.trim()}
          aria-label="Save current graph as preset"
          title="Save current graph"
        >
          <Save size={12} />
        </button>
      </div>
    </motion.div>
  )
}
