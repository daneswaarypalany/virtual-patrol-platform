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

export const dashboardApi = {
  get: () => api.get<DashboardData>('/dashboard').then((r) => r.data),
}