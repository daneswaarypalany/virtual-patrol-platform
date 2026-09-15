import { useEffect, useState } from 'react'
import { GripVertical, Save, RotateCcw, FileCog } from 'lucide-react'
import type { ReportField } from '../lib/report-template'
import { reportTemplateApi } from '../lib/report-template'
import './ReportBuilder.css'

export default function ReportBuilder() {
  const [fields, setFields] = useState<ReportField[]>([])
  const [saved, setSaved] = useState<ReportField[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  useEffect(() => {
    reportTemplateApi
      .get()
      .then((t) => {
        setFields(t.fields)
        setSaved(t.fields)
      })
      .catch(() => setError('Failed to load report template'))
      .finally(() => setLoading(false))
  }, [])

  const dirty = JSON.stringify(fields) !== JSON.stringify(saved)

  const toggle = (key: string) =>
    setFields((arr) =>
      arr.map((f) => (f.key === key ? { ...f, enabled: !f.enabled } : f)),
    )

  const handleDragStart = (index: number) => (e: React.DragEvent) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (index: number) => (e: React.DragEvent) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    setFields((arr) => {
      const next = [...arr]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(index, 0, moved)
      return next
    })
    setDragIndex(null)
  }

  const handleDragEnd = () => setDragIndex(null)

  const revert = () => setFields(saved)

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const result = await reportTemplateApi.update(
        fields.map((f) => ({ key: f.key, enabled: f.enabled })),
      )
      setFields(result.fields)
      setSaved(result.fields)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2500)
    } catch {
      setError('Failed to save report template')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="rb-loading">Loading…</p>

  return (
    <div className="report-builder">
      <div className="rb-intro">
        <FileCog size={18} />
        <div>
          <h3>Report Builder</h3>
          <p>
            Choose which details appear on generated patrol PDF reports, and
            drag items to change their order. Screenshots and checklist items
            are laid out side by side on each checkpoint — whichever you drag
            higher appears on the left.
          </p>
        </div>
      </div>

      {error && <div className="rb-error">{error}</div>}

      <div className="rb-list">
        {fields.map((f, i) => (
          <div
            key={f.key}
            className={`rb-row${dragIndex === i ? ' dragging' : ''}${
              f.enabled ? '' : ' disabled'
            }`}
            onDragOver={handleDragOver(i)}
            onDrop={handleDrop(i)}
          >
            <span
              className="rb-handle"
              draggable
              onDragStart={handleDragStart(i)}
              onDragEnd={handleDragEnd}
              title="Hold and drag to reorder"
            >
              <GripVertical size={16} />
            </span>

            <label className="rb-checkbox">
              <input
                type="checkbox"
                checked={f.enabled}
                onChange={() => toggle(f.key)}
              />
            </label>

            <div className="rb-info">
              <div className="rb-info-top">
                <strong>{f.label}</strong>
                <span className={`rb-group rb-group-${f.group}`}>
                  {f.group === 'summary' ? 'Report summary' : 'Per checkpoint'}
                </span>
              </div>
              <span className="rb-desc">{f.description}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="rb-actions">
        {dirty && (
          <button className="rb-revert" onClick={revert} disabled={saving}>
            <RotateCcw size={14} /> Discard changes
          </button>
        )}
        <button className="rb-save" onClick={save} disabled={!dirty || saving}>
          <Save size={14} /> {saving ? 'Saving…' : 'Save report layout'}
        </button>
        {savedFlash && <span className="rb-saved-flash">Saved</span>}
      </div>
    </div>
  )
}
