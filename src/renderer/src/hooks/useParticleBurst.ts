import { useCallback, useRef, useEffect } from 'react'
import { animate } from 'motion/react'

const COLORS = ['#C77DFF', '#F72585', '#9B5FE3', '#FF4FA0']
const COUNT  = 16

interface Particle {
  el:  HTMLSpanElement
  dx:  number
  dy:  number
}

export function useParticleBurst() {
  const particles = useRef<Particle[]>([])

  // Cleanup all lingering elements on unmount
  useEffect(() => {
    return () => {
      for (const p of particles.current) {
        p.el.remove()
      }
      particles.current = []
    }
  }, [])

  const burst = useCallback((cx: number, cy: number) => {
    for (let i = 0; i < COUNT; i++) {
      const el = document.createElement('span')
      const angle  = (i / COUNT) * Math.PI * 2
      const spread = 48 + Math.random() * 56
      const dx     = Math.cos(angle) * spread
      const dy     = Math.sin(angle) * spread
      const size   = 4 + Math.random() * 4
      const color  = COLORS[i % COLORS.length]

      Object.assign(el.style, {
        position:      'fixed',
        left:          `${cx}px`,
        top:           `${cy}px`,
        width:         `${size}px`,
        height:        `${size}px`,
        borderRadius:  '50%',
        background:    color,
        pointerEvents: 'none',
        zIndex:        '9999',
        transform:     'translate(-50%, -50%)',
        willChange:    'transform, opacity',
      })

      document.body.appendChild(el)
      particles.current.push({ el, dx, dy })

      animate(el,
        {
          x:       [0, dx],
          y:       [0, dy],
          opacity: [1, 0],
          scale:   [1, 0.3],
        },
        {
          duration: 0.55 + Math.random() * 0.2,
          easing:   [0.0, 0.8, 0.6, 1],
        }
      ).then(() => {
        el.remove()
        particles.current = particles.current.filter(p => p.el !== el)
      })
    }
  }, [])

  return burst
}
