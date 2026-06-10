import { useCallback, useEffect, useRef, useState } from 'react'
import {
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
} from '@xyflow/react'
import { BookOpen, Cpu, RotateCcw } from 'lucide-react'
import { TransportBar, type StreamConfig } from './components/TransportBar'
import { FlowCanvas } from './components/FlowCanvas'
import { NodePalette } from './components/NodePalette'
import { NodeInspector } from './components/NodeInspector'
import { PresetBrowser } from './components/PresetBrowser'
import { DeviceManager } from './components/DeviceManager'
import type { PaletteItem } from './paletteNodes'
import { endpoints } from '@renderer/lib/api'
import { useFileTransfer } from '@renderer/context/FileTransfer'
import { useToast } from '@renderer/context/Toast'
import { AnimatePresence } from 'motion/react'
import styles from './SignalFlow.module.css'
import { PageTransition } from '@renderer/components/PageTransition'
import { SignalFlowBg } from './components/SignalFlowBg'

const GRAPH_KEY  = 'alphub_signalflow_graph_v1'
const CONFIG_KEY = 'alphub_stream_config_v1'

function loadStreamConfig(): StreamConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return raw
      ? { inputIdx: -1, outputIdx: -1, sampleRate: 44100, blocksize: 256, ...(JSON.parse(raw) as Partial<StreamConfig>) }
      : { inputIdx: -1, outputIdx: -1, sampleRate: 44100, blocksize: 256 }
  } catch {
    return { inputIdx: -1, outputIdx: -1, sampleRate: 44100, blocksize: 256 }
  }
}

const DEFAULT_NODES: Node[] = [
  { id: 'asio-in',  type: 'nodeCard', position: { x: 80,  y: 120 }, data: { label: 'ASIO In',  nodeType: 'source', hasInput: false } },
  { id: 'asio-out', type: 'nodeCard', position: { x: 420, y: 120 }, data: { label: 'ASIO Out', nodeType: 'sink',   hasOutput: false } },
]

const DEFAULT_EDGES: Edge[] = [
  { id: 'e-default', source: 'asio-in', target: 'asio-out', type: 'gradient' },
]

function loadGraph(): { nodes: Node[]; edges: Edge[] } {
  try {
    const raw = localStorage.getItem(GRAPH_KEY)
    if (!raw) return { nodes: DEFAULT_NODES, edges: DEFAULT_EDGES }
    return JSON.parse(raw) as { nodes: Node[]; edges: Edge[] }
  } catch {
    return { nodes: DEFAULT_NODES, edges: DEFAULT_EDGES }
  }
}

let nodeCounter = 0

