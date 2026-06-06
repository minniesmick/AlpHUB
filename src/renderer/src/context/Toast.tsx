import { createContext, useCallback, useContext, useRef, useState } from 'react'

export type ToastType = 'error' | 'success' | 'warning' | 'info'

export interface ToastItem {
  id:       string
  type:     ToastType
  message:  string
  duration: number
  exiting:  boolean
}

interface Ctx {
  toasts:  ToastItem[]
  add:     (type: ToastType, message: string, duration?: number) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<Ctx>({
  toasts:  [],
  add:     () => {},
  dismiss: () => {},
})

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    // Phase 1: mark exiting — triggers CSS exit animation
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
    // Clear any existing timer and schedule actual removal after exit anim
    const existing = timers.current.get(id)
    if (existing) clearTimeout(existing)
    const exitTimer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
      timers.current.delete(id)
    }, 220)
    timers.current.set(id, exitTimer)
  }, [])

  const add = useCallback((type: ToastType, message: string, duration = 4000) => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    // Keep max 5 visible — drop oldest
    setToasts(prev => [...prev.slice(-4), { id, type, message, duration, exiting: false }])
    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
      timers.current.delete(id)
    }, duration)
    timers.current.set(id, timer)
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, add, dismiss }}>
      {children}
    </ToastContext.Provider>
  )
}

// ── Hook: fire toasts from any component ───────────────────────────────────

export function useToast() {
  const { add } = useContext(ToastContext)
  return {
    error:   (msg: string, dur?: number) => add('error',   msg, dur ?? 5000),
    success: (msg: string, dur?: number) => add('success', msg, dur ?? 3000),
    warning: (msg: string, dur?: number) => add('warning', msg, dur ?? 4000),
    info:    (msg: string, dur?: number) => add('info',    msg, dur ?? 3000),
  }
}

// ── Hook: read toast list (for ToastStack) ─────────────────────────────────

export function useToasts() {
  const { toasts, dismiss } = useContext(ToastContext)
  return { toasts, dismiss }
}
