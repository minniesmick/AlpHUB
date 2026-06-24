import { useEffect, useState } from 'react'
import { motion, AnimatePresence, useTransform } from 'motion/react'
import { useTilt } from '@renderer/hooks/useTilt'
import { endpoints, type ImageGenApp } from '@renderer/lib/api'
import { PageTransition } from '@renderer/components/PageTransition'
import { RefreshCw, ExternalLink, Sparkles, Play, Globe } from 'lucide-react'
import { BorderBeam } from '@/components/ui/border-beam'
import { CARD_SPRING } from '@renderer/lib/motion'
import styles from './ImageGen.module.css'

// ── Card variants ────────────────────────────────────────────────────────────

const cardVariants = {
  hidden:  { opacity: 0, y: 18, scale: 0.96 },
  visible: { opacity: 1, y: 0,  scale: 1    },
  exit:    { opacity: 0, y: 8,  scale: 0.97 },
}
const cardSpring = CARD_SPRING

// ── App descriptions ─────────────────────────────────────────────────────────

const APP_DESC: Record<string, string> = {
  fooocus:  'Simplified Stable Diffusion with Midjourney-style workflow. Runs on port 7865.',
  comfyui:  'Node-based image generation pipeline with maximum control. Runs on port 8188.',
  forge:    'Optimized Automatic1111 fork with improved VRAM usage. Runs on port 7860.',
  ideogram: 'Cloud-based AI image generator with excellent typography support. No local install required.',
}

// ── App card ─────────────────────────────────────────────────────────────────

function AppCard({ app, index, onOpen, onLaunchApp }: {
  app:          ImageGenApp
  index:        number
  onOpen:       (app: ImageGenApp) => void
  onLaunchApp:  (app: ImageGenApp) => void
}) {
  const [launching, setLaunching] = useState(false)
  const tilt        = useTilt({ maxAngle: 6 })
  const filterStyle = useTransform(tilt.brightness, b => `brightness(${b})`)

  const isWeb     = app.type === 'web'
  const canLaunch = !isWeb && !app.online && !!app.launch_path
  const canOpen   = isWeb || app.online

  const handleLaunch = async () => {
    setLaunching(true)
    try { await onLaunchApp(app) } finally {
      // keep spinner briefly so user sees feedback
      setTimeout(() => setLaunching(false), 2000)
    }
  }

  return (
    <motion.div
      className={`${styles.appCard}${app.online ? ` ${styles.online}` : ''}${isWeb ? ` ${styles.webCard}` : ''}`}
      style={{ rotateX: tilt.rotateX, rotateY: tilt.rotateY, filter: filterStyle, transformPerspective: 800 }}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={{ ...cardSpring, delay: index * 0.07 }}
      whileHover={{ y: -3, scale: 1.005 }}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
    >
      <BorderBeam
        size={75}
        duration={isWeb ? 6 : 9}
        colorFrom={isWeb ? '#F72585' : '#C77DFF'}
        colorTo={isWeb ? '#C77DFF' : '#F72585'}
      />
      <span className={styles.scanline} aria-hidden="true" />

      {/* Head */}
      <div className={styles.cardHead}>
        <span className={styles.appName}>{app.name}</span>
        {isWeb ? (
          <span className={`${styles.statusPill} ${styles.statusPillWeb}`}>
            <Globe size={9} />
            <span className={styles.statusOnline}>Cloud</span>
          </span>
        ) : (
          <span className={styles.statusPill}>
            <span className={`${styles.dot} ${app.online ? styles.dotOnline : styles.dotOffline}`} />
            <span className={app.online ? styles.statusOnline : styles.statusOffline}>
              {app.online ? 'Running' : 'Offline'}
            </span>
          </span>
        )}
      </div>

      {/* Port / label row */}
      <div className={styles.portRow}>
        {isWeb ? (
          <>
            <span className={styles.portLabel}>Type</span>
            <span className={`${styles.portNum} ${styles.portNumWeb}`}>Web API</span>
          </>
        ) : (
          <>
            <span className={styles.portLabel}>Port</span>
            <span className={styles.portNum}>{app.port}</span>
          </>
        )}
      </div>

      <div className={styles.divider} />

      {/* Actions */}
      <div className={styles.cardActions}>
        {/* Open in browser — always for web, only when online for local */}
        <motion.button
          className={`${styles.launchBtn}${canOpen ? ` ${styles.online}` : ''}`}
          whileTap={canOpen ? { scale: 0.95 } : undefined}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
          disabled={!canOpen}
          onClick={() => onOpen(app)}
          aria-label={`Open ${app.name}`}
        >
          <ExternalLink size={13} />
          {canOpen ? 'Open' : 'Not Running'}
        </motion.button>

        {/* Launch bat — only for local apps with a known launch path */}
        {canLaunch && (
          <motion.button
            className={`${styles.launchStartBtn}${launching ? ` ${styles.launching}` : ''}`}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            disabled={launching}
            onClick={handleLaunch}
            aria-label={`Start ${app.name}`}
          >
            <Play size={11} />
            {launching ? 'Starting…' : 'Start'}
          </motion.button>
        )}

        {/* Local with no bat path configured */}
        {!isWeb && !app.online && !app.launch_path && (
          <span className={styles.noLaunchHint}>No launcher</span>
        )}
      </div>
    </motion.div>
  )
}

