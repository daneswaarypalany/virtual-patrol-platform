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

// key -> {key, enabled, height, width} tuples, in order, for dirty-checking / saving
const toSnapshot = (list: ReportField[]) =>
  list.map((f) => ({
    key: f.key,
    enabled: f.enabled,
    height: f.height,
    width: f.width,
  }))

const MIN_HEIGHT = 50
const MAX_HEIGHT = 400
const MIN_WIDTH = 25
const MAX_WIDTH = 100

export default function ReportBuilder({
  editTemplateId,
  onSaved,
}: {
  editTemplateId?: string
  onSaved?: () => void
}) {
  const [canvas, setCanvas] = useState<ReportField[]>([])
  const [palette, setPalette] = useState<ReportField[]>([])
  const [savedFields, setSavedFields] = useState<ReportField[]>([])
  const [templateName, setTemplateName] = useState('')
  const [newName, setNewName] = useState('')
  const [showNameInput, setShowNameInput] = useState(false)
  const isEdit = !!editTemplateId
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
    setLoading(true)
    reportTemplateApi
      .get(editTemplateId)
      .then((t) => {
        load(t.fields)
        setTemplateName(t.name)
      })
      .catch(() => setError('Failed to load report template'))
      .finally(() => setLoading(false))
  }, [editTemplateId])

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

  // ---- vertical (height) resize ----
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

  // ---- horizontal (width) resize ----
  const widthResizeStart = (key: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const wrapEl = (e.currentTarget as HTMLElement).closest(
      '.rb-block-wrap',
    ) as HTMLElement | null
    const pageEl = wrapEl?.closest('.rb-page') as HTMLElement | null
    const startX = e.clientX
    const startW = wrapEl?.getBoundingClientRect().width ?? 300
    const pageW = pageEl?.getBoundingClientRect().width ?? 600

    const onMove = (ev: MouseEvent) => {
      const pxWidth = startW + (ev.clientX - startX)
      let pct = Math.round((pxWidth / pageW) * 100)
      pct = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, pct))
      setCanvas((c) =>
        c.map((f) => (f.key === key ? { ...f, width: pct } : f)),
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

  // edit mode: save back to the same template
  const saveEdit = async () => {
    setSaving(true)
    setError('')
    try {
      await reportTemplateApi.updateById(editTemplateId!, toSnapshot(combinedNow))
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2500)
      onSaved?.()
    } catch {
      setError('Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  // create mode: make a new named template from the built layout
  const saveAsNew = async () => {
    if (!newName.trim()) return
    setSaving(true)
    setError('')
    try {
      const created = await reportTemplateApi.create(newName.trim())
      await reportTemplateApi.updateById(created.id, toSnapshot(combinedNow))
      setSavedFlash(true)
      setNewName('')
      setShowNameInput(false)
      setTimeout(() => setSavedFlash(false), 2500)
      onSaved?.()
    } catch {
      setError('Failed to create template')
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
          <h3>
            {isEdit ? `Editing: ${templateName}` : 'Report Builder — New Template'}
          </h3>
          <p>
            Drag components from the left onto the page on the right to build
            your patrol report. Reorder blocks by dragging them, drag the
            bottom edge to resize height and the right edge to resize width,
            and drag a block back to the panel (or hit ×) to remove it.
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
                <div
                  key={f.key}
                  className="rb-block-wrap"
                  style={{ width: `${f.width ?? 100}%` }}
                >
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
                      title="Drag to resize height"
                    >
                      <span />
                    </div>
                    <div
                      className="rb-resize-handle-x"
                      draggable={false}
                      onMouseDown={widthResizeStart(f.key)}
                      title="Drag to resize width"
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
        {isEdit ? (
          <button
            className="rb-save"
            onClick={saveEdit}
            disabled={!dirty || saving}
          >
            <Save size={14} /> {saving ? 'Saving…' : 'Save changes'}
          </button>
        ) : showNameInput ? (
          <div className="rb-name-row">
            <input
              autoFocus
              className="rb-name-input"
              placeholder="Template name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveAsNew()}
            />
            <button
              className="rb-save"
              onClick={saveAsNew}
              disabled={!newName.trim() || saving}
            >
              <Save size={14} /> {saving ? 'Creating…' : 'Create template'}
            </button>
            <button
              className="rb-revert"
              onClick={() => {
                setShowNameInput(false)
                setNewName('')
              }}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button className="rb-save" onClick={() => setShowNameInput(true)}>
            <Plus size={14} /> Save as new template
          </button>
        )}
        {savedFlash && (
          <span className="rb-saved-flash">
            {isEdit ? 'Saved' : 'Template created'}
          </span>
        )}
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