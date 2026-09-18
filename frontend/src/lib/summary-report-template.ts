import { api } from './api'

export interface SummaryReportField {
  key: string
  label: string
  description: string
  group: 'overview' | 'chart' | 'table'
  enabled: boolean
}

export interface SummaryReportTemplate {
  fields: SummaryReportField[]
  updatedAt: string | null
}

type SaveField = {
  key: string
  enabled: boolean
}

export const summaryReportTemplateApi = {
  get: () =>
    api.get<SummaryReportTemplate>('/summary-report-template').then((r) => r.data),

  update: (fields: SaveField[]) =>
    api
      .put<SummaryReportTemplate>('/summary-report-template', { fields })
      .then((r) => r.data),
}