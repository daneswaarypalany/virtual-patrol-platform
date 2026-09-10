import { useEffect, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import './TimeWheelPicker.css'

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1) // 1..12
const MINUTES = Array.from({ length: 60 }, (_, i) => i) // 0..59

function to24h(hour12: number, minute: number, meridiem: 'AM' | 'PM') {
  let h = hour12 % 12
  if (meridiem === 'PM') h += 12
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function from24h(value: string) {
  if (!value) return { hour: 12, minute: 0, meridiem: 'AM' as const }
  const [h, m] = value.split(':').map(Number)
  const meridiem: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM'
  let hour12 = h % 12
  if (hour12 === 0) hour12 = 12
  return { hour: hour12, minute: m, meridiem }
}

function display(value: string) {
  if (!value) return '--:-- --'
  const { hour, minute, meridiem } = from24h(value)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${meridiem}`
}

function WheelColumn<T extends string | number>({
  values,
  selected,
  onSelect,
  format,
}: {
  values: T[]
  selected: T
  onSelect: (v: T) => void
  format?: (v: T) => string
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'center' })
    // only run when the popover mounts / selection changes from outside clicks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="twp-col" ref={listRef}>
      {values.map((v) => (
        <button
          key={v}
          type="button"
          ref={v === selected ? selectedRef : undefined}
          className={`twp-cell${v === selected ? ' selected' : ''}`}
          onClick={(e) => {
            onSelect(v)
            e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' })
          }}
        >
          {format ? format(v) : v}
        </button>
      ))}
    </div>
  )
}

export default function TimeWheelPicker({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const initial = from24h(value)
  const [hour, setHour] = useState(initial.hour)
  const [minute, setMinute] = useState(initial.minute)
  const [meridiem, setMeridiem] = useState<'AM' | 'PM'>(initial.meridiem)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const d = from24h(value)
    setHour(d.hour)
    setMinute(d.minute)
    setMeridiem(d.meridiem)
  }, [open, value])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const save = () => {
    onChange(to24h(hour, minute, meridiem))
    setOpen(false)
  }

  return (
    <div className="twp" ref={ref}>
      <button
        type="button"
        className="twp-trigger"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={value ? '' : 'twp-placeholder'}>
          {value ? display(value) : placeholder || '--:-- --'}
        </span>
        <Clock size={15} />
      </button>

      {open && (
        <div className="twp-popover">
          <div className="twp-title">Select time</div>
          <div className="twp-cols">
            <WheelColumn values={HOURS} selected={hour} onSelect={setHour} />
            <span className="twp-colon">:</span>
            <WheelColumn
              values={MINUTES}
              selected={minute}
              onSelect={setMinute}
              format={(v) => String(v).padStart(2, '0')}
            />
            <WheelColumn
              values={['AM', 'PM'] as ('AM' | 'PM')[]}
              selected={meridiem}
              onSelect={setMeridiem}
            />
          </div>
          <div className="twp-actions">
            <button type="button" className="twp-cancel" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="twp-save" onClick={save}>
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