// ── Main view ────────────────────────────────────────────────────────────────

export default function ImageGenView(): JSX.Element {
  const [apps,       setApps]       = useState<ImageGenApp[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    setRefreshing(true)
    try {
      const res = await endpoints.imagegenStatus()
      setApps(res.apps)
    } catch {
      setApps(null)
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void load()
    const id = setInterval(load, 10_000)
    return () => clearInterval(id)
  }, [])

  const onOpen = (app: ImageGenApp) => {
    if (app.type === 'web' && app.url) {
      window.api.openExternal(app.url)
    } else if (app.port) {
      endpoints.imagegenOpen(app.port).catch(() => {})
    }
  }

  const onLaunchApp = async (app: ImageGenApp) => {
    await endpoints.imagegenLaunch(app.id)
  }

  const localApps  = apps?.filter(a => a.type === 'local') ?? []
  const onlineCount = localApps.filter(a => a.online).length

  return (
    <PageTransition>
      <div className={styles.view}>
        <div className={styles.ambientOrb} />
        {/* Toolbar */}
        <div className={styles.toolbar}>
          <span className={styles.toolbarTitle}>Image Generation</span>
          {apps !== null && (
            <span style={{ fontSize: 'var(--text-xs)', color: onlineCount > 0 ? '#39D98A' : 'var(--text-disabled)', fontFamily: 'var(--font-mono)' }}>
              {onlineCount}/{localApps.length} running
            </span>
          )}
          <motion.button
            className={styles.refreshBtn}
            whileTap={{ scale: 0.93 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            onClick={load}
            disabled={refreshing}
          >
            <RefreshCw size={12} className={refreshing ? styles.spinning : ''} />
            Refresh
          </motion.button>
        </div>

        <div className={styles.body}>
          {apps === null ? (
            <div className={styles.offlineMsg}>Connecting to backend…</div>
          ) : (
            <>
              {/* Cards */}
              <div className={styles.cardsRow}>
                <AnimatePresence initial={false}>
                  {apps.map((app, i) => (
                    <AppCard
                      key={app.id}
                      app={app}
                      index={i}
                      onOpen={onOpen}
                      onLaunchApp={onLaunchApp}
                    />
                  ))}
                </AnimatePresence>
              </div>

              {/* Info */}
              <div className={styles.infoSection}>
                <span className={styles.infoTitle}>About</span>
                <p className={styles.infoText}>
                  Local apps are detected on ports{' '}
                  <code>7860</code>, <code>7865</code>, <code>8188</code> every 10 seconds.
                  Use <strong style={{ color: 'var(--primary)' }}>Start</strong> to launch an app or run it from its own environment.
                </p>
                {apps.map(app => (
                  <p key={app.id} className={styles.infoText}>
                    <strong style={{ color: 'var(--text-primary)' }}>{app.name}</strong>
                    {' — '}
                    {APP_DESC[app.id] ?? ''}
                  </p>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </PageTransition>
  )
}
