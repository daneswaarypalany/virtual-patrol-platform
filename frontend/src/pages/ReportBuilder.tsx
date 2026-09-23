import { useEffect, useState } from 'react'
import {
  GripVertical,
  Save,
  RotateCcw,
  FileCog,
  X,
  LayoutTemplate,
  Plus,
} from 'lucide-react'
import type { ReportField } from '../lib/report-template'
import { reportTemplateApi } from '../lib/report-template'
import './ReportBuilder.css'

type Drag =
  | { from: 'palette'; index: number }
  | { from: 'canvas'; row: number; col: number }

type HoverTarget =
  | { kind: 'block'; row: number; col: number; side: 'left' | 'right' }
  | { kind: 'gap'; row: number }
  | null

const GROUP_LABEL: Record<ReportField['group'], string> = {
  summary: 'Summary',
  checkpoint: 'Checkpoint',
}

export default function ReportBuilder({
  editTemplateId,
  onSaved,
}: {
  editTemplateId?: string
  onSaved?: () => void
}) {
  const [rows, setRows] = useState<ReportField[][]>([])
  const [palette, setPalette] = useState<ReportField[]>([])
  const [savedSnapshot, setSavedSnapshot] = useState<ReportField[]>([])
  const [templateName, setTemplateName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [hover, setHover] = useState<HoverTarget>(null)
  const [newName, setNewName] = useState('')
  const [showNameInput, setShowNameInput] = useState(false)
  const isEdit = !!editTemplateId

  useEffect(() => {
    setLoading(true)
    setError('')
    const fetch = editTemplateId
      ? reportTemplateApi.getById(editTemplateId)
      : reportTemplateApi.get()
    fetch
      .then((t) => {
        if (editTemplateId) {
          setRows(t.fields.filter((f) => f.enabled).map((f) => [f]))
          setPalette(t.fields.filter((f) => !f.enabled))
        } else {
          setRows([])
          setPalette(t.fields)
        }
        setSavedSnapshot(t.fields)
        setTemplateName(t.name ?? '')
      })
      .catch(() => setError('Failed to load report template'))
      .finally(() => setLoading(false))
  }, [editTemplateId])

  const flatCanvas = rows.flat()
  const currentCombined = [
    ...flatCanvas.map((f) => ({ ...f, enabled: true })),
    ...palette.map((f) => ({ ...f, enabled: false })),
  ]
  const dirty =
    JSON.stringify(currentCombined) !== JSON.stringify(savedSnapshot)

  const handleDragStart = (source: Drag) => (e: React.DragEvent) => {
    setDrag(source)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnd = () => {
    setDrag(null)
    setHover(null)
  }

  const extractDragged = (): {
    item: ReportField
    rows: ReportField[][]
    palette: ReportField[]
    removedRowIndex: number
  } | null => {
    if (!drag) return null
    if (drag.from === 'palette') {
      const item = palette[drag.index]
      if (!item) return null
      const nextPalette = palette.filter((_, i) => i !== drag.index)
      return { item, rows, palette: nextPalette, removedRowIndex: -1 }
    }
    const row = rows[drag.row]
    const item = row?.[drag.col]
    if (!item) return null
    const nextRow = row.filter((_, i) => i !== drag.col)
    const nextRows = rows.map((r, i) => (i === drag.row ? nextRow : r))
    let removedRowIndex = -1
    const prunedRows = nextRows.filter((r, i) => {
      if (r.length === 0) {
        removedRowIndex = i
        return false
      }
      return true
    })
    return { item, rows: prunedRows, palette, removedRowIndex }
  }

  const dropOnBlock = (
    targetRow: number,
    targetCol: number,
    side: 'left' | 'right',
  ) => {
    const extracted = extractDragged()
    if (!extracted) return
    let { rows: workingRows, palette: workingPalette, removedRowIndex } =
      extracted
    let row = targetRow
    if (
      drag?.from === 'canvas' &&
      removedRowIndex !== -1 &&
      removedRowIndex < row
    ) {
      row -= 1
    }
    let col = targetCol
    if (
      drag?.from === 'canvas' &&
      drag.row === targetRow &&
      removedRowIndex === -1 &&
      drag.col < targetCol
    ) {
      col -= 1
    }
    const insertAt = side === 'left' ? col : col + 1
    const nextRows = workingRows.map((r, i) =>
      i === row
        ? [...r.slice(0, insertAt), extracted.item, ...r.slice(insertAt)]
        : r,
    )
    setRows(nextRows)
    setPalette(workingPalette)
    setDrag(null)
    setHover(null)
  }

  const dropInGap = (gapIndex: number) => {
    const extracted = extractDragged()
    if (!extracted) return
    let { rows: workingRows, palette: workingPalette, removedRowIndex } =
      extracted
    let at = gapIndex
    if (
      drag?.from === 'canvas' &&
      removedRowIndex !== -1 &&
      removedRowIndex < at
    ) {
      at -= 1
    }
    const nextRows = [
      ...workingRows.slice(0, at),
      [extracted.item],
      ...workingRows.slice(at),
    ]
    setRows(nextRows)
    setPalette(workingPalette)
    setDrag(null)
    setHover(null)
  }

  const dropOnEmptyCanvas = () => {
    const extracted = extractDragged()
    if (!extracted) return
    setRows([[extracted.item]])
    setPalette(extracted.palette)
    setDrag(null)
    setHover(null)
  }

  const dropOnPalette = () => {
    const extracted = extractDragged()
    if (!extracted) return
    setRows(extracted.rows)
    setPalette([...extracted.palette, extracted.item])
    setDrag(null)
    setHover(null)
  }

  const handleBlockDragOver =
    (row: number, col: number) => (e: React.DragEvent) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      const rect = e.currentTarget.getBoundingClientRect()
      const side = e.clientX - rect.left < rect.width / 2 ? 'left' : 'right'
      setHover({ kind: 'block', row, col, side })
    }

  const handleBlockDrop =
    (row: number, col: number) => (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const rect = e.currentTarget.getBoundingClientRect()
      const side = e.clientX - rect.left < rect.width / 2 ? 'left' : 'right'
      dropOnBlock(row, col, side)
    }

  const handleGapDragOver = (gapIndex: number) => (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setHover({ kind: 'gap', row: gapIndex })
  }

  const handleGapDrop = (gapIndex: number) => (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dropInGap(gapIndex)
  }

  const removeFromCanvas = (row: number, col: number) => {
    const item = rows[row]?.[col]
    if (!item) return
    const nextRow = rows[row].filter((_, i) => i !== col)
    const nextRows = rows
      .map((r, i) => (i === row ? nextRow : r))
      .filter((r) => r.length > 0)
    setRows(nextRows)
    setPalette((arr) => [...arr, item])
  }

  const revert = () => {
    setRows(savedSnapshot.filter((f) => f.enabled).map((f) => [f]))
    setPalette(savedSnapshot.filter((f) => !f.enabled))
  }

  // edit mode: save back to the same template
  const saveEdit = async () => {
    setSaving(true)
    setError('')
    try {
      const fields = [
        ...flatCanvas.map((f) => ({ key: f.key, enabled: true })),
        ...palette.map((f) => ({ key: f.key, enabled: false })),
      ]
      const result = await reportTemplateApi.updateById(editTemplateId!, fields)
      setRows(result.fields.filter((f) => f.enabled).map((f) => [f]))
      setPalette(result.fields.filter((f) => !f.enabled))
      setSavedSnapshot(result.fields)
      setTemplateName(result.name)
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
      const fields = [
        ...flatCanvas.map((f) => ({ key: f.key, enabled: true })),
        ...palette.map((f) => ({ key: f.key, enabled: false })),
      ]
      const created = await reportTemplateApi.create(newName.trim())
      await reportTemplateApi.updateById(created.id, fields)
      setNewName('')
      setShowNameInput(false)
      setSavedFlash(true)
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
            {isEdit
              ? `Editing: ${templateName}`
              : 'Report Builder — New Template'}
          </h3>
          <p>
            {isEdit
              ? 'Edit this template. Changes are saved back to this template only — the default is never touched.'
              : 'Drag components onto the report page, then save as a new named template. The default template is never changed.'}
          </p>
        </div>
      </div>

      {error && <div className="rb-error">{error}</div>}

      <div className="rb-builder-layout">
        <div
          className="rb-palette"
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
          }}
          onDrop={(e) => {
            e.preventDefault()
            dropOnPalette()
          }}
        >
          <div className="rb-pane-head">Available Components</div>
          {palette.length === 0 ? (
            <p className="rb-empty-hint">
              All components are on the report page.
            </p>
          ) : (
            palette.map((f, i) => (
              <div
                key={f.key}
                className={`rb-chip${drag?.from === 'palette' && drag.index === i ? ' dragging' : ''}`}
                draggable
                onDragStart={handleDragStart({ from: 'palette', index: i })}
                onDragEnd={handleDragEnd}
              >
                <GripVertical size={14} />
                <div className="rb-chip-text">
                  <strong>{f.label}</strong>
                  <span>{f.description}</span>
                </div>
                <span className={`rb-group rb-group-${f.group}`}>
                  {GROUP_LABEL[f.group]}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="rb-canvas-wrap">
          <div className="rb-pane-head">Report Page</div>

          {rows.length === 0 ? (
            <div
              className="rb-canvas"
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(e) => {
                e.preventDefault()
                dropOnEmptyCanvas()
              }}
            >
              <div className="rb-canvas-empty">
                <LayoutTemplate size={28} />
                <p>Drag components here to build your report layout</p>
              </div>
            </div>
          ) : (
            <div className="rb-canvas rb-canvas-filled">
              <div
                className={`rb-gap${hover?.kind === 'gap' && hover.row === 0 ? ' active' : ''}`}
                onDragOver={handleGapDragOver(0)}
                onDrop={handleGapDrop(0)}
                onDragLeave={() => setHover(null)}
              />
              {rows.map((row, rowIndex) => (
                <div key={rowIndex}>
                  <div className="rb-row-wrap">
                    {row.map((f, colIndex) => (
                      <div
                        key={f.key}
                        className={`rb-block${
                          drag?.from === 'canvas' &&
                          drag.row === rowIndex &&
                          drag.col === colIndex
                            ? ' dragging'
                            : ''
                        }${
                          hover?.kind === 'block' &&
                          hover.row === rowIndex &&
                          hover.col === colIndex
                            ? ` hover-${hover.side}`
                            : ''
                        }`}
                        draggable
                        onDragStart={handleDragStart({
                          from: 'canvas',
                          row: rowIndex,
                          col: colIndex,
                        })}
                        onDragEnd={handleDragEnd}
                        onDragOver={handleBlockDragOver(rowIndex, colIndex)}
                        onDrop={handleBlockDrop(rowIndex, colIndex)}
                      >
                        <span className="rb-block-handle">
                          <GripVertical size={15} />
                        </span>
                        <div className="rb-block-text">
                          <strong>{f.label}</strong>
                          <span>{f.description}</span>
                        </div>
                        <span className={`rb-group rb-group-${f.group}`}>
                          {GROUP_LABEL[f.group]}
                        </span>
                        <button
                          className="rb-block-remove"
                          onClick={() => removeFromCanvas(rowIndex, colIndex)}
                          title="Remove from report"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div
                    className={`rb-gap${
                      hover?.kind === 'gap' && hover.row === rowIndex + 1
                        ? ' active'
                        : ''
                    }`}
                    onDragOver={handleGapDragOver(rowIndex + 1)}
                    onDrop={handleGapDrop(rowIndex + 1)}
                    onDragLeave={() => setHover(null)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rb-actions">
        {isEdit ? (
          <>
            {dirty && (
              <button className="rb-revert" onClick={revert} disabled={saving}>
                <RotateCcw size={14} /> Discard changes
              </button>
            )}
            <button
              className="rb-save"
              onClick={saveEdit}
              disabled={!dirty || saving}
            >
              <Save size={14} /> {saving ? 'Saving…' : 'Save changes'}
            </button>
          </>
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