import { LayoutGrid, List } from 'lucide-react'

export type ViewMode = 'list' | 'grid'

export default function ViewToggle({
  mode,
  onChange,
}: {
  mode: ViewMode
  onChange: (m: ViewMode) => void
}) {
  return (
    <div className="view-toggle">
      <button
        className={mode === 'list' ? 'active' : ''}
        onClick={() => onChange('list')}
        title="List view"
        aria-label="List view"
      >
        <List size={16} />
      </button>
      <button
        className={mode === 'grid' ? 'active' : ''}
        onClick={() => onChange('grid')}
        title="Grid view"
        aria-label="Grid view"
      >
        <LayoutGrid size={16} />
      </button>
    </div>
  )
}