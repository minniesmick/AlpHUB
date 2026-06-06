import { PanelLeftClose, PanelLeft } from 'lucide-react'
import { PALETTE_ITEMS } from '../../paletteNodes'
import type { PaletteItem } from '../../paletteNodes'
import styles from './NodePalette.module.css'

interface Props {
  onDragStart?:      (item: PaletteItem, event: React.DragEvent) => void
  collapsed?:        boolean
  onCollapseChange?: (collapsed: boolean) => void
}

const SECTIONS = ['Source', 'Effect', 'Sink'] as const

export function NodePalette({ onDragStart, collapsed = false, onCollapseChange }: Props): JSX.Element {
  return (
    <div className={`${styles.drawer}${collapsed ? ` ${styles.collapsed}` : ''}`}>
      <div className={styles.drawerHeader}>
        <span className={styles.drawerTitle}>Nodes</span>
        <button
          className={styles.collapseBtn}
          onClick={() => onCollapseChange?.(!collapsed)}
          aria-label={collapsed ? 'Expand palette' : 'Collapse palette'}
        >
          {collapsed ? <PanelLeft size={12} /> : <PanelLeftClose size={12} />}
        </button>
      </div>

      <div className={styles.content}>
        {SECTIONS.map(section => {
          const items = PALETTE_ITEMS.filter(i => i.section === section)
          return (
            <div key={section} className={styles.section}>
              <div className={styles.sectionLabel}>{section}</div>
              {items.map(item => (
                <div
                  key={item.label}
                  className={styles.item}
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.setData('application/palette-item', JSON.stringify(item))
                    e.dataTransfer.effectAllowed = 'copy'
                    onDragStart?.(item, e)
                  }}
                  title={item.label}
                >
                  <span className={`${styles.itemDot} ${styles[section.toLowerCase() as 'source' | 'effect' | 'sink']}`} />
                  <span className={styles.itemLabel}>{item.label}</span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
