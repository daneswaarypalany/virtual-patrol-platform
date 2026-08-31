import { useEffect, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import type { Site, SiteInput } from '../lib/sites'
import { sitesApi } from '../lib/sites'
import SiteDetail from './SiteDetail'
import './Sites.css'

type SortOption = 'custom' | 'alphabetical'

export default function Sites() {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Site | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [detailSite, setDetailSite] = useState<Site | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>(
    'all',
  )
  const [sortBy, setSortBy] = useState<SortOption>('custom')

  const load = async () => {
    setLoading(true)
    setError('')

    try {
      setSites(await sitesApi.list())
    } catch {
      setError('Failed to load sites')
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

  const openEdit = (site: Site) => {
    setEditing(site)
    setShowForm(true)
  }

  const remove = async (site: Site) => {
    if (
      !window.confirm(
        `Delete "${site.name}"? This also removes its cameras and assignments.`,
      )
    ) {
      return
    }

    try {
      await sitesApi.remove(site.id)
      load()
    } catch {
      setError('Failed to delete site')
    }
  }

  const filteredSites = sites.filter((site) => {
    const query = search.toLowerCase()

    const matchesSearch =
      site.name.toLowerCase().includes(query) ||
      (site.address ?? '').toLowerCase().includes(query)

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && site.isActive) ||
      (statusFilter === 'inactive' && !site.isActive)

    return matchesSearch && matchesStatus
  })

  const sortedSites = [...filteredSites].sort((a, b) => {
    if (sortBy === 'alphabetical') {
      return a.name.localeCompare(b.name)
    }

    return 0
  })

  return (
    <div className="sites-page">
      <div className="sites-toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <Search size={16} className="search-icon" />
            <input
              placeholder="Search sites…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="segmented">
            <button
              className={statusFilter === 'all' ? 'active' : ''}
              onClick={() => setStatusFilter('all')}
            >
              All
            </button>

            <button
              className={statusFilter === 'active' ? 'active' : ''}
              onClick={() => setStatusFilter('active')}
            >
              Active
            </button>

            <button
              className={statusFilter === 'inactive' ? 'active' : ''}
              onClick={() => setStatusFilter('inactive')}
            >
              Inactive
            </button>
          </div>

          <select
            className="site-filter"
            value={sortBy}
            onChange={(event) =>
              setSortBy(event.target.value as SortOption)
            }
            aria-label="Sort sites"
          >
            <option value="custom">Custom order</option>
            <option value="alphabetical">Alphabetical (A–Z)</option>
          </select>
        </div>

        <button className="btn-primary" onClick={openCreate}>
          + Add Site
        </button>
      </div>

      <p className="sites-count">
        {filteredSites.length} of {sites.length} sites
      </p>

      {error && <div className="sites-error">{error}</div>}

      {loading ? (
        <p className="sites-loading">Loading…</p>
      ) : sites.length === 0 ? (
        <div className="sites-empty">
          <p>No sites yet. Add your first site to get started.</p>
        </div>
      ) : filteredSites.length === 0 ? (
        <div className="sites-empty">
          <p>No sites match your search or filter.</p>
        </div>
      ) : (
        <div className="sites-table-wrap">
          <table className="sites-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Address</th>
                <th>Timezone</th>
                <th>Cameras</th>
                <th>Operators</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {sortedSites.map((site) => (
                <tr key={site.id}>
                  <td className="site-name">
                    <button
                      className="site-link"
                      onClick={() => setDetailSite(site)}
                    >
                      {site.name}
                    </button>
                  </td>

                  <td>{site.address || '—'}</td>
                  <td>{site.timezone}</td>
                  <td>{site._count.cameras}</td>
                  <td>{site._count.assignments}</td>

                  <td>
                    <span
                      className={`status-badge ${
                        site.isActive ? 'status-active' : 'status-inactive'
                      }`}
                    >
                      {site.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>

                  <td className="row-actions">
                    <button onClick={() => openEdit(site)}>Edit</button>
                    <button className="danger" onClick={() => remove(site)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <SiteModal
          site={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            load()
          }}
        />
      )}

      {detailSite && (
        <SiteDetail
          site={detailSite}
          onClose={() => {
            setDetailSite(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function SiteModal({
  site,
  onClose,
  onSaved,
}: {
  site: Site | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<SiteInput>({
    name: site?.name ?? '',
    address: site?.address ?? '',
    timezone: site?.timezone ?? 'Asia/Singapore',
    isActive: site?.isActive ?? true,
  })

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const update = (field: keyof SiteInput, value: string | boolean) =>
    setForm((current) => ({ ...current, [field]: value }))

  const submit = async () => {
    setError('')

    if (!form.name.trim()) {
      setError('Site name is required')
      return
    }

    setSubmitting(true)

    try {
      if (site) {
        await sitesApi.update(site.id, form)
      } else {
        await sitesApi.create(form)
      }

      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save site')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h3>{site ? 'Edit Site' : 'Add Site'}</h3>

        <label>Site Name</label>
        <input
          value={form.name}
          onChange={(event) => update('name', event.target.value)}
          autoFocus
        />

        <label>Address</label>
        <input
          value={form.address}
          onChange={(event) => update('address', event.target.value)}
        />

        <label>Timezone</label>
        <input
          value={form.timezone}
          onChange={(event) => update('timezone', event.target.value)}
        />

        <div className="site-status-field">
          <div className="site-status-heading">
            <span>Site Status</span>
            <small>
              {form.isActive
                ? 'This site is available for patrol operations.'
                : 'This site is hidden from active operations.'}
            </small>
          </div>

          <div className="site-status-toggle">
            <button
              type="button"
              className={`site-status-option active-option ${
                form.isActive ? 'selected' : ''
              }`}
              onClick={() => update('isActive', true)}
              aria-pressed={form.isActive}
            >
              <span className="status-option-icon">
                <Check size={16} strokeWidth={3} />
              </span>

              <span>
                <strong>Active</strong>
                <small>Operational</small>
              </span>
            </button>

            <button
              type="button"
              className={`site-status-option inactive-option ${
                !form.isActive ? 'selected' : ''
              }`}
              onClick={() => update('isActive', false)}
              aria-pressed={!form.isActive}
            >
              <span className="status-option-icon">
                <X size={16} strokeWidth={3} />
              </span>

              <span>
                <strong>Inactive</strong>
                <small>Paused</small>
              </span>
            </button>
          </div>
        </div>

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
            {submitting ? 'Saving…' : site ? 'Save Changes' : 'Create Site'}
          </button>
        </div>
      </div>
    </div>
  )
}