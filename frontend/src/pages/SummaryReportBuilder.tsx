import { useEffect, useState } from 'react'
import {
  GripVertical,
  Eye,
  Save,
  RotateCcw,
  BarChart3,
  X,
  LayoutTemplate,
  Plus,
} from 'lucide-react'
import type { SummaryReportField } from '../lib/summary-report-template'
import { summaryReportTemplateApi } from '../lib/summary-report-template'
import BuilderResizeFrame from '../components/BuilderResizeFrame'
import BuilderTemplatePreview from '../components/BuilderTemplatePreview'
import SearchableSelect from '../components/SearchableSelect'
import './ReportBuilder.css'

type Drag =
  | { from: 'palette'; index: number }
  | { from: 'newBlock' }
  | { from: 'canvas'; row: number; col: number }

type HoverTarget =
  | { kind: 'block'; row: number; col: number; side: 'left' | 'right' }
  | { kind: 'gap'; row: number }
  | null

const isBlock = (f: SummaryReportField) => f.key.startsWith('block-')

// Text / Divider / Spacer can be added any number of times, so it is a
// permanent palette entry that creates a new copy (own key) on every drop.
const newBlock = (): SummaryReportField => ({
  key: `block-${(Math.random().toString(36) + '00000000').slice(2, 10)}`,
  label: 'Text / Divider / Spacer',
  description: 'Free text, a divider line or blank space',
  group: 'overview',
  enabled: true,
  variant: 'text',
  text: '',
})

const VARIANT_LABEL = {
  text: 'Text',
  divider: 'Divider',
  spacer: 'Spacer',
} as const

const GROUP_LABEL: Record<SummaryReportField['group'], string> = {
  overview: 'Overview',
  chart: 'Chart',
  table: 'Table',
}

