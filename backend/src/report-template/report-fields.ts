// Single source of truth for the components a generated patrol report can
// contain. The admin-configurable layout (order, rows, width, height,
// enabled) is stored in the ReportTemplate table and layered on top of this
// list; patrol.service.ts's buildReportHtml() renders from it.
//
// The Checkpoint Card, Checkpoint Image/Evidence, Checklist and Issue/Status
// components are "per checkpoint": the report repeats them once for every
// real checkpoint on the patrol's route, in the order/rows set in the
// builder. The other components render once.

export interface ReportFieldDef {
  key: string;
  label: string;
  description: string;
  group: 'summary' | 'checkpoint';
}

export const REPORT_FIELD_DEFS: ReportFieldDef[] = [
  { key: 'header', label: 'Report Header', description: 'Report title, generated time and organization logo', group: 'summary' },
  { key: 'patrolSummary', label: 'Patrol Summary / Status', description: 'Site, route, operator, status, start/end time, checkpoint count and the issues banner', group: 'summary' },
  { key: 'checkpointCard', label: 'Checkpoint Card', description: 'Checkpoint number, camera, location and result — repeats for every checkpoint', group: 'checkpoint' },
  { key: 'evidence', label: 'Checkpoint Image / Evidence', description: 'Captured screenshot for each checkpoint', group: 'checkpoint' },
  { key: 'checklist', label: 'Checklist', description: "Each checkpoint's checklist results", group: 'checkpoint' },
  { key: 'issueStatus', label: 'Issue / Status', description: 'Issue flag and operator comment for each checkpoint', group: 'checkpoint' },
];

export const REPORT_FIELD_KEYS = REPORT_FIELD_DEFS.map((f) => f.key) as [
  string,
  ...string[],
];

export interface ReportTemplateField {
  key: string;
  enabled: boolean;
  height?: number;
  width?: number;
  row?: number;
}

// Default layout reproduces the original report: header, summary, then a
// card per checkpoint with evidence beside the checklist and the issue
// status underneath.
export const DEFAULT_REPORT_FIELDS: ReportTemplateField[] = [
  { key: 'header', enabled: true, row: 0 },
  { key: 'patrolSummary', enabled: true, row: 1 },
  { key: 'checkpointCard', enabled: true, row: 2 },
  { key: 'evidence', enabled: true, row: 3, width: 40 },
  { key: 'checklist', enabled: true, row: 3, width: 60 },
  { key: 'issueStatus', enabled: true, row: 4 },
];

// Templates saved before this component set existed used the old fine-grained
// keys. Map them onto the new components (keeping their order/enabled state)
// so existing templates keep producing sensible reports.
const LEGACY_MAP: Record<string, string> = {
  site: 'patrolSummary',
  route: 'patrolSummary',
  operator: 'patrolSummary',
  status: 'patrolSummary',
  startTime: 'patrolSummary',
  endTime: 'patrolSummary',
  checkpointCount: 'patrolSummary',
  issuesBanner: 'patrolSummary',
  screenshots: 'evidence',
  checklistItems: 'checklist',
  comments: 'issueStatus',
};

export function normalizeSavedFields(
  saved: ReportTemplateField[],
): ReportTemplateField[] {
  if (!saved.some((f) => LEGACY_MAP[f.key])) {
    return saved.filter((f) => REPORT_FIELD_KEYS.includes(f.key));
  }
  const out: ReportTemplateField[] = [];
  for (const f of saved) {
    const key = LEGACY_MAP[f.key] ?? f.key;
    if (!REPORT_FIELD_KEYS.includes(key)) continue;
    const existing = out.find((o) => o.key === key);
    if (existing) {
      existing.enabled = existing.enabled || f.enabled;
    } else {
      out.push({ ...f, key });
    }
  }
  // the card header always existed in the old report
  if (!out.some((o) => o.key === 'checkpointCard')) {
    const at = out.findIndex((o) =>
      ['evidence', 'checklist', 'issueStatus'].includes(o.key),
    );
    out.splice(at === -1 ? out.length : at, 0, {
      key: 'checkpointCard',
      enabled: true,
    });
  }
  return out;
}