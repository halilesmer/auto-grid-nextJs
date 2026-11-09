import { isChartTimeframe, type ChartTimeframe } from '@/lib/analysis/candles';
import { CONTEXT_TIMEFRAMES } from '@/lib/formation/params';
import { isDayString, isTimeString, RANGE_PRESETS, type DayRange, type RangePreset } from '@/lib/serverTime';

/**
 * URL model of the one chart without modes (plan 1107-A21, U4-3). Pure functions, no store.
 * Old links with `mode=` keep working: `mode` is ignored on read and removed on every write.
 * `tab` is the same since UI-23: Statistics is the page /stats (next.config.ts redirects `/chart?tab=stats` there).
 */

export type ChartRange = { preset: RangePreset } | { custom: DayRange };

/** Without `tf` the chart opens on H4 (1107-A21.7) */
export const DEFAULT_CHART_TF: ChartTimeframe = 'H4';
/** Range default of /chart and /stats ("All"). `/backtest` keeps its own `last30` (useAnalysisParams). */
export const DEFAULT_CHART_RANGE: ChartRange = Object.freeze({ preset: 'all' as const });

export interface ChartUrlState {
  account: string | null;
  symbol: string | null;
  zone: string | null;
  tf: ChartTimeframe;
  form: string | null;
  at: string | null;
  range: ChartRange;
}

/** Only these timeframes have formation detection (1107-A21.1) */
export function hasFormations(tf: ChartTimeframe): boolean {
  return (CONTEXT_TIMEFRAMES as readonly string[]).includes(tf);
}

/** `zoneSymbol` maps a zone id to its symbol (old setup links carry only `zone`) */
export function parseChartUrl(params: URLSearchParams, zoneSymbol?: (zoneId: string) => string | null | undefined): ChartUrlState {
  const zone = params.get('zone') || null;
  const symbol = params.get('symbol')?.trim() || (zone && zoneSymbol ? zoneSymbol(zone) || null : null);
  const tfParam = params.get('tf');
  return {
    account: params.get('account') || null,
    symbol,
    zone,
    tf: isChartTimeframe(tfParam) ? tfParam : DEFAULT_CHART_TF,
    // Not validated here: the caller checks `form` against the known formations (the caller checks it against the scan hits)
    form: params.get('form') || null,
    at: params.get('at') || null,
    range: parseRange(params),
  };
}

function parseRange(params: URLSearchParams): ChartRange {
  const from = params.get('from');
  const to = params.get('to');
  if (isDayString(from) && isDayString(to) && from <= to) {
    const custom: DayRange = { from, to };
    const ft = params.get('ft');
    const tt = params.get('tt');
    if (isTimeString(ft)) custom.fromTime = ft;
    if (isTimeString(tt)) custom.toTime = tt;
    return { custom };
  }
  const preset = params.get('range');
  if ((RANGE_PRESETS as readonly string[]).includes(preset ?? '')) return { preset: preset as RangePreset };
  return DEFAULT_CHART_RANGE;
}

export type ChartUrlChange = Partial<{
  account: string | null;
  symbol: string | null;
  zone: string | null;
  tf: ChartTimeframe;
  form: string | null;
  at: string | null;
  range: ChartRange;
}>;

function setOrDelete(out: URLSearchParams, key: string, value: string | null | undefined) {
  if (value) out.set(key, value);
  else out.delete(key);
}

/**
 * New query after a change. Default values leave the URL, `mode` and `tab` are always removed, and a timeframe
 * without formations drops `form` and `at` (1107-A21.9). The input is not changed.
 */
export function buildChartUrl(current: URLSearchParams, change: ChartUrlChange): URLSearchParams {
  const out = new URLSearchParams(current);
  out.delete('mode');
  out.delete('tab');
  for (const key of ['account', 'symbol', 'zone', 'form', 'at'] as const) {
    if (key in change) setOrDelete(out, key, change[key]);
  }
  if (change.tf) setOrDelete(out, 'tf', change.tf === DEFAULT_CHART_TF ? null : change.tf);
  if (change.range) {
    for (const key of ['range', 'from', 'to', 'ft', 'tt']) out.delete(key);
    if ('preset' in change.range) {
      if (change.range.preset !== 'all') out.set('range', change.range.preset);
    } else {
      const c = change.range.custom;
      if (c.from) out.set('from', c.from);
      if (c.to) out.set('to', c.to);
      if (c.fromTime) out.set('ft', c.fromTime);
      if (c.toTime) out.set('tt', c.toTime);
    }
  }
  // Default values leave the URL, also the untouched ones of an old link
  if (out.get('tf') === DEFAULT_CHART_TF) out.delete('tf');
  if (out.get('range') === 'all') out.delete('range');
  const tf = isChartTimeframe(out.get('tf')) ? (out.get('tf') as ChartTimeframe) : DEFAULT_CHART_TF;
  if (!hasFormations(tf)) {
    out.delete('form');
    out.delete('at');
  }
  return out;
}
