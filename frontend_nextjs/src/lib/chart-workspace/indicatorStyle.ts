import type { Indicator, RowKey, RowOverrides, RowStyle } from './indicators';

/** Theme colours the rows fall back to while the user has not chosen one. */
export interface Tones { info: string; warning: string; up: string; down: string; muted: string }

/** Rows of the style tab in their order. `lines` rows draw a line; `fills` rows paint an area (colour, and for the gradients a second colour). */
export const STYLE_ROWS = {
  main: ['rsi', 'ma'] as const,
  bands: ['upper', 'middle', 'lower'] as const,
  fills: ['bg', 'over', 'under'] as const,
  bollinger: ['bbUpper', 'bbLower', 'bbFill'] as const,
  divergence: ['divUp', 'divDown'] as const,
};
export const FILL_ROWS: readonly RowKey[] = ['bg', 'over', 'under', 'bbFill'];
export const GRADIENT_ROWS: readonly RowKey[] = ['over', 'under'];

/** The row as drawn: the user's choices over the defaults of the indicator (older fields `color`, `maColor`, `width`, `lineStyle`, `bands`, `background`, `gradients` stay the defaults). */
export function rowStyle(c: Indicator, key: RowKey, tones: Tones): RowStyle {
  const o = c.rowStyles[key] ?? {};
  const base: RowStyle = (() => {
    switch (key) {
      case 'rsi': return { on: true, color: c.color || tones.info, color2: '', opacity: 100, width: c.width, lineStyle: c.lineStyle };
      case 'ma': return { on: true, color: c.maColor || tones.warning, color2: '', opacity: 100, width: 1, lineStyle: 'solid' };
      case 'upper': case 'lower': return { on: c.bands, color: tones.muted, color2: '', opacity: 100, width: 1, lineStyle: 'dashed' };
      case 'middle': return { on: c.bands, color: tones.muted, color2: '', opacity: 50, width: 1, lineStyle: 'dashed' };
      case 'bg': return { on: c.background, color: c.color || tones.info, color2: '', opacity: 8, width: 1, lineStyle: 'solid' };
      case 'over': return { on: c.gradients, color: tones.up, color2: '', opacity: 100, width: 1, lineStyle: 'solid' };
      case 'under': return { on: c.gradients, color: '', color2: c.negative || tones.down, opacity: 100, width: 1, lineStyle: 'solid' };
      case 'bbUpper': case 'bbLower': return { on: true, color: tones.up, color2: '', opacity: 100, width: 1, lineStyle: 'solid' };
      case 'bbFill': return { on: true, color: tones.up, color2: '', opacity: 15, width: 1, lineStyle: 'solid' };
      case 'divUp': return { on: true, color: tones.up, color2: '', opacity: 100, width: 2, lineStyle: 'solid' };
      default: return { on: true, color: c.negative || tones.down, color2: '', opacity: 100, width: 2, lineStyle: 'solid' };
    }
  })();
  return { ...base, ...o };
}

/**
 * Change of one row as a patch for the indicator. The main line and the MA keep colour, width and pattern in the older fields
 * (`color`, `width`, `lineStyle`, `maColor`), because the line menu of the legend writes the same fields.
 */
export function patchRow(c: Indicator, key: RowKey, change: Partial<RowStyle>): Partial<Indicator> {
  const legacy: Partial<Indicator> = {}, own: Partial<RowStyle> = { ...change };
  if (key === 'rsi') {
    if (change.color !== undefined) legacy.color = change.color;
    if (change.width !== undefined) legacy.width = change.width;
    if (change.lineStyle !== undefined) legacy.lineStyle = change.lineStyle;
    delete own.color; delete own.width; delete own.lineStyle;
  }
  if (key === 'ma' && change.color !== undefined) { legacy.maColor = change.color; delete own.color; }
  return Object.keys(own).length ? { ...legacy, rowStyles: { ...c.rowStyles, [key]: { ...c.rowStyles[key], ...own } } } : legacy;
}

const HEX = /^#[\da-f]{6}$/i;
const STYLES = ['solid', 'dashed', 'dotted'];
const ROW_KEYS: readonly RowKey[] = ['rsi', 'ma', 'upper', 'middle', 'lower', 'bg', 'over', 'under', 'bbUpper', 'bbLower', 'bbFill', 'divUp', 'divDown'];
/** Reads saved row choices; anything unknown or malformed is dropped. */
export function parseRowOverrides(input: unknown): RowOverrides {
  if (!input || typeof input !== 'object') return {};
  const out: RowOverrides = {};
  for (const key of ROW_KEYS) {
    const v = (input as Record<string, unknown>)[key];
    if (!v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>, row: Partial<RowStyle> = {};
    if (typeof r.on === 'boolean') row.on = r.on;
    for (const field of ['color', 'color2'] as const) if (typeof r[field] === 'string' && (r[field] === '' || HEX.test(r[field] as string))) row[field] = r[field] as string;
    if (typeof r.opacity === 'number' && Number.isFinite(r.opacity)) row.opacity = Math.max(0, Math.min(100, Math.round(r.opacity)));
    if (r.width === 1 || r.width === 2 || r.width === 3 || r.width === 4) row.width = r.width;
    if (typeof r.lineStyle === 'string' && STYLES.includes(r.lineStyle)) row.lineStyle = r.lineStyle as RowStyle['lineStyle'];
    if (Object.keys(row).length) out[key] = row;
  }
  return out;
}

/** Fields that make up the look of an indicator: what "save as default" stores. Identity, pane and the eye are not part of it. */
const NOT_DEFAULT = new Set<keyof Indicator>(['id', 'kind', 'paneId', 'paneCollapsed', 'scaleSide', 'visible']);
export function defaultsOf(c: Indicator): Partial<Indicator> {
  return Object.fromEntries(Object.entries(c).filter(([k]) => !NOT_DEFAULT.has(k as keyof Indicator))) as Partial<Indicator>;
}
