// Single source of truth for which sections the aggregated multi-patrol
// Summary Report can contain. The admin-configurable order/enabled state
// (stored in the SummaryReportTemplate table) is layered on top of this
// list; patrol.service.ts's buildSummaryHtml() reads it to decide what to
// render and in what order. Mirrors report-fields.ts, but for the summary
// PDF rather than a single-patrol report.

export interface SummaryReportFieldDef {
  key: string;
  label: string;
  description: string;
  // Lets the frontend group the palette (overview info vs. charts vs.
  // tables) even though they're all one flat orderable/toggleable list.
  group: 'overview' | 'chart' | 'table';
}

export const SUMMARY_REPORT_FIELD_DEFS: SummaryReportFieldDef[] = [
  { key: 'header', label: 'Header & Logo', description: 'Report title and organization logo', group: 'overview' },
  { key: 'overview', label: 'Overview Details', description: 'Sites, operators, and date range covered', group: 'overview' },
  { key: 'statGrid', label: 'Stat Summary Cards', description: 'Patrols, completed, checkpoints, and issues counts', group: 'overview' },
  { key: 'outcomesChart', label: 'Checkpoint Outcomes', description: 'Donut chart of clear vs. flagged checkpoints', group: 'chart' },
  { key: 'issuesChart', label: 'Issues by Site/Route', description: 'Bar chart of issues per site, or per route when everything is from one site', group: 'chart' },
  { key: 'trendChart', label: 'Issues Over Time', description: 'Line chart of issues trending by day across the included patrols', group: 'chart' },
  { key: 'shiftChart', label: 'Issues by Shift', description: 'Bar chart comparing night vs. morning shift issues', group: 'chart' },
  { key: 'breakdownTable', label: 'Site/Route & Operator Breakdown', description: 'Rollup table by site, or by route and operator when everything is from one site', group: 'table' },
  { key: 'jobsTable', label: 'Included Patrols', description: 'Table listing every patrol included in the summary', group: 'table' },
];

export const SUMMARY_REPORT_FIELD_KEYS = SUMMARY_REPORT_FIELD_DEFS.map(
  (f) => f.key,
) as [string, ...string[]];

export interface SummaryReportTemplateField {
  key: string;
  enabled: boolean;
}

export const DEFAULT_SUMMARY_REPORT_FIELDS: SummaryReportTemplateField[] =
  SUMMARY_REPORT_FIELD_DEFS.map((f) => ({ key: f.key, enabled: true }));