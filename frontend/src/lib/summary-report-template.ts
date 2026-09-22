import { api } from './api'

export interface SummaryReportField {
  key: string
  label: string
  description: string
  group: 'overview' | 'chart' | 'table'
  enabled: boolean
}

export interface SummaryReportTemplateSummary {
  id: string
  key: string
  name: string
  isDefault: boolean
  updatedAt: string | null
}

export interface SummaryReportTemplate {
  id: string
  key: string
  name: string
  isDefault: boolean
  fields: SummaryReportField[]
  updatedAt: string | null
}

export const summaryReportTemplateApi = {
  list: () =>
    api.get<SummaryReportTemplateSummary[]>('/summary-template/list').then((r) => r.data),

  get: (id?: string) =>
    api.get<SummaryReportTemplate>('/summary-template', {
      params: id ? { id } : {},
    }).then((r) => r.data),

  getById: (id: string) =>
    api.get<SummaryReportTemplate>(`/summary-template/${id}`).then((r) => r.data),

  create: (name: string) =>
    api.post<SummaryReportTemplate>('/summary-template', { name }).then((r) => r.data),

  rename: (id: string, name: string) =>
    api.patch<SummaryReportTemplate>(`/summary-template/${id}/name`, { name }).then((r) => r.data),

  updateById: (id: string, fields: { key: string; enabled: boolean }[]) =>
    api.put<SummaryReportTemplate>(`/summary-template/${id}`, { fields }).then((r) => r.data),

  remove: (id: string) =>
    api.delete(`/summary-template/${id}`).then((r) => r.data),
}