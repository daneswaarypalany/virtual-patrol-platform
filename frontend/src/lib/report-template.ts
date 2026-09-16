import { api } from './api'

export interface ReportField {
  key: string
  label: string
  description: string
  group: 'summary' | 'checkpoint'
  enabled: boolean
  height?: number
}

export interface ReportTemplate {
  fields: ReportField[]
  updatedAt: string | null
}

export const reportTemplateApi = {
  get: () => api.get<ReportTemplate>('/report-template').then((r) => r.data),
  update: (fields: { key: string; enabled: boolean; height?: number }[]) =>
    api.put<ReportTemplate>('/report-template', { fields }).then((r) => r.data),
}