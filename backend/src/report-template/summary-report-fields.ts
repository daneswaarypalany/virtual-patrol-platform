// Single source of truth for the components the aggregated multi-patrol
// Summary Report can contain. The admin-configurable layout (order, rows,
// width, height, enabled) is stored in the SummaryTemplate table and layered
// on top of this list; patrol.service.ts's buildSummaryHtml() renders from it.
//
// Every fixed component appears at most once. The Text / Divider / Spacer
// component is the exception: it can be added any number of times, each copy
// stored under its own `block-<id>` key together with its variant and text.

export interface SummaryReportFieldDef {
  key: string;
  label: string;
  description: string;
  group: 'overview' | 'chart' | 'table';
}

export const SUMMARY_REPORT_FIELD_DEFS: SummaryReportFieldDef[] = [
  { key: 'header', label: 'Report Header', description: 'Title, logo, generated time, and the sites / operators / period covered', group: 'overview' },
  { key: 'statGrid', label: 'KPI / Statistics Cards', description: 'Patrols, completed, checkpoints and issues counts', group: 'overview' },
  { key: 'outcomesChart', label: 'Checkpoint Outcomes', description: 'Donut chart of clear vs. flagged checkpoints', group: 'chart' },
  { key: 'issuesChart', label: 'Issues by Route', description: 'Bar chart of issues per route (per site when the patrols span several sites)', group: 'chart' },
  { key: 'trendChart', label: 'Issues Over Time', description: 'Line chart of issues per day across the included patrols', group: 'chart' },
  { key: 'shiftChart', label: 'Issues by Shift', description: 'Night vs. morning shift issues', group: 'chart' },
  { key: 'routeTable', label: 'By Route Table', description: 'Patrols, checkpoints and issues per route (per site when the patrols span several sites)', group: 'table' },
  { key: 'operatorTable', label: 'By Operator Table', description: 'Patrols and issues per operator', group: 'table' },
  { key: 'jobsTable', label: 'Included Patrols Table', description: 'Every patrol included in the summary', group: 'table' },
];

export const BLOCK_DEF = {
  label: 'Text / Divider / Spacer',
  description: 'Free text, a divider line or blank space — add as many as you need',
  group: 'overview' as const,
};

export const SUMMARY_REPORT_FIELD_KEYS = SUMMARY_REPORT_FIELD_DEFS.map(
  (f) => f.key,
) as [string, ...string[]];

export interface SummaryReportTemplateField {
  key: string;
  enabled: boolean;
  height?: number;
  width?: number;
  row?: number;
  variant?: 'text' | 'divider' | 'spacer';
  text?: string;
}

export const isBlockKey = (key: string) => /^block-[a-z0-9]{4,24}$/.test(key);

// Default layout reproduces the original summary: header, KPI cards, the
// outcomes donut beside the issues bar chart, then trend, shift and tables.
export const DEFAULT_SUMMARY_REPORT_FIELDS: SummaryReportTemplateField[] = [
  { key: 'header', enabled: true, row: 0 },
  { key: 'statGrid', enabled: true, row: 1 },
  { key: 'outcomesChart', enabled: true, row: 2, width: 35 },
  { key: 'issuesChart', enabled: true, row: 2, width: 65 },
  { key: 'trendChart', enabled: true, row: 3 },
  { key: 'shiftChart', enabled: true, row: 4 },
  { key: 'routeTable', enabled: true, row: 5 },
  { key: 'operatorTable', enabled: true, row: 6 },
  { key: 'jobsTable', enabled: true, row: 7 },
];

// Templates saved before this component set existed: 'overview' (sites /
// operators / period) is now part of the Report Header and 'breakdownTable'
// became the separate By Route and By Operator tables.
export function normalizeSavedFields(
  saved: SummaryReportTemplateField[],
): SummaryReportTemplateField[] {
  const out: SummaryReportTemplateField[] = [];
  for (const f of saved) {
    if (f.key === 'overview') continue;
    if (f.key === 'breakdownTable') {
      out.push({ ...f, key: 'routeTable' });
      out.push({ ...f, key: 'operatorTable', row: undefined, width: undefined });
      continue;
    }
    if (
      SUMMARY_REPORT_FIELD_KEYS.includes(f.key) ||
      isBlockKey(f.key)
    ) {
      if (!out.some((o) => o.key === f.key)) out.push(f);
    }
  }
  return out;
}