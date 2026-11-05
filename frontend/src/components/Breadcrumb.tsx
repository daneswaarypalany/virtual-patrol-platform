import './Breadcrumb.css'

interface BreadcrumbProps {
  currentLabel: string
  rootLabel?: string
  onRootClick?: () => void
}

/** Theme-aware pill breadcrumb shared by every page in the application shell. */
export default function Breadcrumb({
  currentLabel,
  rootLabel = 'Virtual Patrol',
  onRootClick,
}: BreadcrumbProps) {
  return (
    <nav className="app-breadcrumb" aria-label="Breadcrumb">
      <button
        type="button"
        className="app-breadcrumb__pill app-breadcrumb__root"
        onClick={onRootClick}
        disabled={!onRootClick}
        aria-label={`Go to ${rootLabel}`}
      >
        {rootLabel}
      </button>
      <span className="app-breadcrumb__separator" aria-hidden="true">
        <span />
      </span>
      <span
        className="app-breadcrumb__pill app-breadcrumb__current"
        aria-current="page"
      >
        {currentLabel}
      </span>
    </nav>
  )
}
