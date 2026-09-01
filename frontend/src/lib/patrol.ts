import { api } from './api'

export interface PatrolCamera {
  id: string
  name: string
  location: string | null
  streamUrl: string | null
}

export interface PatrolChecklistItem {
  id: string
  label: string
  orderIndex: number
}

export interface PatrolCheckpoint {
  id: string
  orderIndex: number
  camera: PatrolCamera
  checklistTemplate: {
    id: string
    name: string
    items: PatrolChecklistItem[]
  }
}

export interface PatrolRoute {
  id: string
  name: string
  description: string | null
  estimatedMinutes: number | null
  site: { id: string; name: string }
  checkpoints: PatrolCheckpoint[]
}

export interface PatrolSite {
  id: string
  name: string
  address: string | null
}

export interface PatrolRouteSummary {
  id: string
  name: string
  description: string | null
  estimatedMinutes: number | null
  _count: { checkpoints: number }
}

export interface CheckpointResult {
  id: string
  checkpointId: string
  allClear: boolean
  comment: string | null
  screenshotPath: string | null
}

export interface PatrolJob {
  id: string
  status: 'IN_PROGRESS' | 'COMPLETED'
  startedAt: string
  completedAt: string | null
  route: PatrolRoute
  results: CheckpointResult[]
}
  
  export interface ActivePatrolItem {
  id: string
  status: string
  startedAt: string
  lastActivityAt: string
  operator: { fullName: string; username: string }
  route: { name: string; site: { name: string } }
  activePatrol: { siteId: string } | null
  _count: { results: number }
}


export const patrolApi = {
  mySites: () => api.get<PatrolSite[]>('/patrol/my-sites').then((r) => r.data),

  routes: (siteId: string) =>
    api
      .get<PatrolRouteSummary[]>('/patrol/routes', { params: { siteId } })
      .then((r) => r.data),

  start: (routeId: string) =>
    api
      .post<{ job: PatrolJob; route: PatrolRoute }>('/patrol/start', { routeId })
      .then((r) => r.data),

  getJob: (jobId: string) =>
    api.get<PatrolJob>(`/patrol/${jobId}`).then((r) => r.data),

    listJobs: () =>
    api.get<PatrolJobSummary[]>('/patrol/jobs').then((r) => r.data),
    reportUrl: (jobId: string) =>
    `${api.defaults.baseURL}/patrol/${jobId}/report`,

  // saves a checkpoint result; screenshot is an optional PNG Blob
  saveCheckpoint: (
    jobId: string,
    data: {
      checkpointId: string
      allClear: boolean
      checklistState: { label: string; checked: boolean }[]
      comment?: string
      screenshot?: Blob
    },
  ) => {
    const form = new FormData()
    form.append('checkpointId', data.checkpointId)
    form.append('allClear', String(data.allClear))
    form.append('checklistState', JSON.stringify(data.checklistState))
    if (data.comment) form.append('comment', data.comment)
    if (data.screenshot)
      form.append('screenshot', data.screenshot, 'capture.png')
    return api
      .post(`/patrol/${jobId}/checkpoint`, form)
      .then((r) => r.data)
  },

  complete: (jobId: string) =>
    api.post(`/patrol/${jobId}/complete`).then((r) => r.data),

    listActive: () =>
    api.get<ActivePatrolItem[]>('/patrol/active').then((r) => r.data),
  discard: (siteId: string) =>
    api.post('/patrol/discard', { siteId }).then((r) => r.data),
  releaseLock: (jobId: string) =>
    api.post(`/patrol/${jobId}/release`).then((r) => r.data),
  adminDelete: (jobId: string) =>
    api.post(`/patrol/${jobId}/admin-delete`).then((r) => r.data),
}

export interface PatrolJobSummary {
  id: string
  status: string
  startedAt: string
  completedAt: string | null
  route: { name: string; site: { name: string } }
  operator: { fullName: string }
  _count: { results: number }
}