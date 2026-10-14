import { useState } from 'react'
import type { ComponentType, SyntheticEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import './SideDock.css'

export interface DockItem {
  id: string
  label: string
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  tone?: 'danger'
}

interface SideDockProps {
  items: DockItem[]
  bottomItems?: DockItem[]
  activeId: string
  onSelect: (id: string) => void
  homeId?: string
}

interface Tip {
  label: string
  top: number
  left: number
  visible: boolean
}

const STORAGE_KEY = 'vp-dock-expanded'

function readExpanded(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Floating glass navigation.
 *  - Collapsed (default): large icon tiles; hovering/focusing one shows its
 *    name in a glass pill beside it.
 *  - Expanded: the same tiles widen into rows with the label inline.
 * The choice is remembered between visits. Clicking a tile opens that page.
 *
 * The hover label is one fixed-position element so it is never clipped when
 * the tile list scrolls on short screens.
 */
export default function SideDock({
  items,
  bottomItems = [],
  activeId,
  onSelect,
  homeId = 'dashboard',
}: SideDockProps) {
  const [expanded, setExpanded] = useState<boolean>(readExpanded)
  const [tip, setTip] = useState<Tip | null>(null)

  const hide = () => setTip((t) => (t ? { ...t, visible: false } : t))

  const show = (e: SyntheticEvent<HTMLElement>, label: string) => {
    if (expanded) return // labels are already visible inline
    const r = e.currentTarget.getBoundingClientRect()
    setTip({ label, top: r.top + r.height / 2, left: r.right + 12, visible: true })
  }

  const toggle = () => {
    const next = !expanded
    setExpanded(next)
    hide()
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      /* storage unavailable: just don't persist */
    }
  }

  const tipHandlers = (label: string) => ({
    onMouseEnter: (e: SyntheticEvent<HTMLElement>) => show(e, label),
    onFocus: (e: SyntheticEvent<HTMLElement>) => show(e, label),
    onMouseLeave: hide,
    onBlur: hide,
  })

  const renderItem = (item: DockItem) => {
    const Icon = item.icon
    const active = activeId === item.id
    return (
      <button
        key={item.id}
        type="button"
        className={`dock-btn${active ? ' active' : ''}${item.tone === 'danger' ? ' danger' : ''}`}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
        onClick={() => onSelect(item.id)}
        {...tipHandlers(item.label)}
      >
        <Icon size={24} strokeWidth={1.75} />
        <span className="dock-label">{item.label}</span>
      </button>
    )
  }

  return (
    <aside className={`dock${expanded ? ' expanded' : ''}`}>
      <div className="dock-head">
        <button
          type="button"
          className="dock-btn dock-logo"
          aria-label="Virtual Patrol home"
          onClick={() => onSelect(homeId)}
          {...tipHandlers('Virtual Patrol')}
        >
          <img src="/logo.png" alt="" />
        </button>

        <div className="dock-brand">
          <strong>Virtual Patrol</strong>
          <span>Security Management</span>
        </div>

        <button
          type="button"
          className="dock-btn dock-toggle"
          aria-label={expanded ? 'Collapse menu' : 'Expand menu'}
          aria-expanded={expanded}
          onClick={toggle}
          {...tipHandlers(expanded ? 'Collapse menu' : 'Expand menu')}
        >
          {expanded ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
      </div>

      <nav className="dock-nav" aria-label="Main menu" onScroll={hide}>
        {items.map(renderItem)}
      </nav>

      <div className="dock-bottom">{bottomItems.map(renderItem)}</div>

      <span
        className={`dock-tip${tip?.visible ? ' visible' : ''}`}
        style={tip ? { top: tip.top, left: tip.left } : undefined}
        aria-hidden="true"
      >
        {tip?.label}
      </span>
    </aside>
  )
}