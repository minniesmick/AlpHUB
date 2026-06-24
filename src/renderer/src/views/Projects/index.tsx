import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useTransform } from 'motion/react'
import { endpoints, type Project } from '@renderer/lib/api'
import { useTilt } from '@renderer/hooks/useTilt'
import { PageTransition } from '@renderer/components/PageTransition'
import { RefreshCw, GitBranch, Search, FolderOpen, Code2, FolderSearch } from 'lucide-react'
import { SkeletonCard } from '@renderer/components/Skeleton'
import { EmptyState } from '@renderer/components/EmptyState'
import { BorderBeam } from '@/components/ui/border-beam'
import { CARD_SPRING } from '@renderer/lib/motion'
import styles from './Projects.module.css'

// ── Lang colors ─────────────────────────────────────────────────────────────

const LANG_COLORS: Record<string, string> = {
  typescript:  '#3178C6',
  javascript:  '#F7DF1E',
  python:      '#3572A5',
  rust:        '#DEA584',
  go:          '#00ADD8',
  'c++':       '#F34B7D',
  cpp:         '#F34B7D',
  c:           '#555555',
  java:        '#B07219',
  'c#':        '#178600',
  cs:          '#178600',
  kotlin:      '#7F52FF',
  swift:       '#F05138',
  ruby:        '#CC342D',
  vue:         '#41B883',
  svelte:      '#FF3E00',
  html:        '#E34C26',
  css:         '#563D7C',
  unknown:     '#6B7280',
}

function langColor(lang: string): string {
  return LANG_COLORS[lang.toLowerCase()] ?? LANG_COLORS.unknown
}

function relativeDate(iso: string): string {
  try {
    const d = new Date(iso)
    const diff = (Date.now() - d.getTime()) / 1000
    if (diff < 60)  return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
    return d.toLocaleDateString()
  } catch { return '' }
}

// ── Card variants ────────────────────────────────────────────────────────────

const cardVariants = {
  hidden:  { opacity: 0, y: 16, scale: 0.97 },
  visible: { opacity: 1, y: 0,  scale: 1    },
  exit:    { opacity: 0, y: 8,  scale: 0.97 },
}
const cardSpring = CARD_SPRING

// ── Project card ─────────────────────────────────────────────────────────────

