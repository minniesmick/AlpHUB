/**
 * Settings context — persists user preferences to localStorage.
 * Provides shared values (outputPath, modelPaths) across all views.
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

const LS_KEY = 'alphub_settings_v1'

export interface AppSettings {
  outputPath:   string
  modelsPath:   string
  profilesPath: string
}

const DEFAULTS: AppSettings = {
  outputPath:   'D:\\AlpHUB-Output',
  modelsPath:   'D:\\Ses_Modelleri',
  profilesPath: 'D:\\Ses_Modelleri\\rvc\\profiles',
}

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

function save(s: AppSettings): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s))
  } catch { /* quota exceeded — ignore */ }
}

// ── Context ────────────────────────────────────────────────────────────────

interface SettingsCtx {
  settings:    AppSettings
  set:         <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  setAll:      (partial: Partial<AppSettings>) => void
}

const Ctx = createContext<SettingsCtx | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }): JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(load)

  const set = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      save(next)
      return next
    })
  }, [])

  const setAll = useCallback((partial: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial }
      save(next)
      return next
    })
  }, [])

  return (
    <Ctx.Provider value={{ settings, set, setAll }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSettings(): SettingsCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider')
  return ctx
}
