import { useEffect, useState } from 'react'
import {
  GripVertical,
  Save,
  RotateCcw,
  FileCog,
  X,
  LayoutTemplate,
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

export default function ReportBuilder() {
  const [rows, setRows] = useState<ReportField[][]>([])
  const [palette, setPalette] = useState<ReportField[]>([])
  const [savedSnapshot, setSavedSnapshot] = useState<ReportField[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [hover, setHover] = useState<HoverTarget>(null)

  useEffect(() => {
    reportTemplateApi
      .get()
      .then((t) => {
        setRows(t.fields.filter((f) => f.enabled).map((f) => [f]))
        setPalette(t.fields.filter((f) => !f.enabled))
        setSavedSnapshot(t.fields)
      })
      .catch(() => setError('Failed to load report template'))
      .finally(() => setLoading(false))
  }, [])

  const flatCanvas = rows.flat()
  const currentCombined = [...flatCanvas, ...palette]
  const dirty = JSON.stringify(currentCombined) !== JSON.stringify(savedSnapshot)

  const handleDragStart = (source: Drag) => (e: React.DragEvent) => {
    setDrag(source)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnd = () => {
    setDrag(null)
    setHover(null)
  }

  // Remove the dragged item from wherever it currently is, pruning any row
  // that becomes empty as a result. Returns the item plus the resulting
  // rows/palette, and -- if a canvas row was removed -- its index, so the
  // caller can shift a same-list drop target accordingly.
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

  // Drop directly onto a block: places the dragged item beside it (left or
  // right) in the same row -- this is the horizontal placement.
  const dropOnBlock = (targetRow: number, targetCol: number, side: 'left' | 'right') => {
    const extracted = extractDragged()
    if (!extracted) return
    let { rows: workingRows, palette: workingPalette, removedRowIndex } = extracted
    let row = targetRow
    if (drag?.from === 'canvas' && removedRowIndex !== -1 && removedRowIndex < row) {
      row -= 1
    }
    // if the item being removed was in the SAME row as the target and came
    // before it, the target's column shifts left by one
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
      i === row ? [...r.slice(0, insertAt), extracted.item, ...r.slice(insertAt)] : r,
    )
    setRows(nextRows)
    setPalette(workingPalette)
    setDrag(null)
    setHover(null)
  }

  // Drop into the gap before/after a row: creates a brand new row containing
  // just the dragged item -- this is the vertical placement.
  const dropInGap = (gapIndex: number) => {
    const extracted = extractDragged()
    if (!extracted) return
    let { rows: workingRows, palette: workingPalette, removedRowIndex } = extracted
    let at = gapIndex
    if (drag?.from === 'canvas' && removedRowIndex !== -1 && removedRowIndex < at) {
      at -= 1
    }
    const nextRows = [...workingRows.slice(0, at), [extracted.item], ...workingRows.slice(at)]
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

  const handleBlockDragOver = (row: number, col: number) => (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const side = e.clientX - rect.left < rect.width / 2 ? 'left' : 'right'
    setHover({ kind: 'block', row, col, side })
  }

  const handleBlockDrop = (row: number, col: number) => (e: React.DragEvent) => {
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

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const fields = [
        ...flatCanvas.map((f) => ({ key: f.key, enabled: true })),
        ...palette.map((f) => ({ key: f.key, enabled: false })),
      ]
      const result = await reportTemplateApi.update(fields)
      setRows(result.fields.filter((f) => f.enabled).map((f) => [f]))
      setPalette(result.fields.filter((f) => !f.enabled))
      setSavedSnapshot(result.fields)
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
            Drag components from the left onto the report page. Drop on the
            left or right half of an existing block to place it side by
            side; drop in the gap above or below a row to start a new row.
            Drag a block back to the sidebar to remove it.
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
                  {f.group === 'summary' ? 'Summary' : 'Checkpoint'}
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
                          {f.group === 'summary' ? 'Summary' : 'Checkpoint'}
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
                      hover?.kind === 'gap' && hover.row === rowIndex + 1 ? ' active' : ''
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