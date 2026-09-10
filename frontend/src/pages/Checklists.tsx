import { useEffect, useState } from 'react'
import { Search, GripVertical } from 'lucide-react'
import type { ChecklistTemplate, ChecklistInput } from '../lib/checklists'
import { checklistsApi } from '../lib/checklists'
import './Checklists.css'
import SearchableSelect from '../components/SearchableSelect'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const MAX_ITEMS = 10

type SortKey = 'name' | 'mostUsed' | 'newest'
type UsageFilter = 'all' | 'used' | 'unused'

export default function Checklists() {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<ChecklistTemplate | null>(null)
  const [showForm, setShowForm] = useState(false)

  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [usage, setUsage] = useState<UsageFilter>('all')
  const [category, setCategory] = useState('all')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setTemplates(await checklistsApi.list())
    } catch {
      setError('Failed to load checklist templates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const openCreate = () => {
    setEditing(null)
    setShowForm(true)
  }

  const openEdit = (t: ChecklistTemplate) => {
    setEditing(t)
    setShowForm(true)
  }

  const remove = async (t: ChecklistTemplate) => {
    if (t._count && t._count.checkpoints > 0) {
      alert(
        `"${t.name}" is used by ${t._count.checkpoints} checkpoint(s) and can't be deleted. Remove it from those routes first.`,
      )
      return
    }
    if (!window.confirm(`Delete checklist "${t.name}"?`)) return
    try {
      await checklistsApi.remove(t.id)
      load()
    } catch {
      setError('Failed to delete template (it may be in use by a route)')
    }
  }

  // Unique categories present in the data (for the filter dropdown)
  const categories = Array.from(
    new Set(templates.map((t) => t.category).filter(Boolean)),
  ) as string[]

  const visible = templates
    .filter((t) => {
      const q = search.toLowerCase()
      const matchesSearch =
        t.name.toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q)
      const used = (t._count?.checkpoints ?? 0) > 0
      const matchesUsage =
        usage === 'all' ||
        (usage === 'used' && used) ||
        (usage === 'unused' && !used)
      const matchesCategory = category === 'all' || t.category === category
      return matchesSearch && matchesUsage && matchesCategory
    })
    .sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name)
      if (sortKey === 'mostUsed')
        return (b._count?.checkpoints ?? 0) - (a._count?.checkpoints ?? 0)
      // newest — assumes list came back newest-first already; keep stable
      return 0
    })

  return (
    <div className="checklists-page">
      <div className="checklists-toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <Search size={16} className="search-icon" />
            <input
              placeholder="Search templates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="cl-select-w">
            <SearchableSelect
              value={sortKey}
              onChange={(v) => setSortKey(v as SortKey)}
              searchable={false}
              options={[
                { value: 'name', label: 'Sort: Name' },
                { value: 'mostUsed', label: 'Sort: Most used' },
                { value: 'newest', label: 'Sort: Newest' },
              ]}
            />
          </div>

          <div className="cl-select-w">
            <SearchableSelect
              value={usage}
              onChange={(v) => setUsage(v as UsageFilter)}
              searchable={false}
              options={[
                { value: 'all', label: 'All' },
                { value: 'used', label: 'In use' },
                { value: 'unused', label: 'Unused' },
              ]}
            />
          </div>

          {categories.length > 0 && (
            <div className="cl-select-w">
              <SearchableSelect
                value={category}
                onChange={(v) => setCategory(v)}
                placeholder="All categories"
                options={[
                  { value: 'all', label: 'All categories' },
                  ...categories.map((c) => ({ value: c, label: c })),
                ]}
              />
            </div>
          )}
        </div>

        <button className="btn-primary" onClick={openCreate}>
          + New Template
        </button>
      </div>

      <p className="checklists-count">
        {visible.length} of {templates.length} templates
      </p>

      {error && <div className="checklists-error">{error}</div>}

      {loading ? (
        <p className="checklists-loading">Loading…</p>
      ) : templates.length === 0 ? (
        <div className="checklists-empty">
          <p>No checklist templates yet. Create one to use in your routes.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="checklists-empty">
          <p>No templates match your search or filters.</p>
        </div>
      ) : (
        <div className="checklists-grid">
          {visible.map((t) => (
            <div key={t.id} className="checklist-card">
              <div className="checklist-card-head">
                <div>
                  <h3>{t.name}</h3>
                  {t.category && (
                    <span className="category-tag">{t.category}</span>
                  )}
                </div>
                <span className="usage-badge">
                  {t._count?.checkpoints ?? 0} in use
                </span>
              </div>
              {t.description && (
                <p className="checklist-desc">{t.description}</p>
              )}
              <div className="checklist-items">
                {t.items.map((item) => (
                  <div key={item.id} className="checklist-item-row">
                    <span className="item-circle" />
                    <span className="item-label">{item.label}</span>
                  </div>
                ))}
              </div>
              <div className="checklist-card-actions">
                <button onClick={() => openEdit(t)}>Edit</button>
                <button className="danger" onClick={() => remove(t)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ChecklistModal
          template={editing}
          allTemplates={templates}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function ChecklistModal({
  template,
  allTemplates,
  onClose,
  onSaved,
}: {
  template: ChecklistTemplate | null
  allTemplates: ChecklistTemplate[]
  onClose: () => void
  onSaved: () => void
}) {
  const [duplicateFromId, setDuplicateFromId] = useState('')
  const [name, setName] = useState(template?.name ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [category, setCategory] = useState(template?.category ?? '')
  const [items, setItems] = useState<{ id: string; label: string }[]>(
    template?.items.map((i) => ({
      id: i.id ?? crypto.randomUUID(),
      label: i.label,
    })) ?? [{ id: crypto.randomUUID(), label: '' }],
  )
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const duplicateOptions = allTemplates
    .filter((t) => t.id !== template?.id)
    .map((t) => ({
      value: t.id,
      label: t.name,
      sub: `${t.items.length} item${t.items.length === 1 ? '' : 's'}${
        t.category ? ` · ${t.category}` : ''
      }`,
    }))

  const applyDuplicate = (id: string) => {
    setDuplicateFromId(id)
    const source = allTemplates.find((t) => t.id === id)
    if (!source) return
    setName(`${source.name} (Copy)`)
    setDescription(source.description ?? '')
    setCategory(source.category ?? '')
    setItems(
      source.items.map((i) => ({
        id: crypto.randomUUID(),
        label: i.label,
      })),
    )
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const updateItem = (id: string, value: string) =>
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, label: value } : it)))

  const addItem = () =>
    setItems((arr) =>
      arr.length >= MAX_ITEMS ? arr : [...arr, { id: crypto.randomUUID(), label: '' }],
    )

  const removeItem = (id: string) =>
    setItems((arr) => arr.filter((it) => it.id !== id))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setItems((arr) => {
      const oldIndex = arr.findIndex((it) => it.id === active.id)
      const newIndex = arr.findIndex((it) => it.id === over.id)
      return arrayMove(arr, oldIndex, newIndex)
    })
  }

  const submit = async () => {
    setError('')
    if (!name.trim()) return setError('Template name is required')
    const cleaned = items.map((i) => i.label.trim()).filter((i) => i.length > 0)
    if (cleaned.length === 0)
      return setError('Add at least one checklist item')
    if (cleaned.length > MAX_ITEMS)
      return setError(`A checklist can have at most ${MAX_ITEMS} items`)

    const payload: ChecklistInput = {
      name,
      description: description || undefined,
      category: category || undefined,
      items: cleaned.map((label) => ({ label })),
    }

    setSubmitting(true)
    try {
      if (template) {
        await checklistsApi.update(template.id, payload)
      } else {
        await checklistsApi.create(payload)
      }
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save template')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal cl-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{template ? 'Edit Template' : 'New Template'}</h3>

        {!template && duplicateOptions.length > 0 && (
          <div className="cl-duplicate-field">
            <label>Duplicate from existing checklist (optional)</label>
            <SearchableSelect
              value={duplicateFromId}
              onChange={applyDuplicate}
              placeholder="Start from scratch…"
              options={duplicateOptions}
            />
          </div>
        )}

        <label>Template Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        <label>Category (optional)</label>
        <input
          value={category}
          placeholder="e.g. Perimeter, Interior, Fire Safety"
          onChange={(e) => setCategory(e.target.value)}
        />

        <label>Description (optional)</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="cl-items-head">
          <label>Checklist Items</label>
          <span className="cl-items-count">
            {items.length}/{MAX_ITEMS}
          </span>
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="cl-items">
              {items.map((item, i) => (
                <SortableItemRow
                  key={item.id}
                  id={item.id}
                  index={i}
                  value={item.label}
                  onChange={(v) => updateItem(item.id, v)}
                  onRemove={() => removeItem(item.id)}
                  disableRemove={items.length === 1}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <button
          className="cl-add-item"
          onClick={addItem}
          disabled={items.length >= MAX_ITEMS}
        >
          {items.length >= MAX_ITEMS
            ? `Maximum ${MAX_ITEMS} items`
            : '+ Add Item'}
        </button>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={submitting}
          >
            {submitting ? 'Saving…' : template ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SortableItemRow({
  id,
  index,
  value,
  onChange,
  onRemove,
  disableRemove,
}: {
  id: string
  index: number
  value: string
  onChange: (value: string) => void
  onRemove: () => void
  disableRemove: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`cl-item-row${isDragging ? ' cl-item-row-dragging' : ''}`}
    >
      <button
        type="button"
        className="cl-item-handle"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical size={16} />
      </button>
      <input
        value={value}
        placeholder={`Item ${index + 1}`}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        className="cl-item-remove"
        onClick={onRemove}
        disabled={disableRemove}
      >
        ✕
      </button>
    </div>
  )
}