export default function SummaryReportBuilder({
  templateId,
  onSaved,
}: {
  templateId?: string
  onSaved?: () => void
}) {
  const [rows, setRows] = useState<SummaryReportField[][]>([])
  const [palette, setPalette] = useState<SummaryReportField[]>([])
  const [savedSnapshot, setSavedSnapshot] = useState<SummaryReportField[]>([])
  const [templateName, setTemplateName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [editingBlock, setEditingBlock] = useState<string | null>(null)
  const [hover, setHover] = useState<HoverTarget>(null)
  const [openOptionPanels, setOpenOptionPanels] = useState<Record<string, boolean>>({
    header: true,
  })
  const [newName, setNewName] = useState('')
  const [showNameInput, setShowNameInput] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [resizing, setResizing] = useState<{ row: number; col: number } | null>(
    null,
  )
  const isEdit = !!templateId

  // Saved fields come back as a flat, row-major list (row index attached
  // to each field by saveEdit/saveAsNew). Group consecutive same-row
  // fields back into the rows[][] shape the canvas uses. A field saved
  // before `row` existed has row === undefined, so it falls back to its
  // own row — matching the old one-field-per-row behavior.
  const groupIntoRows = (
    fields: SummaryReportField[],
  ): SummaryReportField[][] => {
    const grouped: SummaryReportField[][] = []
    let lastRow: number | undefined
    for (const f of fields) {
      if (f.row !== undefined && f.row === lastRow && grouped.length) {
        grouped[grouped.length - 1].push(f)
      } else {
        grouped.push([f])
      }
      lastRow = f.row
    }
    return grouped
  }

  useEffect(() => {
    setLoading(true)
    summaryReportTemplateApi
      .get(templateId)
      .then((t) => {
        setRows(groupIntoRows(t.fields.filter((f) => f.enabled)))
        setPalette(t.fields.filter((f) => !f.enabled))
        setSavedSnapshot(t.fields)
        setTemplateName(t.name)
      })
      .catch(() => setError('Failed to load summary report layout'))
      .finally(() => setLoading(false))
  }, [templateId])

  const flatCanvasWithRow = rows.flatMap((r, ri) =>
    r.map((f) => ({ ...f, row: ri })),
  )
  const currentCombined = [
    ...flatCanvasWithRow.map((f) => ({ ...f, enabled: true })),
    ...palette.map((f) => ({ ...f, enabled: false })),
  ]
  const dirty = JSON.stringify(currentCombined) !== JSON.stringify(savedSnapshot)

  const updateComponentOption = (
    fieldKey: string,
    optionKey: string,
    checked: boolean,
  ) => {
    const updateField = (field: SummaryReportField): SummaryReportField =>
      field.key === fieldKey
        ? { ...field, options: { ...(field.options ?? {}), [optionKey]: checked } }
        : field
    setRows((current) => current.map((row) => row.map(updateField)))
    setPalette((current) => current.map(updateField))
  }

  const renderComponentOptions = (field: SummaryReportField) => {
    if (!field.items?.length) return null
    const enabledCount = field.items.filter(
      (item) => field.options?.[item.key] !== false,
    ).length
    return (
      <details
        className="rb-component-options"
        open={openOptionPanels[field.key] ?? false}
        onToggle={(e) => {
          const isOpen = e.currentTarget.open
          setOpenOptionPanels((current) =>
            current[field.key] === isOpen
              ? current
              : { ...current, [field.key]: isOpen },
          )
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <summary>
          <span>Report content</span>
          <span className="rb-options-count">{enabledCount}/{field.items.length}</span>
        </summary>
        <div className="rb-item-option-list">
          {field.items.map((item) => (
            <label className="rb-item-option" key={item.key}>
              <input
                type="checkbox"
                checked={field.options?.[item.key] !== false}
                onChange={(e) =>
                  updateComponentOption(field.key, item.key, e.target.checked)
                }
                aria-label={`Include ${item.label} in ${field.label}`}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      </details>
    )
  }

  const handleDragStart = (source: Drag) => (e: React.DragEvent) => {
    setDrag(source)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleComponentDragStart = (source: Drag) => (e: React.DragEvent) => {
    if (e.target instanceof Element && e.target.closest('.rb-component-options')) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    handleDragStart(source)(e)
  }

  const handleDragEnd = () => {
    setDrag(null)
    setHover(null)
  }

  const extractDragged = (): {
    item: SummaryReportField
    rows: SummaryReportField[][]
    palette: SummaryReportField[]
    removedRowIndex: number
  } | null => {
    if (!drag) return null
    if (drag.from === 'newBlock') {
      return { item: newBlock(), rows, palette, removedRowIndex: -1 }
    }
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

  const dropOnBlock = (targetRow: number, targetCol: number, side: 'left' | 'right') => {
    const extracted = extractDragged()
    if (!extracted) return
    let { rows: workingRows, palette: workingPalette, removedRowIndex } = extracted
    let row = targetRow
    if (drag?.from === 'canvas' && removedRowIndex !== -1 && removedRowIndex < row) {
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
      i === row ? [...r.slice(0, insertAt), extracted.item, ...r.slice(insertAt)] : r,
    )
    setRows(nextRows)
    setPalette(workingPalette)
    setDrag(null)
    setHover(null)
  }

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
    setPalette(
      isBlock(extracted.item)
        ? extracted.palette
        : [...extracted.palette, extracted.item],
    )
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
    if (!isBlock(item)) setPalette((arr) => [...arr, item])
  }

  // edit a Text / Divider / Spacer copy in place
  const updateBlock = (
    row: number,
    col: number,
    patch: Partial<SummaryReportField>,
  ) =>
    setRows((prev) =>
      prev.map((r, ri) =>
        ri === row
          ? r.map((f, ci) => (ci === col ? { ...f, ...patch } : f))
          : r,
      ),
    )

  // Resize a block's width (% of its row) and/or height (px). `mode`
  // decides which axis the drag controls. Width is stored as a share of
  // the row so other blocks in the row keep filling the remaining space.
  const startResize =
    (row: number, col: number, mode: 'e' | 's' | 'se') =>
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const blockEl = (e.currentTarget as HTMLElement).closest(
        '.rb-block',
      ) as HTMLElement | null
      const rowEl = blockEl?.closest('.rb-row-wrap') as HTMLElement | null
      if (!blockEl || !rowEl) return
      const startX = e.clientX
      const startY = e.clientY
      const startWidthPx = blockEl.getBoundingClientRect().width
      const startHeightPx = blockEl.getBoundingClientRect().height
      const rowWidthPx = rowEl.getBoundingClientRect().width
      setResizing({ row, col })

      const onMove = (ev: MouseEvent) => {
        setRows((prev) => {
          const field = prev[row]?.[col]
          if (!field) return prev
          const next = { ...field }
          if (mode === 'e' || mode === 'se') {
            const widthPx = startWidthPx + (ev.clientX - startX)
            const pct = Math.round((widthPx / rowWidthPx) * 100)
            next.width = Math.min(100, Math.max(10, pct))
          }
          if (mode === 's' || mode === 'se') {
            const heightPx = startHeightPx + (ev.clientY - startY)
            next.height = Math.min(1000, Math.max(20, Math.round(heightPx)))
          }
          return prev.map((r, ri) =>
            ri === row ? r.map((f, ci) => (ci === col ? next : f)) : r,
          )
        })
      }
      const onUp = () => {
        setResizing(null)
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }


  // Panel groups are nested in two levels: rows stack vertically, while the
  // fields inside each row form a horizontal resizable group. The percentages
  // are normalised so the editor, preview and generated PDF share one layout.
  const getRowWidthShares = (row: { width?: number }[]) => {
    if (!row.length) return [] as number[]
    const used = row.reduce((sum, field) => sum + (field.width ?? 0), 0)
    const missing = row.filter((field) => field.width == null).length
    const fallback = missing ? Math.max(10, (100 - used) / missing) : 0
    const raw = row.map((field) => field.width ?? fallback)
    const total = raw.reduce((sum, value) => sum + value, 0) || 100
    return raw.map((value) => (value / total) * 100)
  }

  const getRowGridTemplate = (row: { width?: number }[]) =>
    getRowWidthShares(row)
      .map((share, index) => `minmax(0, ${share}fr)${index < row.length - 1 ? ' 14px' : ''}`)
      .join(' ')

  const startColumnDividerResize =
    (rowIndex: number, dividerIndex: number) => (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      const row = rows[rowIndex]
      const rowElement = event.currentTarget.closest('.rb-row-wrap') as HTMLElement | null
      if (!row || !rowElement || !row[dividerIndex + 1]) return

      const initialShares = getRowWidthShares(row)
      const pairTotal = initialShares[dividerIndex] + initialShares[dividerIndex + 1]
      const availableWidth = Math.max(1, rowElement.getBoundingClientRect().width - (row.length - 1) * 14)
      const startX = event.clientX
      const initialCursor = document.body.style.cursor
      const initialSelection = document.body.style.userSelect
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const onMove = (moveEvent: MouseEvent) => {
        const delta = ((moveEvent.clientX - startX) / availableWidth) * 100
        const minShare = Math.min(10, pairTotal / 2)
        const leftShare = Math.min(pairTotal - minShare, Math.max(minShare, initialShares[dividerIndex] + delta))
        const nextShares = [...initialShares]
        nextShares[dividerIndex] = leftShare
        nextShares[dividerIndex + 1] = pairTotal - leftShare
        const rounded = nextShares.map((value) => Math.round(value))
        rounded[rounded.length - 1] += 100 - rounded.reduce((sum, value) => sum + value, 0)

        setRows((current) => current.map((currentRow, index) =>
          index === rowIndex
            ? currentRow.map((field, colIndex) => ({ ...field, width: rounded[colIndex] }))
            : currentRow,
        ))
      }
      const onUp = () => {
        document.body.style.cursor = initialCursor
        document.body.style.userSelect = initialSelection
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }

  const startRowDividerResize =
    (rowIndex: number) => (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      const canvas = event.currentTarget.closest('.rb-canvas-filled') as HTMLElement | null
      const rowElements = canvas ? Array.from(canvas.querySelectorAll<HTMLElement>('.rb-row-wrap')) : []
      const topElement = rowElements[rowIndex]
      const bottomElement = rowElements[rowIndex + 1]
      const topRow = rows[rowIndex]
      const bottomRow = rows[rowIndex + 1]
      if (!topElement || !bottomElement || !topRow || !bottomRow) return

      const measuredTop = Math.round(topElement.getBoundingClientRect().height)
      const measuredBottom = Math.round(bottomElement.getBoundingClientRect().height)
      const topHeight = Math.max(80, ...topRow.map((field) => field.height ?? measuredTop))
      const bottomHeight = Math.max(80, ...bottomRow.map((field) => field.height ?? measuredBottom))
      const combinedHeight = topHeight + bottomHeight
      const startY = event.clientY
      const initialCursor = document.body.style.cursor
      const initialSelection = document.body.style.userSelect
      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'

      const onMove = (moveEvent: MouseEvent) => {
        const nextTop = Math.min(combinedHeight - 80, Math.max(80, topHeight + moveEvent.clientY - startY))
        const nextBottom = combinedHeight - nextTop
        setRows((current) => current.map((currentRow, index) => {
          if (index === rowIndex) return currentRow.map((field) => ({ ...field, height: Math.round(nextTop) }))
          if (index === rowIndex + 1) return currentRow.map((field) => ({ ...field, height: Math.round(nextBottom) }))
          return currentRow
        }))
      }
      const onUp = () => {
        document.body.style.cursor = initialCursor
        document.body.style.userSelect = initialSelection
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }

  const revert = () => {
    setRows(groupIntoRows(savedSnapshot.filter((f) => f.enabled)))
    setPalette(savedSnapshot.filter((f) => !f.enabled))
  }

  // edit mode: save back to the same template
  const saveEdit = async () => {
    setSaving(true)
    setError('')
    try {
      const fields = [
        ...flatCanvasWithRow.map((f) => ({
          key: f.key,
          enabled: true,
          height: f.height,
          width: f.width,
          row: f.row,
          options: f.options,
          variant: f.variant,
          text: f.text,
        })),
        ...palette.map((f) => ({ key: f.key, enabled: false, options: f.options })),
      ]
      const result = await summaryReportTemplateApi.updateById(templateId!, fields)
      setRows(groupIntoRows(result.fields.filter((f) => f.enabled)))
      setPalette(result.fields.filter((f) => !f.enabled))
      setSavedSnapshot(result.fields)
      setTemplateName(result.name)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2500)
      onSaved?.()
    } catch {
      setError('Failed to save summary report layout')
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
        ...flatCanvasWithRow.map((f) => ({
          key: f.key,
          enabled: true,
          height: f.height,
          width: f.width,
          row: f.row,
          options: f.options,
          variant: f.variant,
          text: f.text,
        })),
        ...palette.map((f) => ({ key: f.key, enabled: false, options: f.options })),
      ]
      const created = await summaryReportTemplateApi.create(newName.trim())
      await summaryReportTemplateApi.updateById(created.id, fields)
      setNewName('')
      setShowNameInput(false)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2500)
      onSaved?.()
    } catch {
      setError('Failed to create summary template')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="rb-loading">Loading…</p>

  return (
    <>
    <BuilderResizeFrame>
      <div className="rb-intro">
        <BarChart3 size={18} />
        <div>
          <h3>
            {isEdit
              ? `Editing: ${templateName}`
              : 'Summary Report Builder — New Template'}
          </h3>
          <p>
            {isEdit
              ? 'Edit the layout for this summary template. Changes are saved back to this template only.'
              : 'Drag sections from the left onto the summary page, then save as a new named template. The default template is not affected.'}
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
          <div className="rb-pane-head">Available Sections</div>
          {palette.length === 0 ? (
            <p className="rb-empty-hint">
              All sections are on the summary page.
            </p>
          ) : (
            palette.map((f, i) => (
              <div
                key={f.key}
                className={`rb-chip${drag?.from === 'palette' && drag.index === i ? ' dragging' : ''}`}
                draggable
                onDragStart={handleComponentDragStart({ from: 'palette', index: i })}
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
                {renderComponentOptions(f)}
              </div>
            ))
          )}
          <div
            className={`rb-chip${drag?.from === 'newBlock' ? ' dragging' : ''}`}
            draggable
            onDragStart={handleDragStart({ from: 'newBlock' })}
            onDragEnd={handleDragEnd}
          >
            <GripVertical size={14} />
            <div className="rb-chip-text">
              <strong>Text / Divider / Spacer</strong>
              <span>Free text, a divider or blank space — add as many as you need</span>
            </div>
            <span className="rb-group rb-group-overview">Layout</span>
          </div>
        </div>

        <div className="rb-canvas-wrap">
          <div className="rb-pane-head rb-pane-head-with-hint">Summary Page <span>Arrange sections in rows · Drag divider handles to resize</span></div>

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
                <p>Drag sections here to build the summary layout</p>
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
                <div key={rowIndex} className="rb-row-item">
                  <div className="rb-row-wrap" style={{ gridTemplateColumns: getRowGridTemplate(row) }}>
                    {row.flatMap((f, colIndex) => {
                      const block = (
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
                        }${
                          resizing?.row === rowIndex && resizing.col === colIndex
                            ? ' resizing'
                            : ''
                        }`}
                        style={{
                          gridColumn: `${colIndex * 2 + 1}`,
                          gridRow: 1,
                          minHeight: f.height ? `${f.height}px` : undefined,
                        }}
                        draggable={editingBlock !== f.key}
                        onDragStart={handleComponentDragStart({
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
                        {isBlock(f) ? (
                          <div
                            className="rb-block-editor"
                            // while the user is typing/selecting inside the
                            // block it must not act as a drag source
                            onMouseDown={() => setEditingBlock(f.key)}
                            onBlur={() => setEditingBlock(null)}
                          >
                            <SearchableSelect
                              className="rb-variant-select"
                              ariaLabel="Text block style"
                              value={f.variant ?? 'text'}
                              onChange={(value) => {
                                const variant = value as keyof typeof VARIANT_LABEL
                                updateBlock(rowIndex, colIndex, {
                                  variant,
                                  height:
                                    variant === 'spacer'
                                      ? (f.height ?? 40)
                                      : f.height,
                                })
                              }}
                              searchable={false}
                              options={(Object.keys(VARIANT_LABEL) as Array<keyof typeof VARIANT_LABEL>).map((variant) => ({
                                value: variant,
                                label: VARIANT_LABEL[variant],
                              }))}
                            />
                            {(f.variant ?? 'text') === 'text' && (
                              <textarea
                                value={f.text ?? ''}
                                maxLength={2000}
                                rows={2}
                                placeholder="Type the text to show in the report…"
                                onChange={(e) =>
                                  updateBlock(rowIndex, colIndex, {
                                    text: e.target.value,
                                  })
                                }
                              />
                            )}
                            {f.variant === 'divider' && (
                              <hr className="rb-block-divider" />
                            )}
                            {f.variant === 'spacer' && (
                              <span className="rb-block-hint">
                                Blank space — drag the bottom edge to set its height
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="rb-block-text">
                            <strong>{f.label}</strong>
                            <span>{f.description}</span>
                          </div>
                        )}
                        {!isBlock(f) && renderComponentOptions(f)}
                        <span className={`rb-group rb-group-${f.group}`}>
                          {isBlock(f) ? 'Layout' : GROUP_LABEL[f.group]}
                        </span>
                        <span className="rb-block-dimensions" title="Approximate template panel dimensions">
                          W {Math.round(getRowWidthShares(row)[colIndex])}% · H {f.height ? `${f.height}px` : 'Auto'}
                        </span>
                        <button
                          className="rb-block-remove"
                          onClick={() => removeFromCanvas(rowIndex, colIndex)}
                          title="Remove from summary"
                        >
                          <X size={14} />
                        </button>
                        <div
                          className="rb-resize-s"
                          draggable={false}
                          onMouseDown={startResize(rowIndex, colIndex, 's')}
                          title="Drag to set minimum panel height"
                        />
                      </div>
                      )
                      return colIndex < row.length - 1
                      ? [
                          block,
                          <div
                            key={`split-${f.key}`}
                            className="rb-panel-divider rb-panel-divider-vertical"
                            style={{ gridColumn: `${colIndex * 2 + 2}`, gridRow: 1 }}
                            role="separator"
                            aria-orientation="vertical"
                            aria-label={`Resize between ${f.label} and ${row[colIndex + 1]?.label ?? 'next panel'}`}
                            title="Drag to resize adjacent panels"
                            onMouseDown={startColumnDividerResize(rowIndex, colIndex)}
                          ><span /></div>,
                        ]
                      : [block]
                    })}
                  </div>
                  {rowIndex < rows.length - 1 && (
                    <div
                      className="rb-panel-divider rb-panel-divider-horizontal"
                      role="separator"
                      aria-orientation="horizontal"
                      aria-label={`Resize rows ${rowIndex + 1} and ${rowIndex + 2}`}
                      title="Drag to resize the height of adjacent rows"
                      onMouseDown={startRowDividerResize(rowIndex)}
                    ><span /></div>
                  )}
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
        <button type="button" className="rb-preview-button" onClick={() => setShowPreview(true)}>
          <Eye size={14} /> Preview
        </button>
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
    </BuilderResizeFrame>
    {showPreview && (
      <BuilderTemplatePreview
        kind="summary"
        templateName={templateName || newName || 'Summary Report Template'}
        rows={rows}
        onClose={() => setShowPreview(false)}
      />
    )}
    </>
  )
}