function ProjectCard({ project, index }: { project: Project; index: number }) {
  const [pressed, setPressed] = useState(false)

  const tilt        = useTilt({ maxAngle: 5 })
  const filterStyle = useTransform(tilt.brightness, b => `brightness(${b})`)
  const handleMouseMove  = (e: React.MouseEvent<HTMLElement>): void => tilt.onMouseMove(e)
  const handleMouseLeave = (): void => tilt.onMouseLeave()

  function openFolder() {
    window.api.showItemInFolder(project.path)
  }

  function openVSCode() {
    window.api.openExternal(`vscode://file/${project.path}`)
  }

  return (
    <motion.div
      className={styles.card}
      style={{ rotateX: tilt.rotateX, rotateY: tilt.rotateY, filter: filterStyle, transformPerspective: 800 }}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={{ ...cardSpring, delay: Math.min(index, 12) * 0.045 }}
      whileHover={{ y: -2, borderColor: 'rgba(199,125,255,0.28)', boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(199,125,255,0.14)' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <BorderBeam size={80} duration={10} colorFrom="#C77DFF" colorTo="#F72585" />
      {/* Header row */}
      <div className={styles.cardHeader}>
        <div className={styles.cardLeft}>
          <span
            className={styles.langDot}
            style={{ background: langColor(project.lang) }}
          />
          <span className={styles.cardName}>{project.name}</span>
        </div>
        <span className={styles.branchPill}>
          <GitBranch size={9} />
          {project.branch}
        </span>
      </div>

      {/* Commit info */}
      {project.last_commit ? (
        <div className={styles.cardMeta}>
          <span className={styles.commitMsg}>{project.last_commit.msg}</span>
          <span className={styles.commitDate}>{relativeDate(project.last_commit.date)}</span>
        </div>
      ) : (
        <div className={styles.cardMeta}>
          <span className={styles.commitMsg} style={{ color: 'var(--text-disabled)' }}>No commits</span>
        </div>
      )}

      {/* Path */}
      <span className={styles.cardPath} onClick={openFolder} title="Open in Explorer">
        {project.path}
      </span>

      {/* Actions */}
      <div className={styles.cardActions}>
        <motion.button
          className={styles.ideBtn}
          whileTap={{ scale: 0.93 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
          onClick={openVSCode}
        >
          <Code2 size={11} />
          VS Code
        </motion.button>
        <motion.button
          className={styles.ideBtn}
          whileTap={{ scale: 0.93 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
          onClick={openFolder}
        >
          <FolderOpen size={11} />
          Explorer
        </motion.button>
        <span className={styles.langBadge}>{project.lang}</span>
      </div>
    </motion.div>
  )
}

// ── Main view ────────────────────────────────────────────────────────────────

const DEFAULT_ROOT = 'C:\\Users\\alper\\PROJELER'

export default function ProjectsView(): JSX.Element {
  const [projects,  setProjects]  = useState<Project[] | null>(null)
  const [root,      setRoot]      = useState(DEFAULT_ROOT)
  const [query,     setQuery]     = useState('')
  const [scanning,  setScanning]  = useState(false)
  const rootInput = useRef(root)

  const load = async (r: string) => {
    setScanning(true)
    try {
      const res = await endpoints.listProjects(r)
      setProjects(res.projects)
    } catch {
      setProjects([])
    } finally {
      setScanning(false)
    }
  }

  useEffect(() => { void load(root) }, [])

  const filtered = projects
    ? projects.filter(p =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.lang.toLowerCase().includes(query.toLowerCase()) ||
        p.branch.toLowerCase().includes(query.toLowerCase())
      )
    : null

  return (
    <PageTransition>
      <div className={styles.view}>
        <div className={styles.ambientOrb} />
        {/* Toolbar */}
        <div className={styles.toolbar}>
          <span className={styles.toolbarTitle}>Projects</span>
          <div className={styles.toolbarActions}>
            <div className={styles.searchWrap}>
              <Search size={13} className={styles.searchIcon} />
              <input
                className={styles.searchInput}
                placeholder="Filter…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            <motion.button
              className={styles.rescanBtn}
              whileTap={{ scale: 0.93 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              onClick={() => load(root)}
              disabled={scanning}
            >
              <RefreshCw size={12} className={scanning ? styles.spinning : ''} />
              Scan
            </motion.button>
          </div>
        </div>

        <div className={styles.body}>
          {/* Root path bar */}
          <div className={styles.pathBar}>
            <span className={styles.pathLabel}>Root</span>
            <input
              className={styles.pathInput}
              defaultValue={root}
              onChange={e => { rootInput.current = e.target.value }}
              onBlur={e => {
                const v = e.target.value.trim()
                if (v && v !== root) { setRoot(v); void load(v) }
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const v = (e.target as HTMLInputElement).value.trim()
                  if (v) { setRoot(v); void load(v) }
                }
              }}
              placeholder="C:\Users\…"
            />
            {projects !== null && (
              <span className={styles.pathCount}>
                {filtered?.length ?? 0} / {projects.length}
              </span>
            )}
          </div>

          {/* Grid */}
          {projects === null ? (
            <div className={styles.grid}>
              {Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} lines={3} header="55%" />)}
            </div>
          ) : filtered!.length === 0 ? (
            <EmptyState
              icon={<FolderSearch size={22} />}
              title={query ? 'No matches' : 'No git repos found'}
              description={query
                ? `No projects matching "${query}"`
                : 'Change the root path or run git init in a folder'}
            />
          ) : (
            <div className={styles.grid}>
              <AnimatePresence initial={false}>
                {filtered!.map((p, i) => (
                  <ProjectCard key={p.path} project={p} index={i} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  )
}
