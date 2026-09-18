import { useEffect, useState } from 'react'
import { BarChart3, Plus, Pencil, Trash2, Star } from 'lucide-react'
import type { SummaryReportTemplateSummary } from '../lib/summary-report-template'
import { summaryReportTemplateApi } from '../lib/summary-report-template'
import './Templates.css'

export default function SummaryTemplates({
  onEdit,
}: {
  onEdit?: (id: string) => void
}) {
  const [templates, setTemplates] = useState<SummaryReportTemplateSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setTemplates(await summaryReportTemplateApi.list())
    } catch {
      setError('Failed to load summary templates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    if (!newName.trim()) return
    try {
      await summaryReportTemplateApi.create(newName.trim())
      setNewName('')
      setCreating(false)
      load()
    } catch {
      setError('Failed to create summary template')
    }
  }

  const rename = async (t: SummaryReportTemplateSummary) => {
    const name = window.prompt('Rename template', t.name)
    if (!name || !name.trim() || name === t.name) return
    try {
      await summaryReportTemplateApi.rename(t.id, name.trim())
      load()
    } catch {
      setError('Failed to rename summary template')
    }
  }

  const remove = async (t: SummaryReportTemplateSummary) => {
    if (t.isDefault) return
    if (!window.confirm(`Delete summary template "${t.name}"?`)) return
    try {
      await summaryReportTemplateApi.remove(t.id)
      load()
    } catch {
      setError('Failed to delete summary template')
    }
  }

  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString() : '—'

  return (
    <div className="templates-page">
      <div className="templates-toolbar">
        <p className="templates-count">{templates.length} summary templates</p>
        {creating ? (
          <div className="templates-create">
            <input
              autoFocus
              placeholder="Template name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
            <button className="btn-primary" onClick={create}>
              Create
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                setCreating(false)
                setNewName('')
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={15} /> New Summary Template
          </button>
        )}
      </div>

      {error && <div className="templates-error">{error}</div>}

      {loading ? (
        <p className="templates-loading">Loading…</p>
      ) : (
        <div className="templates-grid">
          {templates.map((t) => (
            <div key={t.id} className="template-card">
              <div className="template-card-icon">
                <BarChart3 size={20} />
              </div>
              <div className="template-card-body">
                <div className="template-card-title">
                  <strong>{t.name}</strong>
                  {t.isDefault && (
                    <span className="template-default-badge">
                      <Star size={11} /> Default
                    </span>
                  )}
                </div>
                <span className="template-card-meta">
                  Updated {fmt(t.updatedAt)}
                </span>
              </div>
              <div className="template-card-actions">
                {onEdit && (
                  <button onClick={() => onEdit(t.id)} title="Edit layout">
                    <Pencil size={14} /> Edit
                  </button>
                )}
                <button onClick={() => rename(t)} title="Rename">
                  Rename
                </button>
                {!t.isDefault && (
                  <button
                    className="danger"
                    onClick={() => remove(t)}
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
