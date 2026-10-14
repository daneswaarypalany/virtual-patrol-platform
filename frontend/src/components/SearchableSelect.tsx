import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, Check } from 'lucide-react'
import './SearchableSelect.css'

export interface SelectOption {
  value: string
  label: string
  sub?: string
}

type PopupPosition = {
  top: number
  left: number
  width: number
  maxHeight: number
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  searchable = true,
  searchPlaceholder = 'Search…',
  emptyMessage = 'No matches found.',
  portal = false,
  ariaLabel,
}: {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  searchable?: boolean
  searchPlaceholder?: string
  emptyMessage?: string
  /** Render the popup in document.body to avoid clipping in scroll/accordion containers. */
  portal?: boolean
  ariaLabel?: string
}) {
  const optionsId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [popupPosition, setPopupPosition] = useState<PopupPosition | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.value === value)
  const filtered = query.trim()
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.trim().toLowerCase()) ||
          (o.sub ?? '').toLowerCase().includes(query.trim().toLowerCase()),
      )
    : options

  // Close when the pointer lands outside either the trigger wrapper or a portalled popup.
  useEffect(() => {
    if (!open) return
    const handler = (event: PointerEvent) => {
      const target = event.target as Node
      const inTrigger = !!ref.current?.contains(target)
      const inPanel = !!panelRef.current?.contains(target)
      if (!inTrigger && !inPanel) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('pointerdown', handler, true)
    return () => document.removeEventListener('pointerdown', handler, true)
  }, [open])

  // Keep a portalled popup attached to its trigger and inside the viewport, including while scrolling.
  useLayoutEffect(() => {
    if (!open || !portal) {
      setPopupPosition(null)
      return
    }

    const updatePosition = () => {
      const trigger = triggerRef.current
      const panel = panelRef.current
      if (!trigger || !panel) return

      const triggerRect = trigger.getBoundingClientRect()
      const viewportPadding = 12
      const maxHeight = Math.max(120, window.innerHeight - viewportPadding * 2)
      const panelRect = panel.getBoundingClientRect()
      const panelHeight = Math.min(panelRect.height || 280, maxHeight)
      const spaceBelow = window.innerHeight - triggerRect.bottom - viewportPadding
      const spaceAbove = triggerRect.top - viewportPadding
      const openBelow = spaceBelow >= panelHeight || spaceBelow >= spaceAbove
      const availableHeight = Math.max(
        120,
        Math.min(maxHeight, openBelow ? spaceBelow : spaceAbove),
      )
      const left = Math.min(
        Math.max(viewportPadding, triggerRect.left),
        Math.max(viewportPadding, window.innerWidth - triggerRect.width - viewportPadding),
      )

      setPopupPosition({
        top: openBelow
          ? Math.min(triggerRect.bottom + 6, window.innerHeight - availableHeight - viewportPadding)
          : Math.max(viewportPadding, triggerRect.top - Math.min(panelHeight, availableHeight) - 6),
        left,
        width: Math.min(triggerRect.width, window.innerWidth - viewportPadding * 2),
        maxHeight: availableHeight,
      })
    }

    // Measure after the popup is mounted; resize/scroll listeners keep its geometry current.
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, portal, filtered.length, searchable])

  // Focus the search box after opening. The fallback focus to the first option is useful when search is disabled.
  useEffect(() => {
    if (!open) return
    const timeout = window.setTimeout(() => {
      if (searchable) searchRef.current?.focus()
      else panelRef.current?.querySelector<HTMLButtonElement>('.ss-option')?.focus()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [open, searchable])

  const pick = (nextValue: string) => {
    onChange(nextValue)
    setOpen(false)
    setQuery('')
    triggerRef.current?.focus()
  }

  const close = (returnFocus = false) => {
    setOpen(false)
    setQuery('')
    if (returnFocus) triggerRef.current?.focus()
  }

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' && !open) {
      event.preventDefault()
      setOpen(true)
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      close(true)
    }
  }

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return

    const optionButtons = Array.from(
      panelRef.current?.querySelectorAll<HTMLButtonElement>('.ss-option') ?? [],
    )
    if (!optionButtons.length) return

    event.preventDefault()
    const activeIndex = optionButtons.indexOf(document.activeElement as HTMLButtonElement)
    const nextIndex = activeIndex === -1
      ? (event.key === 'ArrowDown' ? 0 : optionButtons.length - 1)
      : (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + optionButtons.length) % optionButtons.length
    optionButtons[nextIndex]?.focus()
  }

  const panel = open ? (
    <div
      ref={panelRef}
      id={optionsId}
      className={`ss-panel${portal ? ' ss-panel-portal' : ''}`}
      role="listbox"
      aria-label={ariaLabel ?? placeholder}
      onKeyDown={handlePanelKeyDown}
      style={portal ? {
        top: popupPosition?.top ?? 0,
        left: popupPosition?.left ?? 0,
        width: popupPosition?.width ?? triggerRef.current?.getBoundingClientRect().width,
        maxHeight: popupPosition?.maxHeight ?? 'min(280px, calc(100vh - 24px))',
      } : undefined}
    >
      {searchable && (
        <div className="ss-search">
          <Search size={15} aria-hidden="true" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                const firstOption = panelRef.current?.querySelector<HTMLButtonElement>('.ss-option')
                if (firstOption) {
                  event.preventDefault()
                  firstOption.focus()
                }
              }
            }}
          />
        </div>
      )}
      <div className="ss-list">
        {filtered.length === 0 ? (
          <div className="ss-empty" role="status">{emptyMessage}</div>
        ) : (
          filtered.map((option) => (
            <button
              type="button"
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              className={`ss-option ${option.value === value ? 'selected' : ''}`}
              onClick={() => pick(option.value)}
            >
              <span className="ss-option-text">
                <span className="ss-option-label">{option.label}</span>
                {option.sub && <span className="ss-option-sub">{option.sub}</span>}
              </span>
              {option.value === value && <Check size={15} className="ss-tick" aria-hidden="true" />}
            </button>
          ))
        )}
      </div>
    </div>
  ) : null

  return (
    <div className={`ss ${disabled ? 'ss-disabled' : ''}`} ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        className={`ss-trigger ${open ? 'open' : ''}`}
        onClick={() => !disabled && setOpen((wasOpen) => !wasOpen)}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? optionsId : undefined}
      >
        <span className={selected ? 'ss-value' : 'ss-placeholder'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={16} className={`ss-chevron ${open ? 'up' : ''}`} aria-hidden="true" />
      </button>
      {open && portal && panel ? createPortal(panel, document.body) : panel}
    </div>
  )
}
