import { DEFAULT_VISIBILITY, INDICATOR_KINDS, newIndicator, PLOT_TYPES, SMOOTHINGS, SOURCES, type Indicator, type RangeRule, type Visibility } from './indicators';
import { parseRowOverrides } from './indicatorStyle';

function rule(input: unknown, fallback: RangeRule, max: number): RangeRule {
  if (!input || typeof input !== 'object') return { ...fallback };
  const r = input as Record<string, unknown>, num = (x: unknown, d: number) => typeof x === 'number' && Number.isFinite(x) ? Math.max(1, Math.min(max, Math.round(x))) : d;
  const from = num(r.from, fallback.from), to = num(r.to, fallback.to);
  return { on: typeof r.on === 'boolean' ? r.on : fallback.on, from: Math.min(from, to), to: Math.max(from, to) };
}
export function parseVisibility(input: unknown): Visibility {
  if (!input || typeof input !== 'object') return structuredClone(DEFAULT_VISIBILITY);
  const v = input as Record<string, unknown>;
  return { minute: rule(v.minute, DEFAULT_VISIBILITY.minute, 59), hour: rule(v.hour, DEFAULT_VISIBILITY.hour, 24), day: typeof v.day === 'boolean' ? v.day : true };
}
/** Version 2 stored one range of seconds. It maps to the new unit rules: a unit shows when any interval of it lies inside the old range. */
export function visibilityFromSeconds(min: number, max: number): Visibility {
  const has = (from: number, to: number, step: number) => { for (let s = from; s <= to; s += step) if (s >= min && s <= max) return true; return false; };
  const v = structuredClone(DEFAULT_VISIBILITY);
  v.minute.on = has(60, 3540, 60); v.hour.on = has(3600, 86399, 3600); v.day = max >= 86400 && min <= 86400;
  return v;
}

/** Reads saved indicators; unknown kinds and malformed fields fall back to the defaults. Version 2 documents (seconds range) are converted. */
export function parseIndicators(input: unknown): Indicator[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 20).flatMap(v => {
    if (!v || typeof v !== 'object' || !INDICATOR_KINDS.includes(v.kind) || typeof v.id !== 'string') return [];
    const defaults = newIndicator(v.kind);
    const out = { ...defaults, id: v.id, paneId: v.id };
    for (const k of Object.keys(defaults) as (keyof Indicator)[]) {
      const value = v[k];
      if (typeof defaults[k] === 'boolean' && typeof value === 'boolean') Object.assign(out, { [k]: value });
      if (k === 'paneId' && typeof value === 'string' && value && value.length <= 80) Object.assign(out, { paneId: value });
      if (k === 'scaleSide' && (value === 'auto' || value === 'left' || value === 'right')) Object.assign(out, { scaleSide: value });
      if (typeof defaults[k] === 'number' && typeof value === 'number' && Number.isFinite(value)) Object.assign(out, { [k]: Math.max(0, Math.min(86400, value)) });
    }
    out.period = Math.max(1, Math.min(5000, Math.round(out.period))); out.slow = Math.max(1, Math.min(5000, Math.round(out.slow)));
    out.signal = Math.max(1, Math.min(5000, Math.round(out.signal))); out.smoothingPeriod = Math.max(1, Math.min(5000, Math.round(out.smoothingPeriod)));
    out.width = [1, 2, 3, 4].includes(out.width) ? out.width : 1;
    out.lineStyle = v.lineStyle === 'dashed' || v.lineStyle === 'dotted' ? v.lineStyle : 'solid';
    out.source = SOURCES.includes(v.source) ? v.source : 'close';
    out.smoothing = SMOOTHINGS.includes(v.smoothing) ? v.smoothing : defaults.smoothing;
    out.plotType = PLOT_TYPES.includes(v.plotType) ? v.plotType : 'line';
    out.precision = typeof v.precision === 'number' && Number.isInteger(v.precision) && v.precision >= 0 && v.precision <= 8 ? v.precision : -1;
    for (const k of ['color', 'negative', 'maColor'] as const) if (typeof v[k] === 'string' && /^#[\da-f]{6}$/i.test(v[k])) out[k] = v[k];
    out.upper = Math.min(100, out.upper); out.lower = Math.min(out.upper, out.lower); out.middle = Math.max(out.lower, Math.min(out.upper, out.middle));
    out.rowStyles = parseRowOverrides(v.rowStyles);
    if (v.visibility) out.visibility = parseVisibility(v.visibility);
    else if (typeof v.minTimeframe === 'number' || typeof v.maxTimeframe === 'number') out.visibility = visibilityFromSeconds(typeof v.minTimeframe === 'number' ? v.minTimeframe : 0, typeof v.maxTimeframe === 'number' ? v.maxTimeframe : 86400);
    return [out];
  });
}

/** Saved "default" look per kind: only fields of the kind's own shape, validated through the same reader. */
export function parseIndicatorDefaults(input: unknown): Partial<Record<Indicator['kind'], Partial<Indicator>>> {
  const out: Partial<Record<Indicator['kind'], Partial<Indicator>>> = {};
  if (!input || typeof input !== 'object') return out;
  for (const kind of INDICATOR_KINDS) {
    const raw = (input as Record<string, unknown>)[kind];
    if (!raw || typeof raw !== 'object') continue;
    const [parsed] = parseIndicators([{ ...(raw as object), id: 'default', kind }]);
    if (parsed) { const { id, paneId, paneCollapsed, scaleSide, visible, ...look } = parsed; void id; void paneId; void paneCollapsed; void scaleSide; void visible; out[kind] = look; }
  }
  return out;
}
