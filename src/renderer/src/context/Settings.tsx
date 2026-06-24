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

// Defaults intentionally empty — resolved async from OS home dir on first run.
// Stored in localStorage after first resolution so subsequent loads are sync.
const FALLBACK_DEFAULTS: AppSettings = {
  outputPath:   'C:\\AlpHUB-Output',
  modelsPath:   'C:\\AlpHUB-Models',
  profilesPath: 'C:\\AlpHUB-Models\\rvc\\profiles',
}

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { ...FALLBACK_DEFAULTS }
    return { ...FALLBACK_DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...FALLBACK_DEFAULTS }
  }
}

// On first run (no saved settings), resolve paths from OS home dir and persist.
export async function initDefaultPaths(): Promise<void> {
  if (localStorage.getItem(LS_KEY)) return
  try {
    const home = await window.api.getHomeDir()
    const sep  = home.includes('/') ? '/' : '\\'
    const defaults: AppSettings = {
      outputPath:   home + sep + 'AlpHUB-Output',
      modelsPath:   home + sep + 'AlpHUB-Models',
      profilesPath: home + sep + 'AlpHUB-Models' + sep + 'rvc' + sep + 'profiles',
    }
    localStorage.setItem(LS_KEY, JSON.stringify(defaults))
  } catch { /* api not available (e.g. web context) — use fallback */ }
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
