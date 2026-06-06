import { EdgeProps, getSmoothStepPath, BaseEdge } from '@xyflow/react'

export function GradientEdge({
  id,
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  selected,
}: EdgeProps) {
  const gradId = `eg-${id}`
  const [path] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 12 })

  return (
    <>
      <defs>
        <linearGradient id={gradId} gradientUnits="userSpaceOnUse"
          x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}
        >
          <stop offset="0%"   stopColor="#C77DFF" />
          <stop offset="100%" stopColor="#F72585" />
        </linearGradient>
        {selected && (
          <filter id={`glow-${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        )}
      </defs>
      <BaseEdge
        path={path}
        style={{
          stroke: `url(#${gradId})`,
          strokeWidth: selected ? 2.5 : 1.5,
          filter: selected ? `url(#glow-${id})` : undefined,
          transition: 'stroke-width 0.15s ease',
        }}
      />
    </>
  )
}
