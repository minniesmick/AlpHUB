import { useCallback, useRef, useState } from 'react'

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'

export function useTextScramble(target: string, duration = 320) {
  const [display, setDisplay] = useState(target)
  const rafRef  = useRef<number | null>(null)
  const startRef = useRef<number>(0)

  const scramble = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    startRef.current = performance.now()

    const step = (now: number) => {
      const elapsed  = now - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      const revealAt = Math.floor(progress * target.length)

      const chars = target
        .split('')
        .map((ch, i) => {
          if (i < revealAt) return ch
          if (ch === ' ')   return ' '
          return CHARSET[Math.floor(Math.random() * CHARSET.length)]
        })
        .join('')

      setDisplay(chars)

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        setDisplay(target)
        rafRef.current = null
      }
    }

    rafRef.current = requestAnimationFrame(step)
  }, [target, duration])

  const reset = useCallback(() => {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    setDisplay(target)
  }, [target])

  return { display, scramble, reset }
}
