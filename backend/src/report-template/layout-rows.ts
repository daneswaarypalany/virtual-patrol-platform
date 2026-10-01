// Shared by both report builders: turns the saved, flat, row-tagged field
// list into the same rows the builder canvas shows, so the generated PDF
// follows the builder's order, row grouping, widths and heights.

export interface LayoutField {
  key: string;
  enabled: boolean;
  height?: number;
  width?: number;
  row?: number;
  // only used by the free-form Text/Divider/Spacer component
  variant?: 'text' | 'divider' | 'spacer';
  text?: string;
}

export const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Same grouping the builder uses when it loads a template: consecutive
// fields sharing a `row` index share a row; a field with no row (saved
// before rows existed) gets a row of its own.
export function groupIntoRows<T extends LayoutField>(fields: T[]): T[][] {
  const grouped: T[][] = [];
  let lastRow: number | undefined;
  for (const f of fields.filter((x) => x.enabled)) {
    if (f.row !== undefined && f.row === lastRow && grouped.length) {
      grouped[grouped.length - 1].push(f);
    } else {
      grouped.push([f]);
    }
    lastRow = f.row;
  }
  return grouped;
}

// Renders one row. `renderItem` returns the HTML for a field (or '' to
// skip it). Width is a % of the row, height a minimum in px -- the same
// values the builder stores when a block is resized.
export function renderRow<T extends LayoutField>(
  row: T[],
  renderItem: (f: T) => string,
): string {
  const items = row
    .map((f) => ({ f, html: renderItem(f) }))
    .filter((x) => x.html);
  if (items.length === 0) return '';
  const cells = items
    .map(({ f, html }) => {
      const flex = f.width ? `0 0 ${f.width}%` : '1 1 0';
      const minH = f.height ? ` style="min-height:${f.height}px"` : '';
      return `<div class="li" style="flex:${flex};max-width:${f.width ?? 100}%"><div class="li-in"${minH}>${html}</div></div>`;
    })
    .join('');
  return `<div class="lr">${cells}</div>`;
}

export const LAYOUT_CSS = `
  .lr { display: flex; margin: 0 -8px 16px; align-items: stretch; }
  .li { padding: 0 8px; min-width: 0; }
  .li-in { height: 100%; display: flex; flex-direction: column; }
  .li-in > * { flex: 1 1 auto; }
  .blk-text { font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
  .blk-divider { border: 0; border-top: 1px solid #d8e2ec; margin: 8px 0; }
`;

// The free-form Text / Divider / Spacer component.
export function renderBlock(f: LayoutField): string {
  const variant = f.variant ?? 'text';
  if (variant === 'divider') return '<hr class="blk-divider" />';
  if (variant === 'spacer') {
    return `<div style="height:${f.height ?? 24}px"></div>`;
  }
  return f.text?.trim() ? `<div class="blk-text">${esc(f.text)}</div>` : '';
}