export const SETTINGS = {
  body: ['symbol', true], up: ['symbol', ''], down: ['symbol', ''], border: ['symbol', false], borderUp: ['symbol', ''], borderDown: ['symbol', ''], wick: ['symbol', true], wickUp: ['symbol', ''], wickDown: ['symbol', ''], previous: ['symbol', false], precision: ['symbol', 'auto'],
  title: ['status', true], timeframe: ['status', true], ohlc: ['status', true], change: ['status', false], names: ['status', true], params: ['status', true], values: ['status', true], statusBackground: ['status', false], statusColor: ['status', ''], opacity: ['status', 80],
  scale: ['scales', 'linear'], autoScale: ['scales', true], invert: ['scales', false], side: ['scales', 'right'], align: ['scales', true], priceLine: ['scales', true], priceColor: ['scales', ''], priceStyle: ['scales', 'dotted'], priceLabel: ['scales', true], countdown: ['scales', false], indicatorLabels: ['scales', true],
  hideDrawings: ['canvas', true], magnet: ['canvas', 'weak'], keepDrawing: ['canvas', false],
  background: ['canvas', ''], gridV: ['canvas', true], gridH: ['canvas', true], gridColor: ['canvas', ''], crosshair: ['canvas', true], crosshairColor: ['canvas', ''], crosshairStyle: ['canvas', 'dashed'], watermark: ['canvas', false], watermarkColor: ['canvas', ''], fontSize: ['canvas', 11], textColor: ['canvas', ''], axisColor: ['canvas', ''], separator: ['canvas', ''], marginTop: ['canvas', 8], marginBottom: ['canvas', 8], navigation: ['canvas', true],
} as const;
export type SettingKey = keyof typeof SETTINGS;
export type Section = 'symbol' | 'status' | 'scales' | 'canvas' | 'overlays';
type Widen<T> = T extends boolean ? boolean : T extends number ? number : string;
export type Appearance = { [K in SettingKey]: Widen<typeof SETTINGS[K][1]> } & { preset: 'auto' | 'classic'; marginsSet: boolean };
export const DEFAULT_APPEARANCE = Object.fromEntries(Object.entries(SETTINGS).map(([k, v]) => [k, v[1]])) as Appearance;
DEFAULT_APPEARANCE.preset = 'auto';
DEFAULT_APPEARANCE.marginsSet = false;
export const COLOR_KEYS = new Set<SettingKey>(['up', 'down', 'borderUp', 'borderDown', 'wickUp', 'wickDown', 'statusColor', 'priceColor', 'background', 'gridColor', 'crosshairColor', 'watermarkColor', 'textColor', 'axisColor', 'separator']);
export const OPTIONS: Partial<Record<SettingKey, string[]>> = {
  precision: ['auto', '0', '1', '2', '3', '4', '5', '6', '7', '8'],
  magnet: ['off', 'weak', 'strong'],
  scale: ['linear', 'log', 'percent'], side: ['right', 'left'], priceStyle: ['solid', 'dashed', 'dotted'], crosshairStyle: ['solid', 'dashed', 'dotted'],
};
export function parseAppearance(value: unknown): Appearance {
  const out = { ...DEFAULT_APPEARANCE };
  if (!value || typeof value !== 'object') return out;
  const input = value as Record<string, unknown>;
  for (const k of Object.keys(SETTINGS) as SettingKey[]) {
    const v = input[k], initial = SETTINGS[k][1];
    if (typeof initial === 'boolean' && typeof v === 'boolean') Object.assign(out, { [k]: v });
    if (typeof initial === 'number' && typeof v === 'number' && Number.isFinite(v)) {
      const min = k === 'fontSize' ? 10 : 0;
      let max = 35; if (k === 'fontSize') max = 24; else if (k === 'opacity') max = 100;
      Object.assign(out, { [k]: Math.max(min, Math.min(max, v)) });
    }
    if (typeof initial === 'string' && typeof v === 'string' && (COLOR_KEYS.has(k) ? v === '' || /^#[\da-f]{6}$/i.test(v) : OPTIONS[k]?.includes(v))) Object.assign(out, { [k]: v });
  }
  out.marginsSet = input.marginsSet === true;
  if (input.preset === 'classic') out.preset = 'classic';
  return out;
}

export function workspaceKey(context: { view: string; account: string; symbol: string; source: string; mode?: string; run?: string }): string {
  return JSON.stringify([context.source, context.view, context.mode ?? '', context.account, context.symbol, context.run ?? '']);
}

/** Stable local identity for an actual backtest result, including its input snapshot.
 * This hash is a storage namespace, never an authentication or integrity check.
 */
export function chartResultIdentity(parameters: unknown, result: unknown): string {
  const text = JSON.stringify([parameters, result]);
  let first = 2166136261, second = 2246822519;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `result-v1-${(first >>> 0).toString(16)}-${(second >>> 0).toString(16)}`;
}
