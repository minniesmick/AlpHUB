import { useEffect, useState } from 'react'
import { EdgeProps, getSmoothStepPath, BaseEdge } from '@xyflow/react'
import { ws } from '@renderer/lib/ws'

export function GradientEdge({
  id,
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  selected,
}: EdgeProps) {
  const [streaming, setStreaming] = useState(false)

  useEffect(() => {
    return ws.on('stream_status', d => setStreaming(d.active))
  }, [])

  const gradId   = `eg-${id}`
  const flowGrad = `fg-${id}`
  const [path]   = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 12 })

  return (
    <>
      <defs>
        <linearGradient id={gradId} gradientUnits="userSpaceOnUse"
          x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}
        >
          <stop offset="0%"   stopColor="#C77DFF" stopOpacity={streaming ? 0.9 : 0.6} />
          <stop offset="100%" stopColor="#F72585" stopOpacity={streaming ? 0.9 : 0.6} />
        </linearGradient>
        <linearGradient id={flowGrad} gradientUnits="userSpaceOnUse"
          x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}
        >
          <stop offset="0%"   stopColor="#C77DFF" stopOpacity={0} />
          <stop offset="40%"  stopColor="#C77DFF" />
          <stop offset="60%"  stopColor="#F72585" />
          <stop offset="100%" stopColor="#F72585" stopOpacity={0} />
        </linearGradient>
        {selected && (
          <filter id={`glow-${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        )}
      </defs>

      {/* Base edge — always visible */}
      <BaseEdge
        path={path}
        style={{
          stroke: `url(#${gradId})`,
          strokeWidth: selected ? 2.5 : 1.5,
          filter: selected ? `url(#glow-${id})` : undefined,
          transition: 'stroke-width 0.15s ease, opacity 0.3s',
          opacity: streaming ? 0.45 : 1,
        }}
      />

      {/* Animated flow overlay — only when streaming */}
      {streaming && (
        <path
          d={path}
          fill="none"
          stroke={`url(#${flowGrad})`}
          strokeWidth={selected ? 2.5 : 1.5}
          strokeDasharray="10 6"
          style={{
            animation: 'flow-dash 0.9s linear infinite',
            pointerEvents: 'none',
          }}
          aria-hidden="true"
        />
      )}
    </>
  )
}
