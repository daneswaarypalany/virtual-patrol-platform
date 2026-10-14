// Single source of truth for the components a generated patrol report can
// contain. The admin-configurable layout (order, rows, width, height,
// enabled and per-component options) is stored in the ReportTemplate table
// and layered on top of this list; patrol.service.ts renders it into the PDF.
//
// Checkpoint-scoped components repeat once for every real checkpoint on the
// route. Their individual display options are stored with the component.

export interface ReportFieldItemDef {
  key: string;
  label: string;
}

export interface ReportFieldDef {
  key: string;
  label: string;
  description: string;
  group: 'summary' | 'checkpoint';
  items: ReportFieldItemDef[];
}

export const REPORT_FIELD_DEFS: ReportFieldDef[] = [
  {
    key: 'header',
    label: 'Report Header',
    description: 'Report title, generated time and organization logo',
    group: 'summary',
    items: [
      { key: 'reportTitle', label: 'Report title' },
      { key: 'generatedTime', label: 'Generated time' },
      { key: 'organizationLogo', label: 'Organization logo' },
    ],
  },
  {
    key: 'patrolSummary',
    label: 'Patrol Summary / Status',
    description: 'Site, route, operator, status, times and issue summary',
    group: 'summary',
    items: [
      { key: 'site', label: 'Site' },
      { key: 'route', label: 'Route' },
      { key: 'operator', label: 'Operator' },
      { key: 'status', label: 'Patrol status' },
      { key: 'startTime', label: 'Start time' },
      { key: 'endTime', label: 'End time' },
      { key: 'checkpointCount', label: 'Checkpoint count' },
      { key: 'issuesBanner', label: 'Issues / all-clear banner' },
    ],
  },
  {
    key: 'checkpointCard',
    label: 'Checkpoint Card',
    description: 'Checkpoint details and result — repeats for every checkpoint',
    group: 'checkpoint',
    items: [
      { key: 'checkpointNumber', label: 'Checkpoint number' },
      { key: 'cameraName', label: 'Camera name' },
      { key: 'location', label: 'Location' },
      { key: 'resultStatus', label: 'Result status' },
    ],
  },
  {
    key: 'evidence',
    label: 'Checkpoint Image / Evidence',
    description: 'Captured screenshot for each checkpoint',
    group: 'checkpoint',
    items: [{ key: 'screenshot', label: 'Screenshot / evidence' }],
  },
  {
    key: 'checklist',
    label: 'Checklist',
    description: "Each checkpoint's checklist results",
    group: 'checkpoint',
    items: [
      { key: 'checklistName', label: 'Checklist name' },
      { key: 'checklistResults', label: 'Checklist results' },
    ],
  },
  {
    key: 'issueStatus',
    label: 'Issue / Status',
    description: 'Issue flag and operator comment for each checkpoint',
    group: 'checkpoint',
    items: [
      { key: 'issueFlag', label: 'Issue status' },
      { key: 'operatorComment', label: 'Operator comment' },
    ],
  },
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
  options?: Record<string, boolean>;
}

export function normalizeReportFieldOptions(
  key: string,
  saved?: Record<string, unknown>,
): Record<string, boolean> {
  const def = REPORT_FIELD_DEFS.find((field) => field.key === key);
  return Object.fromEntries(
    (def?.items ?? []).map((item) => [
      item.key,
      typeof saved?.[item.key] === 'boolean' ? saved[item.key] : true,
    ]),
  ) as Record<string, boolean>;
}

// Default layout reproduces the original report: header, summary, then a
// card per checkpoint with evidence beside the checklist and issue status
// underneath. Missing option settings default to enabled for backwards
// compatibility with reports/templates saved before item-level controls.
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
      existing.options = { ...(existing.options ?? {}), ...(f.options ?? {}) };
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
