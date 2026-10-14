import { api } from './api'

export interface SummaryReportField {
  key: string
  label: string
  description: string
  group: 'overview' | 'chart' | 'table'
  enabled: boolean
  /** Configurable content items provided by the backend field definition. */
  items?: { key: string; label: string }[]
  /** Item-level visibility choices; missing values remain visible by default. */
  options?: Record<string, boolean>
  height?: number
  width?: number
  row?: number
  // Text / Divider / Spacer copies only
  variant?: 'text' | 'divider' | 'spacer'
  text?: string
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
    api.get<SummaryReportTemplateSummary[]>('/summary-report-template/list').then((r) => r.data),

  get: (id?: string) =>
    api.get<SummaryReportTemplate>('/summary-report-template', {
      params: id ? { id } : {},
    }).then((r) => r.data),

  getById: (id: string) =>
    api.get<SummaryReportTemplate>(`/summary-report-template/${id}`).then((r) => r.data),

  create: (name: string) =>
    api.post<SummaryReportTemplate>('/summary-report-template', { name }).then((r) => r.data),

  rename: (id: string, name: string) =>
    api.patch<SummaryReportTemplate>(`/summary-report-template/${id}/name`, { name }).then((r) => r.data),

  updateById: (
    id: string,
    fields: {
      key: string
      enabled: boolean
      height?: number
      width?: number
      row?: number
      options?: Record<string, boolean>
      variant?: 'text' | 'divider' | 'spacer'
      text?: string
    }[],
  ) =>
    api.put<SummaryReportTemplate>(`/summary-report-template/${id}`, { fields }).then((r) => r.data),

  remove: (id: string) =>
    api.delete(`/summary-report-template/${id}`).then((r) => r.data),
}