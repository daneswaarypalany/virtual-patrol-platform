import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Search, Check } from 'lucide-react'
import './SearchableSelect.css'

export interface SelectOption {
  value: string
  label: string
  sub?: string
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  searchable = true,
}: {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  searchable?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.value === value)

  // close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // focus search when opened
  useEffect(() => {
    if (open && searchable) {
      setTimeout(() => searchRef.current?.focus(), 30)
    }
  }, [open, searchable])

  const filtered = query
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          (o.sub ?? '').toLowerCase().includes(query.toLowerCase()),
      )
    : options

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className={`ss ${disabled ? 'ss-disabled' : ''}`} ref={ref}>
      <button
        type="button"
        className={`ss-trigger ${open ? 'open' : ''}`}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
      >
        <span className={selected ? 'ss-value' : 'ss-placeholder'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={16} className={`ss-chevron ${open ? 'up' : ''}`} />
      </button>

      {open && (
        <div className="ss-panel">
          {searchable && (
            <div className="ss-search">
              <Search size={15} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
              />
            </div>
          )}
          <div className="ss-list">
            {filtered.length === 0 ? (
              <div className="ss-empty">No matches</div>
            ) : (
              filtered.map((o) => (
                <button
                  type="button"
                  key={o.value}
                  className={`ss-option ${o.value === value ? 'selected' : ''}`}
                  onClick={() => pick(o.value)}
                >
                  <span className="ss-option-text">
                    <span className="ss-option-label">{o.label}</span>
                    {o.sub && <span className="ss-option-sub">{o.sub}</span>}
                  </span>
                  {o.value === value && <Check size={15} className="ss-tick" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}