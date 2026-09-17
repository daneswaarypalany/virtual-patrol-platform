import { useEffect, useMemo, useRef, useState } from 'react'
import type { PatrolJobSummary } from '../lib/patrol'

export type DatePreset = 'all' | 'today' | 'week' | 'month' | 'year' | 'custom'
export type SortKey = 'newest' | 'oldest' | 'site'
export type ShiftKey = 'night' | 'morning'

export const SHIFTS: { key: ShiftKey; label: string; from: string; to: string }[] = [
  { key: 'night', label: 'Night Shift (8:00 PM – 8:00 AM)', from: '20:00', to: '08:00' },
  { key: 'morning', label: 'Morning Shift (8:00 AM – 8:00 PM)', from: '08:00', to: '20:00' },
]

export const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
  { key: 'custom', label: 'Custom range' },
]

// Only patrols with a completedAt are reportable, so every caller of this
// hook filters down to COMPLETED jobs first.
export function useReportFilters(jobs: PatrolJobSummary[]) {
  const completed = useMemo(
    () => jobs.filter((j) => j.status === 'COMPLETED'),
    [jobs],
  )

  const [search, setSearch] = useState('')
  const [siteFilter, setSiteFilter] = useState('all')
  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [sortKey, setSortKey] = useState<SortKey>('newest')
  const [fromDate, setFromDate] = useState<Date | null>(null)
  const [toDate, setToDate] = useState<Date | null>(null)
  const [fromTime, setFromTime] = useState('')
  const [toTime, setToTime] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const panelWrapRef = useRef<HTMLDivElement>(null)

  const sites = useMemo(
    () => Array.from(new Set(completed.map((j) => j.route.site.name))).sort(),
    [completed],
  )

  const cutoff = useMemo(() => {
    const now = new Date()
    if (datePreset === 'today') {
      const d = new Date(now)
      d.setHours(0, 0, 0, 0)
      return d
    }
    if (datePreset === 'week') {
      const d = new Date(now)
      d.setDate(d.getDate() - 7)
      return d
    }
    if (datePreset === 'month') {
      const d = new Date(now)
      d.setMonth(d.getMonth() - 1)
      return d
    }
    if (datePreset === 'year') {
      const d = new Date(now)
      d.setFullYear(d.getFullYear() - 1)
      return d
    }
    return null
  }, [datePreset])

  const selectPreset = (key: DatePreset) => {
    setDatePreset(key)
    setFromDate(null)
    setToDate(null)
    setFromTime('')
    setToTime('')
    setPanelOpen(true)
  }

  // for the week/month/year presets, picking a start date auto-fills the
  // end date that many days/months/years later, so the user only has to
  // pick one date instead of manually working out the range
  const computePresetEnd = (start: Date, preset: DatePreset) => {
    const end = new Date(start)
    if (preset === 'week') {
      end.setDate(end.getDate() + 6)
    } else if (preset === 'month') {
      end.setMonth(end.getMonth() + 1)
      end.setDate(end.getDate() - 1)
    } else if (preset === 'year') {
      end.setFullYear(end.getFullYear() + 1)
      end.setDate(end.getDate() - 1)
    }
    return end
  }

  const handleFromDateChange = (d: Date | null) => {
    setFromDate(d)
    if (d && (datePreset === 'week' || datePreset === 'month' || datePreset === 'year')) {
      setToDate(computePresetEnd(d, datePreset))
    } else if (!d) {
      setToDate(null)
    }
  }

  // close the refine panel on outside click, but not on clicks within the
  // preset bar itself (those re-open it via selectPreset)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        panelOpen &&
        panelWrapRef.current &&
        !panelWrapRef.current.contains(e.target as Node)
      ) {
        setPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [panelOpen])

  const filtered = useMemo(() => {
    let list = completed.filter((j) => {
      const q = search.toLowerCase()
      const matchesSearch =
        j.route.name.toLowerCase().includes(q) ||
        j.route.site.name.toLowerCase().includes(q) ||
        j.operator.fullName.toLowerCase().includes(q)
      const matchesSite =
        siteFilter === 'all' || j.route.site.name === siteFilter

      const when = j.completedAt ? new Date(j.completedAt) : null

      // date filter — a preset's cutoff sets the base window; the date
      // pickers in the panel below can further narrow within it (and are
      // the sole source of truth when the preset is "custom")
      let matchesDate = true
      if (cutoff) matchesDate = !!when && when >= cutoff
      if (fromDate && when) matchesDate = matchesDate && when >= fromDate
      if (toDate && when) {
        const end = new Date(toDate)
        end.setHours(23, 59, 59, 999)
        matchesDate = matchesDate && when <= end
      }

      // time-of-day filter — applies for any preset once set, including a
      // shift shortcut (night/morning) or the plain time inputs
      let matchesTime = true
      if ((fromTime || toTime) && when) {
        const mins = when.getHours() * 60 + when.getMinutes()
        const toMins = (t: string) => {
          const [h, m] = t.split(':').map(Number)
          return h * 60 + m
        }
        const start = fromTime ? toMins(fromTime) : 0
        const end = toTime ? toMins(toTime) : 24 * 60
        if (start <= end) {
          matchesTime = mins >= start && mins <= end
        } else {
          matchesTime = mins >= start || mins <= end
        }
      }

      return matchesSearch && matchesSite && matchesDate && matchesTime
    })

    list = [...list].sort((a, b) => {
      if (sortKey === 'site')
        return a.route.site.name.localeCompare(b.route.site.name)
      const at = a.completedAt ? new Date(a.completedAt).getTime() : 0
      const bt = b.completedAt ? new Date(b.completedAt).getTime() : 0
      return sortKey === 'oldest' ? at - bt : bt - at
    })

    return list
  }, [
    completed,
    search,
    siteFilter,
    cutoff,
    datePreset,
    fromDate,
    toDate,
    fromTime,
    toTime,
    sortKey,
  ])

  return {
    completed,
    sites,
    filtered,
    search,
    setSearch,
    siteFilter,
    setSiteFilter,
    datePreset,
    selectPreset,
    sortKey,
    setSortKey,
    fromDate,
    toDate,
    setToDate,
    handleFromDateChange,
    fromTime,
    setFromTime,
    toTime,
    setToTime,
    panelOpen,
    setPanelOpen,
    panelWrapRef,
  }
}

export type ReportFilters = ReturnType<typeof useReportFilters>