export default function SignalFlowView(): JSX.Element {
  const { pending, setPending } = useFileTransfer()
  const toast                   = useToast()
  const { nodes: savedNodes, edges: savedEdges } = loadGraph()
  const [nodes, setNodes, onNodesChange] = useNodesState(savedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(savedEdges)
  const [selectedNode, setSelectedNode]   = useState<Node | null>(null)
  const [presetOpen, setPresetOpen]         = useState(false)
  const [deviceOpen, setDeviceOpen]         = useState(false)
  const [paletteCollapsed, setPaletteCollapsed] = useState(false)
  const [streamConfig, setStreamConfig]     = useState<StreamConfig>(loadStreamConfig)

  // Debounced graph sync to backend
  // Auto-stop stream when navigating away from Signal Flow
  useEffect(() => {
    return () => { endpoints.dawStop().catch(() => {}) }
  }, [])

  // Consume incoming file — auto-place Audio File source node
  useEffect(() => {
    if (!pending || pending.fromTool === 'daw') return
    const filename = pending.path.split(/[\\/]/).pop() ?? pending.filename
    const id       = `audio-file-${Date.now()}`
    const newNode: Node = {
      id,
      type: 'nodeCard',
      position: { x: 80, y: 260 },
      data: {
        label:    'Audio File',
        nodeType: 'source',
        hasInput: false,
        params:   [{ label: 'File', value: pending.path, type: 'text' as const }],
      },
    }
    setNodes(ns => [...ns, newNode])
    toast.success(`Audio File node added: ${filename}`)
    setPending(null)
  }, [pending]) // eslint-disable-line react-hooks/exhaustive-deps

  const graphSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncGraph = useCallback((ns: Node[], es: Edge[]) => {
    if (graphSyncTimer.current) clearTimeout(graphSyncTimer.current)
    graphSyncTimer.current = setTimeout(() => {
      endpoints.dawGraph({ nodes: ns, edges: es }).catch(() => {})
      try { localStorage.setItem(GRAPH_KEY, JSON.stringify({ nodes: ns, edges: es })) } catch { /* quota */ }
    }, 400)
  }, [])

  const onConnect = useCallback(
    (conn: Connection) => setEdges(eds => {
      const next = addEdge({ ...conn, type: 'gradient' }, eds)
      syncGraph(nodes, next)
      return next
    }),
    [setEdges, nodes, syncGraph]
  )

  const onSelectionChange = useCallback((sel: Node[]) => {
    setSelectedNode(sel.length === 1 ? sel[0] : null)
  }, [])

  const onDropNode = useCallback((item: PaletteItem, position: { x: number; y: number }) => {
    const id = `node-${++nodeCounter}`
    const newNode: Node = { id, type: 'nodeCard', position, data: { ...item.data } }
    onNodesChange([{ type: 'add', item: newNode }])
    syncGraph([...nodes, newNode], edges)
  }, [onNodesChange, nodes, edges, syncGraph])

  const loadPreset = useCallback((presetNodes: Node[], presetEdges: Edge[]) => {
    setNodes(presetNodes)
    setEdges(presetEdges)
    setSelectedNode(null)
    syncGraph(presetNodes, presetEdges)
  }, [setNodes, setEdges, syncGraph])

  // Keep node data in sync when inspector knobs change
  const onParamChange = useCallback((nodeId: string, label: string, value: number | string) => {
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n
      const params = (n.data.params as { label: string; value: number | string; min?: number; max?: number; unit?: string; type?: 'text' }[] | undefined) ?? []
      return {
        ...n,
        data: {
          ...n.data,
          params: params.map(p => p.label === label ? { ...p, value } : p),
        },
      }
    }))
  }, [setNodes])

  // Stable panel close / apply callbacks — prevent useEscapeKey re-registration on every render
  const closePreset    = useCallback(() => setPresetOpen(false), [])
  const closeDevice    = useCallback(() => setDeviceOpen(false), [])
  const closeInspector = useCallback(() => setSelectedNode(null), [])
  const applyDevice    = useCallback((cfg: { inputIdx: number; outputIdx: number; sampleRate: number; bufferSize: number }) => {
    setStreamConfig({ inputIdx: cfg.inputIdx, outputIdx: cfg.outputIdx, sampleRate: cfg.sampleRate, blocksize: cfg.bufferSize })
  }, [])
  // Propagate TransportBar inline device picks back to streamConfig (so they persist)
  const onTransportDeviceChange = useCallback((inputIdx: number, outputIdx: number) => {
    setStreamConfig(prev => ({ ...prev, inputIdx, outputIdx }))
  }, [])

  // Keep selectedNode reference fresh when node data mutates
  useEffect(() => {
    if (!selectedNode) return
    const fresh = nodes.find(n => n.id === selectedNode.id)
    if (fresh && fresh !== selectedNode) setSelectedNode(fresh)
  }, [nodes]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync graph to backend on any node/edge change (debounced 400ms)
  useEffect(() => {
    syncGraph(nodes, edges)
  }, [nodes, edges, syncGraph])

  // Persist stream config (device selection, SR, buffer) across sessions
  useEffect(() => {
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(streamConfig)) } catch { /* quota */ }
  }, [streamConfig])

  return (
    <PageTransition>
      <div className={styles.view}>
      <SignalFlowBg />
      {/* Toolbar */}
      <div className={styles.topbar}>
        <TransportBar config={streamConfig} onDeviceChange={onTransportDeviceChange} />
        <div className={styles.topbarActions}>
          <button
            className={`${styles.actionBtn}${presetOpen ? ` ${styles.actionBtnActive}` : ''}`}
            onClick={() => { setPresetOpen(o => !o); setDeviceOpen(false) }}
            aria-label="Presets"
            title="Presets"
          >
            <BookOpen size={14} />
          </button>
          <button
            className={`${styles.actionBtn}${deviceOpen ? ` ${styles.actionBtnActive}` : ''}`}
            onClick={() => { setDeviceOpen(o => !o); setPresetOpen(false) }}
            aria-label="Device manager"
            title="Device manager"
          >
            <Cpu size={14} />
          </button>
          <button
            className={styles.actionBtn}
            onClick={() => {
              setNodes(DEFAULT_NODES)
              setEdges(DEFAULT_EDGES)
              setSelectedNode(null)
              try { localStorage.removeItem(GRAPH_KEY) } catch { /* ok */ }
              syncGraph(DEFAULT_NODES, DEFAULT_EDGES)
            }}
            aria-label="Reset graph to default"
            title="Reset graph"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      <div className={styles.workarea}>
        <NodePalette
          collapsed={paletteCollapsed}
          onCollapseChange={setPaletteCollapsed}
        />

        <div className={styles.canvasCol}>
          <FlowCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            onDropNode={onDropNode}
          />

          {/* Floating panels (positioned absolute inside canvasCol) */}
          <AnimatePresence>
            {presetOpen && (
              <PresetBrowser
                key="preset"
                onClose={closePreset}
                onLoad={loadPreset}
                currentNodes={nodes}
                currentEdges={edges}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {deviceOpen && (
              <DeviceManager
                key="device"
                onClose={closeDevice}
                onApply={applyDevice}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {selectedNode && (
              <NodeInspector
                key="inspector"
                node={selectedNode}
                onClose={closeInspector}
                onParamChange={onParamChange}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
    </PageTransition>
  )
}
