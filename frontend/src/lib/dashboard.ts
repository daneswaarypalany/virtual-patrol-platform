import { api } from './api'

export interface DashboardStats {
  cameras: number
  sites: number
  activePatrols: number
  completedToday: number
  issuesFlagged: number
  totalChecks: number
}

export interface TimelineItem {
  type: 'started' | 'completed' | 'issue'
  at: string
  title: string
  detail: string
}

export interface DashboardData {
  stats: DashboardStats
  timeline: TimelineItem[]
}

export interface IssueItem {
  id: string
  comment: string | null
  completedAt: string
  checkpoint: { camera: { name: string } }
  job: {
    route: { site: { name: string } }
    operator: { fullName: string }
  }
}

export const dashboardApi = {
  get: () => api.get<DashboardData>('/dashboard').then((r) => r.data),
  listIssues: () =>
    api.get<IssueItem[]>('/dashboard/issues').then((r) => r.data),
}