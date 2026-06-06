import { useEffect } from 'react'

/**
 * Fires `callback` when the user presses Escape, while `active` is true.
 * Common usage: close a panel, dialog, or dropdown.
 */
export function useEscapeKey(callback: () => void, active = true): void {
  useEffect(() => {
    if (!active) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') callback()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [callback, active])
}
