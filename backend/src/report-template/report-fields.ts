// Single source of truth for which "details" a generated patrol report can
// contain. The admin-configurable order/enabled state (stored in the
// ReportTemplate table) is layered on top of this list; patrol.service.ts's
// buildReportHtml() reads it to decide what to render and in what order.

export interface ReportFieldDef {
  key: string;
  label: string;
  description: string;
  // Which part of the report this field affects, so the frontend can group
  // them (top summary block vs. inside each checkpoint card) even though
  // they're all one flat orderable/toggleable list.
  group: 'summary' | 'checkpoint';
}

export const REPORT_FIELD_DEFS: ReportFieldDef[] = [
  { key: 'header', label: 'Header & Logo', description: 'Report title and organization logo', group: 'summary' },
  { key: 'site', label: 'Site Name', description: 'Which site the patrol covered', group: 'summary' },
  { key: 'route', label: 'Route Name', description: 'Which patrol route was walked', group: 'summary' },
  { key: 'operator', label: 'Operator Name', description: 'Who performed the patrol', group: 'summary' },
  { key: 'status', label: 'Patrol Status', description: 'Completed / cancelled status', group: 'summary' },
  { key: 'startTime', label: 'Start Time', description: 'When the patrol began', group: 'summary' },
  { key: 'endTime', label: 'End Time', description: 'When the patrol was completed', group: 'summary' },
  { key: 'checkpointCount', label: 'Checkpoint Count', description: 'Total number of checkpoints on the route', group: 'summary' },
  { key: 'issuesBanner', label: 'Issues Summary Banner', description: 'Top banner flagging how many issues were found', group: 'summary' },
  { key: 'screenshots', label: 'Checkpoint Screenshots', description: 'Captured photo for each checkpoint', group: 'checkpoint' },
  { key: 'checklistItems', label: 'Checklist Items', description: "Each checkpoint's checklist results", group: 'checkpoint' },
  { key: 'comments', label: 'Checkpoint Comments', description: 'Operator notes left on flagged checkpoints', group: 'checkpoint' },
];

export const REPORT_FIELD_KEYS = REPORT_FIELD_DEFS.map((f) => f.key) as [
  string,
  ...string[],
];

export interface ReportTemplateField {
  key: string;
  enabled: boolean;
}

export const DEFAULT_REPORT_FIELDS: ReportTemplateField[] = REPORT_FIELD_DEFS.map(
  (f) => ({ key: f.key, enabled: true }),
);