import { useEffect, useState } from 'react'
import {
  GripVertical,
  Save,
  RotateCcw,
  FileCog,
  X,
  Plus,
  Image,
  ListChecks,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react'
import type { ReportField } from '../lib/report-template'
import { reportTemplateApi } from '../lib/report-template'
import './ReportBuilder.css'

type DragSource = 'palette' | 'canvas'

// key -> {key, enabled, height} tuples, in order, for dirty-checking / saving
const toSnapshot = (list: ReportField[]) =>
  list.map((f) => ({ key: f.key, enabled: f.enabled, height: f.height }))

const MIN_HEIGHT = 50
const MAX_HEIGHT = 400

export default function ReportBuilder() {
  const [canvas, setCanvas] = useState<ReportField[]>([])
  const [palette, setPalette] = useState<ReportField[]>([])
  const [savedFields, setSavedFields] = useState<ReportField[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  const [dragKey, setDragKey] = useState<string | null>(null)
  const [dragFrom, setDragFrom] = useState<DragSource | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [paletteOver, setPaletteOver] = useState(false)

  const load = (fields: ReportField[]) => {
    setCanvas(fields.filter((f) => f.enabled))
    setPalette(fields.filter((f) => !f.enabled))
    setSavedFields(fields)
  }

  useEffect(() => {
    reportTemplateApi
      .get()
      .then((t) => load(t.fields))
      .catch(() => setError('Failed to load report template'))
      .finally(() => setLoading(false))
  }, [])

  const combinedNow = [
    ...canvas.map((f) => ({ ...f, enabled: true })),
    ...palette.map((f) => ({ ...f, enabled: false })),
  ]
  const dirty =
    JSON.stringify(toSnapshot(combinedNow)) !==
    JSON.stringify(toSnapshot(savedFields))

  const resetDrag = () => {
    setDragKey(null)
    setDragFrom(null)
    setOverIndex(null)
    setPaletteOver(false)
  }

  // ---- add / remove without drag, for accessibility & quick use ----
  const addToCanvas = (key: string) => {
    const item = palette.find((f) => f.key === key)
    if (!item) return
    setPalette((p) => p.filter((f) => f.key !== key))
    setCanvas((c) => [...c, { ...item, enabled: true }])
  }

  const removeFromCanvas = (key: string) => {
    const item = canvas.find((f) => f.key === key)
    if (!item) return
    setCanvas((c) => c.filter((f) => f.key !== key))
    setPalette((p) => [...p, { ...item, enabled: false }])
  }

  // ---- drag and drop ----
  const paletteDragStart = (key: string) => (e: React.DragEvent) => {
    setDragKey(key)
    setDragFrom('palette')
    e.dataTransfer.effectAllowed = 'move'
  }

  const canvasDragStart = (key: string) => (e: React.DragEvent) => {
    setDragKey(key)
    setDragFrom('canvas')
    e.dataTransfer.effectAllowed = 'move'
  }

  const blockDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setOverIndex(index)
  }

  const canvasContainerDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (overIndex === null) setOverIndex(canvas.length)
  }

  const canvasDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (!dragKey || !dragFrom) return
    const targetIndex = overIndex ?? canvas.length

    if (dragFrom === 'palette') {
      const item = palette.find((f) => f.key === dragKey)
      if (item) {
        setPalette((p) => p.filter((f) => f.key !== dragKey))
        setCanvas((c) => {
          const next = [...c]
          next.splice(targetIndex, 0, { ...item, enabled: true })
          return next
        })
      }
    } else {
      setCanvas((c) => {
        const fromIdx = c.findIndex((f) => f.key === dragKey)
        if (fromIdx === -1) return c
        const next = [...c]
        const [moved] = next.splice(fromIdx, 1)
        let insertAt = targetIndex
        if (fromIdx < insertAt) insertAt -= 1
        next.splice(insertAt, 0, moved)
        return next
      })
    }
    resetDrag()
  }

  const paletteDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setPaletteOver(true)
  }

  const paletteDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (dragFrom === 'canvas' && dragKey) {
      removeFromCanvas(dragKey)
    }
    resetDrag()
  }

  const resizeStart = (key: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const blockEl = (e.currentTarget as HTMLElement).closest(
      '.rb-block',
    ) as HTMLElement | null
    const previewEl = blockEl?.querySelector('.rb-preview') as HTMLElement | null
    const startY = e.clientY
    const startHeight = previewEl?.getBoundingClientRect().height ?? 70

    const onMove = (ev: MouseEvent) => {
      const next = Math.round(
        Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startHeight + (ev.clientY - startY))),
      )
      setCanvas((c) =>
        c.map((f) => (f.key === key ? { ...f, height: next } : f)),
      )
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const revert = () => load(savedFields)

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const result = await reportTemplateApi.update(toSnapshot(combinedNow))
      load(result.fields)
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
            Drag components from the left onto the page on the right to build
            your patrol report. Reorder blocks by dragging them up or down,
            drag the bottom edge of a block to resize it, and drag a block
            back to the panel (or hit ×) to remove it.
          </p>
        </div>
      </div>

      {error && <div className="rb-error">{error}</div>}

      <div className="rb-workspace">
        <div
          className={`rb-palette${paletteOver ? ' drag-over' : ''}`}
          onDragOver={paletteDragOver}
          onDragLeave={() => setPaletteOver(false)}
          onDrop={paletteDrop}
        >
          <div className="rb-palette-title">Components</div>
          {palette.length === 0 ? (
            <p className="rb-palette-empty">
              Everything is on the page. Drag a block back here to remove it.
            </p>
          ) : (
            <div className="rb-palette-list">
              {palette.map((f) => (
                <div
                  key={f.key}
                  className="rb-chip"
                  draggable
                  onDragStart={paletteDragStart(f.key)}
                  onDragEnd={resetDrag}
                >
                  <span className="rb-chip-handle">
                    <GripVertical size={14} />
                  </span>
                  <div className="rb-chip-info">
                    <div className="rb-chip-top">
                      <strong>{f.label}</strong>
                      <span className={`rb-group rb-group-${f.group}`}>
                        {f.group === 'summary' ? 'Summary' : 'Checkpoint'}
                      </span>
                    </div>
                    <span className="rb-chip-desc">{f.description}</span>
                  </div>
                  <button
                    className="rb-chip-add"
                    title="Add to page"
                    onClick={() => addToCanvas(f.key)}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          className="rb-canvas-wrap"
          onDragOver={canvasContainerDragOver}
          onDrop={canvasDrop}
        >
          <div className="rb-page">
            {canvas.length === 0 ? (
              <div className="rb-page-empty">
                Drag components here to build your report
              </div>
            ) : (
              canvas.map((f, i) => (
                <div key={f.key}>
                  {overIndex === i && dragKey !== f.key && (
                    <div className="rb-drop-line" />
                  )}
                  <div
                    className={`rb-block${dragKey === f.key ? ' dragging' : ''}`}
                    draggable
                    onDragStart={canvasDragStart(f.key)}
                    onDragEnd={resetDrag}
                    onDragOver={blockDragOver(i)}
                  >
                    <div className="rb-block-bar">
                      <span className="rb-block-handle">
                        <GripVertical size={14} />
                      </span>
                      <span className="rb-block-label">{f.label}</span>
                      <button
                        className="rb-block-remove"
                        title="Remove from page"
                        onClick={() => removeFromCanvas(f.key)}
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <BlockPreview fieldKey={f.key} height={f.height} />
                    <div
                      className="rb-resize-handle"
                      draggable={false}
                      onMouseDown={resizeStart(f.key)}
                      title="Drag to resize"
                    >
                      <span />
                    </div>
                  </div>
                </div>
              ))
            )}
            {overIndex === canvas.length && dragKey && (
              <div className="rb-drop-line" />
            )}
          </div>
        </div>
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

function BlockPreview({
  fieldKey,
  height,
}: {
  fieldKey: string
  height?: number
}) {
  const style = height ? { minHeight: height } : undefined

  switch (fieldKey) {
    case 'header':
      return (
        <div className="rb-preview rb-preview-header" style={style}>
          <div className="rb-logo-box" />
          <div className="rb-preview-lines">
            <span className="rb-bar rb-bar-title" />
            <span className="rb-bar rb-bar-w40" />
          </div>
        </div>
      )
    case 'issuesBanner':
      return (
        <div className="rb-preview rb-preview-banner" style={style}>
          <AlertTriangle size={15} />
          <span className="rb-bar rb-bar-w60 rb-bar-on-banner" />
        </div>
      )
    case 'screenshots':
      return (
        <div className="rb-preview rb-preview-shots" style={style}>
          <Image size={16} className="rb-shot-icon" />
          <Image size={16} className="rb-shot-icon" />
          <Image size={16} className="rb-shot-icon" />
        </div>
      )
    case 'checklistItems':
      return (
        <div className="rb-preview rb-preview-checklist" style={style}>
          <ListChecks size={14} className="rb-inline-icon" />
          <div className="rb-preview-lines">
            <span className="rb-bar rb-bar-w80" />
            <span className="rb-bar rb-bar-w60" />
            <span className="rb-bar rb-bar-w70" />
          </div>
        </div>
      )
    case 'comments':
      return (
        <div className="rb-preview rb-preview-comment" style={style}>
          <MessageSquare size={14} className="rb-inline-icon" />
          <div className="rb-preview-lines">
            <span className="rb-bar rb-bar-w90" />
            <span className="rb-bar rb-bar-w50" />
          </div>
        </div>
      )
    default:
      // site, route, operator, status, startTime, endTime, checkpointCount
      return (
        <div className="rb-preview rb-preview-field" style={style}>
          <span className="rb-bar rb-bar-w30" />
          <span className="rb-bar rb-bar-w40 rb-bar-value" />
        </div>
      )
  }
}