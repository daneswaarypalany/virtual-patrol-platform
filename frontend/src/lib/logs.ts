import { api } from './api'

export interface ActiveUser {
  id: string
  username: string
  fullName: string
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER'
  lastLoginAt: string | null
  lastActiveAt: string | null
  online: boolean
}

export interface ActivityLogEntry {
  id: string
  action: string
  entity: string
  entityId: string | null
  details: string | null
  userId: string | null
  createdAt: string
  user: {
    id: string
    username: string
    fullName: string
    role: string
  } | null
}

export interface ActivityLogPage {
  items: ActivityLogEntry[]
  total: number
  page: number
  pageSize: number
}

export interface ActivityFilters {
  page?: number
  pageSize?: number
  action?: string
  userId?: string
  search?: string
  from?: string
  to?: string
}

export const logsApi = {
  activeUsers: () => api.get<ActiveUser[]>('/logs/active-users').then((r) => r.data),

  actions: () => api.get<string[]>('/logs/actions').then((r) => r.data),

  list: (filters: ActivityFilters = {}) =>
    api
      .get<ActivityLogPage>('/logs', { params: filters })
      .then((r) => r.data),
}

// ---- Display helpers for the Activity Log ----

// Keep in sync with ACTION_LABELS in backend/src/audit/audit.service.ts.
export const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Signed in',
  LOGOUT: 'Signed out',
  PATROL_START: 'Started virtual patrol',
  PATROL_CHECKPOINT: 'Reviewed camera checkpoint',
  PATROL_DRAFT: 'Saved patrol draft',
  PATROL_COMPLETE: 'Completed virtual patrol',
  PATROL_DISCARD: 'Discarded patrol',
  PATROL_RELEASE: 'Released patrol lock',
  PATROL_DELETE: 'Deleted patrol',
  CAMERA_VIEW: 'Viewed live camera feed',
  REPORT_VIEW: 'Viewed patrol report',
  REPORT_BULK_DOWNLOAD: 'Downloaded patrol reports',
  REPORT_SUMMARY: 'Generated summary report',
  COMMUNICATION_CREATED: 'Added site notification channel',
  COMMUNICATION_UPDATED: 'Updated site notification channel',
  COMMUNICATION_DELETED: 'Removed site notification channel',
  COMMUNICATION_TESTED: 'Tested site notification channel',
}

export function formatAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action]
  // Unknown code: PATROL_FOO_BAR -> "Patrol foo bar"
  const words = action.toLowerCase().split('_').join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// New entries store a plain-English sentence. Older entries (login/logout,
// site channels) stored JSON, so turn those into a sentence too.
export function formatDetails(entry: ActivityLogEntry): string {
  const raw = entry.details?.trim()
  if (!raw) return ''
  if (!raw.startsWith('{')) return raw

  try {
    const d = JSON.parse(raw) as Record<string, unknown>
    switch (entry.action) {
      case 'LOGIN':
        return `Signed in to the platform${d.username ? ` as @${String(d.username)}` : ''}.`
      case 'LOGOUT':
        return `Signed out of the platform${d.username ? ` (@${String(d.username)})` : ''}.`
      default: {
        const parts = Object.entries(d)
          .filter(([k]) => !/id$/i.test(k))
          .map(([k, v]) => `${k}: ${String(v)}`)
        return parts.join(' · ') || raw
      }
    }
  } catch {
    return raw
  }
}