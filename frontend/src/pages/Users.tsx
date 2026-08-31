import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { AppUser, AssignedSite, CreateUserInput } from '../lib/users'
import { usersApi } from '../lib/users'
import './Users.css'

type StatusFilter = 'all' | 'active' | 'inactive'
type SortOption = 'custom' | 'alphabetical'
type RoleFilter = 'all' | 'admin' | 'operator' | 'viewer'

export default function Users() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [sortBy, setSortBy] = useState<SortOption>('custom')

  const load = async () => {
    setLoading(true)
    setError('')

    try {
      setUsers(await usersApi.list())
    } catch {
      setError('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const toggleStatus = async (user: AppUser) => {
    try {
      if (user.status === 'ACTIVE') {
        await usersApi.deactivate(user.id)
      } else {
        await usersApi.reactivate(user.id)
      }

      load()
    } catch {
      setError('Failed to update user status')
    }
  }

  const resetPassword = async (user: AppUser) => {
    const newPassword = window.prompt(`New password for ${user.username}:`)

    if (!newPassword) return

    if (newPassword.length < 6) {
      alert('Password must be at least 6 characters')
      return
    }

    try {
      await usersApi.resetPassword(user.id, newPassword)
      alert('Password reset successfully')
    } catch {
      alert('Failed to reset password')
    }
  }

  const filteredUsers = users.filter((user) => {
    const query = search.toLowerCase()

    const matchesSearch =
      user.fullName.toLowerCase().includes(query) ||
      user.username.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      user.role.toLowerCase().includes(query)

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && user.status === 'ACTIVE') ||
      (statusFilter === 'inactive' && user.status === 'INACTIVE')

    const matchesRole =
      roleFilter === 'all' || user.role.toLowerCase() === roleFilter

    return matchesSearch && matchesStatus && matchesRole
  })

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    if (sortBy === 'alphabetical') {
      return a.fullName.localeCompare(b.fullName)
    }

    return 0
  })

  return (
    <div className="users-page">
      <div className="users-toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <Search size={16} className="search-icon" />
            <input
              placeholder="Search name, username, email or role…"
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
            className="user-filter"
            value={roleFilter}
            onChange={(event) =>
              setRoleFilter(event.target.value as RoleFilter)
            }
            aria-label="Filter users by role"
          >
            <option value="all">All roles</option>
            <option value="admin">Administrators</option>
            <option value="operator">Operators</option>
            <option value="viewer">Viewers</option>
          </select>

          <select
            className="user-filter"
            value={sortBy}
            onChange={(event) =>
              setSortBy(event.target.value as SortOption)
            }
            aria-label="Sort users"
          >
            <option value="custom">Custom order</option>
            <option value="alphabetical">Alphabetical (A–Z)</option>
          </select>
        </div>

        <button className="btn-primary" onClick={() => setShowForm(true)}>
          + Create User
        </button>
      </div>

      <p className="users-count">
        {filteredUsers.length} of {users.length} users
      </p>

      {error && <div className="users-error">{error}</div>}

      {loading ? (
        <p className="users-loading">Loading…</p>
      ) : users.length === 0 ? (
        <div className="users-empty">
          <p>No users have been created yet.</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="users-empty">
          <p>No users match your search or filter.</p>
        </div>
      ) : (
        <div className="users-table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {sortedUsers.map((user) => (
                <tr key={user.id}>
                  <td>{user.fullName}</td>
                  <td>{user.username}</td>
                  <td>{user.email}</td>

                  <td>
                    {user.role === 'ADMIN' ? (
                      <span className="role-badge role-admin">ADMIN</span>
                    ) : (
                      <button
                        type="button"
                        className={`role-badge role-badge-button role-${user.role.toLowerCase()}`}
                        onClick={() => setSelectedUser(user)}
                        title={`View sites assigned to ${user.fullName}`}
                      >
                        {user.role}
                      </button>
                    )}
                  </td>

                  <td>
                    <span
                      className={`status-badge status-${user.status.toLowerCase()}`}
                    >
                      {user.status}
                    </span>
                  </td>

                  <td className="row-actions">
                    <button onClick={() => resetPassword(user)}>
                      Reset PW
                    </button>

                    {user.role !== 'ADMIN' && (
                      <button onClick={() => toggleStatus(user)}>
                        {user.status === 'ACTIVE'
                          ? 'Deactivate'
                          : 'Reactivate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <CreateUserModal
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false)
            load()
          }}
        />
      )}

      {selectedUser && (
        <AssignedSitesModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  )
}

function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState<CreateUserInput>({
    username: '',
    email: '',
    password: '',
    fullName: '',
    role: 'OPERATOR',
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const update = (field: keyof CreateUserInput, value: string) =>
    setForm((current) => ({ ...current, [field]: value }))

  const submit = async () => {
    setError('')

    if (!form.username || !form.email || !form.password || !form.fullName) {
      setError('All fields are required')
      return
    }

    if (form.password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setSubmitting(true)

    try {
      await usersApi.create(form)
      onCreated()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create user')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h3>Create User</h3>

        <label>Full Name</label>
        <input
          value={form.fullName}
          onChange={(event) => update('fullName', event.target.value)}
        />

        <label>Username</label>
        <input
          value={form.username}
          onChange={(event) => update('username', event.target.value)}
        />

        <label>Email</label>
        <input
          type="email"
          value={form.email}
          onChange={(event) => update('email', event.target.value)}
        />

        <label>Password</label>
        <input
          type="password"
          value={form.password}
          onChange={(event) => update('password', event.target.value)}
        />

        <label>Role</label>
        <select
          value={form.role}
          onChange={(event) => update('role', event.target.value)}
        >
          <option value="OPERATOR">Operator</option>
          <option value="VIEWER">Viewer</option>
        </select>

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
            {submitting ? 'Creating…' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AssignedSitesModal({
  user,
  onClose,
}: {
  user: AppUser
  onClose: () => void
}) {
  const [sites, setSites] = useState<AssignedSite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadAssignedSites = async () => {
      try {
        setSites(await usersApi.assignedSites(user.id))
      } catch {
        setError('Failed to load assigned sites')
      } finally {
        setLoading(false)
      }
    }

    loadAssignedSites()
  }, [user.id])

  return (
    <div className="assignment-backdrop" onClick={onClose}>
      <div
        className="assignment-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="assignment-head">
          <div>
            <span className="assignment-eyebrow">Assigned locations</span>
            <h3>{user.fullName}</h3>
            <p>
              {user.username} · {user.role.toLowerCase()}
            </p>
          </div>

          <button
            type="button"
            className="assignment-close"
            onClick={onClose}
            aria-label="Close assigned sites"
          >
            <X size={18} />
          </button>
        </div>

        <div className="assignment-body">
          {loading ? (
            <p className="assignment-muted">Loading assigned sites…</p>
          ) : error ? (
            <p className="assignment-error">{error}</p>
          ) : sites.length === 0 ? (
            <div className="assignment-empty">
              <strong>No sites assigned</strong>
              <p>
                Assign this {user.role.toLowerCase()} from Site Management.
              </p>
            </div>
          ) : (
            <>
              <p className="assignment-count">
                {sites.length} assigned site{sites.length === 1 ? '' : 's'}
              </p>

              <div className="assignment-list">
                {sites.map((site) => (
                  <div className="assignment-site" key={site.id}>
                    <div className="assignment-site-icon">
                      {site.name.charAt(0).toUpperCase()}
                    </div>

                    <div className="assignment-site-info">
                      <strong>{site.name}</strong>
                      <span>{site.address || 'No address provided'}</span>
                      <small>{site.timezone}</small>
                    </div>

                    <span
                      className={`status-badge ${
                        site.isActive ? 'status-active' : 'status-inactive'
                      }`}
                    >
                      {site.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}