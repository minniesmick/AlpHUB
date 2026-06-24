import { useCallback } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Controls,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Workflow } from 'lucide-react'
import { GradientEdge } from '../../edges/GradientEdge'
import { NodeCard } from '../../nodes/NodeCard'
import type { PaletteItem } from '../../paletteNodes'
import { EmptyState } from '@renderer/components/EmptyState'
import { AnimatedGridPattern } from '@/components/ui/animated-grid-pattern'
import styles from './FlowCanvas.module.css'

const edgeTypes = { gradient: GradientEdge }
const nodeTypes = { nodeCard: NodeCard }

interface Props {
  nodes:             Node[]
  edges:             Edge[]
  onNodesChange:     OnNodesChange
  onEdgesChange:     OnEdgesChange
  onConnect:         (conn: Connection) => void
  onSelectionChange: (nodes: Node[]) => void
  onDropNode:        (item: PaletteItem, position: { x: number; y: number }) => void
}

// Inner component: has access to ReactFlow context via ReactFlowProvider wrapper below
function CanvasInner({ nodes, edges, onNodesChange, onEdgesChange, onConnect, onSelectionChange, onDropNode }: Props): JSX.Element {
  const { screenToFlowPosition } = useReactFlow()

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData('application/palette-item')
    if (!raw) return
    const item = JSON.parse(raw) as PaletteItem
    // Convert screen → React Flow graph space (respects zoom + pan)
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    onDropNode(item, position)
  }, [onDropNode, screenToFlowPosition])

  const handleDragOver = (e: React.DragEvent) => e.preventDefault()

  return (
    <div
      className={styles.canvas}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <AnimatedGridPattern
        width={28}
        height={28}
        numSquares={18}
        maxOpacity={0.06}
        duration={3.5}
        repeatDelay={1.2}
        className={styles.gridPattern}
      />
      <div className={styles.scanlines} aria-hidden="true" />
      {nodes.length === 0 && (
        <div className={styles.emptyOverlay} aria-hidden="true">
          <EmptyState
            icon={<Workflow size={22} />}
            title="Empty canvas"
            description="Drag nodes from the palette to build your signal flow"
          />
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={conn => onConnect(conn as Connection)}
        onSelectionChange={({ nodes: sel }) => onSelectionChange(sel)}
        edgeTypes={edgeTypes}
        nodeTypes={nodeTypes}
        colorMode="dark"
        defaultViewport={{ x: 60, y: 60, zoom: 1.15 }}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode="Delete"
      >
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

// Wrap with ReactFlowProvider so CanvasInner can use useReactFlow() hooks
export function FlowCanvas(props: Props): JSX.Element {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  )
}
