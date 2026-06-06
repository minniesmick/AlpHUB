import { useState, useEffect } from 'react'
import { endpoints } from '@renderer/lib/api'
import type { VoiceProfile, SystemInfo } from '@renderer/lib/api'
import { useSettings } from '@renderer/context/Settings'
import { useToast } from '@renderer/context/Toast'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import styles from './Settings.module.css'

type Tab = 'audio' | 'paths' | 'profiles'

const TABS: { id: Tab; label: string }[] = [
  { id: 'audio',    label: 'Audio' },
  { id: 'paths',    label: 'Paths' },
  { id: 'profiles', label: 'Profiles' },
]

// ── PathField ────────────────────────────────────────────────────────────────

function PathField({ label, value, onChange, onRescan, rescanning }: {
  label:      string
  value:      string
  onChange:   (v: string) => void
  onRescan?:  () => void
  rescanning?: boolean
}) {
  return (
    <div className={styles.pathField}>
      <span className={styles.pathLabel}>{label}</span>
      <div className={styles.pathRow}>
        <input
          className={styles.pathInput}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          spellCheck={false}
          aria-label={label}
        />
        {onRescan && (
          <button
            className={styles.rescanBtn}
            onClick={onRescan}
            disabled={rescanning}
            aria-label={`Rescan ${label}`}
          >
            {rescanning ? 'Scanning…' : 'Rescan'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Settings panels ──────────────────────────────────────────────────────────

function AudioPanel() {
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null)

  useEffect(() => {
    endpoints.systemInfo().then(setSysInfo).catch(() => {})
  }, [])

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>ASIO Device</div>
      <div className={styles.hint}>
        ASIO device selection is available in Signal Flow → Transport Bar.
        Configure buffer size and sample rate there before starting a session.
      </div>

      <div className={styles.sectionTitle} style={{ marginTop: 'var(--space-4)' }}>System</div>
      <div className={styles.sysGrid}>
        <span className={styles.sysKey}>Python</span>
        <span className={styles.sysVal}>{sysInfo?.python_version ?? '—'}</span>

        <span className={styles.sysKey}>CUDA</span>
        <span className={`${styles.sysVal} ${sysInfo?.cuda_available ? styles.sysValOn : styles.sysValOff}`}>
          {sysInfo == null ? '—' : sysInfo.cuda_available ? 'Available' : 'Not available'}
        </span>

        {sysInfo?.cuda_device_name && (
          <>
            <span className={styles.sysKey}>GPU</span>
            <span className={styles.sysVal}>{sysInfo.cuda_device_name}</span>
          </>
        )}

        {sysInfo?.vram_total_gb != null && (
          <>
            <span className={styles.sysKey}>VRAM</span>
            <span className={styles.sysVal}>
              {sysInfo.vram_free_gb} GB free / {sysInfo.vram_total_gb} GB
            </span>
          </>
        )}
      </div>

      <div className={styles.sectionTitle} style={{ marginTop: 'var(--space-4)' }}>Python Venv</div>
      <PathField
        label="Hub venv path"
        value="D:\\AI_Ortak_Venv\\hub_venv"
        onChange={() => {}}
      />
      <div className={styles.hint}>Hardcoded NTFS junction. Change requires backend restart.</div>
    </div>
  )
}

const DATA_KEYS = [
  'alphub_pipeline_outputs_v1',
  'alphub_pipeline_prefs_v1',
  'alphub_splitter_outputs_v1',
  'alphub_splitter_prefs_v1',
  'alphub_presets_v1',
  'alphub_signalflow_graph_v1',
  'alphub_stream_config_v1',
]

function PathsPanel() {
  const { settings, set } = useSettings()
  const toast = useToast()
  const [rescanning,   setRescanning]   = useState(false)
  const [clearConfirm, setClearConfirm] = useState(false)

  const rescan = async () => {
    setRescanning(true)
    try {
      await endpoints.rescanModels({ model_root: settings.modelsPath || undefined })
      toast.success('Model scan complete')
    } catch (e) {
      toast.error(`Rescan failed: ${(e as Error).message}`)
    } finally {
      setRescanning(false)
    }
  }

  const clearData = () => {
    DATA_KEYS.forEach(k => { try { localStorage.removeItem(k) } catch { /* ok */ } })
    setClearConfirm(false)
    toast.success('App data cleared — reload to apply')
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Model Directories</div>
      <PathField
        label="Models root"
        value={settings.modelsPath}
        onChange={v => set('modelsPath', v)}
        onRescan={rescan}
        rescanning={rescanning}
      />
      <div className={styles.hint}>
        Subdirs: whisper/ · demucs/ · rvc/ · kokoro/
      </div>

      <div className={styles.sectionTitle} style={{ marginTop: 'var(--space-4)' }}>Output</div>
      <PathField
        label="Default output path"
        value={settings.outputPath}
        onChange={v => set('outputPath', v)}
      />
      <div className={styles.hint}>Pipeline and Splitter write files here.</div>

      <div className={styles.sectionTitle} style={{ marginTop: 'var(--space-4)' }}>Profiles</div>
      <PathField
        label="Profiles root"
        value={settings.profilesPath}
        onChange={v => set('profilesPath', v)}
      />
      <div className={styles.hint}>Each profile: {"<name>/meta.json + embedding.npy"}</div>

      <div className={styles.sectionTitle} style={{ marginTop: 'var(--space-4)' }}>Data</div>
      <div className={styles.hint}>
        Output histories, custom presets, graph, stream config, preferences.
      </div>
      <button
        className={styles.clearDataBtn}
        onClick={() => setClearConfirm(true)}
        aria-label="Clear all app data"
      >
        Clear all data…
      </button>

      <ConfirmDialog
        open={clearConfirm}
        title="Clear all data"
        body="This will remove output histories, custom presets, Signal Flow graph, and saved preferences. App settings (paths) are kept. Continue?"
        confirmLabel="Clear"
        onConfirm={clearData}
        onCancel={() => setClearConfirm(false)}
      />
    </div>
  )
}

function ProfilesPanel() {
  const toast = useToast()
  const [profiles, setProfiles]       = useState<VoiceProfile[]>([])
  const [loading, setLoading]         = useState(true)
  const [pendingDelete, setPending]   = useState<VoiceProfile | null>(null)
  const [deleting, setDeleting]       = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    endpoints.listProfiles()
      .then(setProfiles)
      .catch(() => toast.warning('Could not load profiles'))
      .finally(() => setLoading(false))
  }

  useEffect(load, []) // eslint-disable-line react-hooks/exhaustive-deps

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const id = pendingDelete.id
    setPending(null)
    setDeleting(id)
    try {
      await endpoints.deleteProfile(id)
      setProfiles(prev => prev.filter(p => p.id !== id))
      toast.success(`Profile "${pendingDelete.name ?? id}" deleted`)
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Voice Profiles</div>

      {loading ? (
        <p className={styles.hint}>Loading…</p>
      ) : profiles.length === 0 ? (
        <div className={styles.emptyProfiles}>
          <p className={styles.emptyProfilesText}>No profiles yet</p>
          <p className={styles.hint}>
            Create one in Pipeline → STS mode → New Profile.
          </p>
        </div>
      ) : (
        <ul className={styles.profileList}>
          {profiles.map(p => (
            <li key={p.id} className={styles.profileCard}>
              <div className={styles.profileInfo}>
                <span className={styles.profileName}>{p.name ?? p.id}</span>
                {p.created && (
                  <span className={styles.profileMeta}>
                    {new Date(p.created).toLocaleDateString()}
                  </span>
                )}
              </div>
              <button
                className={styles.profileDeleteBtn}
                onClick={() => setPending(p)}
                disabled={deleting === p.id}
                aria-label={`Delete profile ${p.name ?? p.id}`}
              >
                {deleting === p.id ? '…' : '×'}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.hint}>
        Profiles stored at: Paths → Profiles root
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete profile"
        body={`Delete "${pendingDelete?.name ?? pendingDelete?.id}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPending(null)}
      />
    </div>
  )
}

// ── View ─────────────────────────────────────────────────────────────────────

export default function SettingsView(): JSX.Element {
  const [tab, setTab] = useState<Tab>('audio')

  return (
    <div className={styles.view}>
      <nav className={styles.subnav} aria-label="Settings sections">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`${styles.subnavItem}${tab === t.id ? ` ${styles.active}` : ''}`}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className={styles.content}>
        {tab === 'audio'    && <AudioPanel />}
        {tab === 'paths'    && <PathsPanel />}
        {tab === 'profiles' && <ProfilesPanel />}
      </div>
    </div>
  )
}
