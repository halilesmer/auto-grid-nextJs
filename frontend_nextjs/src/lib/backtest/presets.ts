import { t } from '@/i18n';
import { APP_VERSION } from '@/app/version';
import { DEFAULT_RUN_SETTINGS, type RunSettingsValue } from '@/lib/backtest/runSettings';
import { type RangeSelection } from '@/hooks/useAnalysisParams';
import { isDayString, RANGE_PRESETS } from '@/lib/serverTime';
import type { ZoneSettings } from '@/store/types';
import type { BacktestSetup } from './setupTypes';
import { defaultZone } from '@/utils/zoneHelpers';

export type PresetZone = Omit<ZoneSettings, 'id' | 'magic' | 'is_active'>;
export interface PresetData {
  version: 1;
  zone: PresetZone;
  form: RunSettingsValue;
  range: RangeSelection;
  appVersion: string;
}
export interface BacktestPreset extends PresetData {
  id: string;
  name: string;
  createdAt: number;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(t('backtest.presets.invalid'));
  return value as Record<string, unknown>;
}

/** Erlaubte Felder kommen aus den heutigen Defaults, nie aus Identitäten oder Laufdaten. */
export function presetZone(input: unknown): PresetZone {
  const source = record(input);
  const base = defaultZone();
  const values: Record<string, unknown> = {};
  for (const [key, fallback] of Object.entries(base)) {
    if (key === 'id' || key === 'is_active') continue;
    const value = source[key] ?? (key === 'fractal_next_loss_unit_version' ? 0 : fallback);
    if (typeof value !== typeof fallback || (typeof value === 'number' && !Number.isFinite(value))
      || (typeof value === 'string' && value.length > 100)) throw new Error(t('backtest.presets.invalid'));
    values[key] = value;
  }
  const choices: Record<string, readonly string[]> = {
    order_type: ['BUY', 'SELL', 'BOTH'], entry_mode: ['grid', 'fractal'], fractal_order_mode: ['breakout', 'rebound'],
    fractal_sl_mode: ['atr', 'sar', 'opposite_fractal', 'buffer'], fractal_next_loss_mode: ['money', 'pips'],
  };
  for (const [key, options] of Object.entries(choices)) {
    if (!options.includes(String(values[key]))) throw new Error(t('backtest.presets.invalid'));
  }
  if (typeof values.symbol !== 'string' || !values.symbol.trim()) throw new Error(t('backtest.presets.invalid'));
  // Alle Felder stammen aus ZoneSettings-Defaults und wurden nach Typ und Enum geprüft.
  return values as unknown as PresetZone;
}

export function parsePresetData(input: unknown): PresetData {
  const data = record(input);
  if (data.version !== 1 || typeof data.appVersion !== 'string' || !data.appVersion.length || data.appVersion.length > 40) throw new Error(t('backtest.presets.invalid'));
  const form = record(data.form);
  const checked: Record<string, unknown> = {};
  for (const [key, fallback] of Object.entries(DEFAULT_RUN_SETTINGS)) {
    const value = form[key];
    if (key === 'csvImportId') { checked[key] = null; continue; }
    if (key === 'commission' && value === null) { checked[key] = null; continue; }
    const expected = key === 'commission' ? 'number' : typeof fallback;
    if (typeof value !== expected || (typeof value === 'number' && (!Number.isFinite(value) || value < 0))) throw new Error(t('backtest.presets.invalid'));
    checked[key] = value;
  }
  const choices: Record<string, readonly string[]> = {
    timeframe: ['M1', 'M5', 'M15', 'H1'], spreadMode: ['candle', 'fixed', 'max'], fill: ['gap', 'parity'],
    path: ['auto', 'lowFirst', 'highFirst', 'both'],
  };
  for (const [key, values] of Object.entries(choices)) if (!values.includes(String(checked[key]))) throw new Error(t('backtest.presets.invalid'));
  const range = record(data.range);
  let selection: RangeSelection;
  if (typeof range.preset === 'string' && (RANGE_PRESETS as readonly string[]).includes(range.preset)) {
    selection = { preset: range.preset as typeof RANGE_PRESETS[number] };
  } else {
    const custom = record(range.custom);
    if (typeof custom.from !== 'string' || typeof custom.to !== 'string' || !isDayString(custom.from) || !isDayString(custom.to) || custom.from > custom.to) throw new Error(t('backtest.presets.invalid'));
    selection = { custom: { from: custom.from, to: custom.to } };
  }
  // Die Formfelder sind oben vollständig typ- und enumgeprüft.
  return { version: 1, zone: presetZone(data.zone), form: checked as unknown as RunSettingsValue, range: selection, appVersion: data.appVersion };
}

export function parsePreset(input: unknown): BacktestPreset {
  const data = record(input);
  if (typeof data.id !== 'string' || !data.id || typeof data.name !== 'string' || !data.name.trim()
    || data.name.length > 80 || typeof data.createdAt !== 'number' || !Number.isFinite(data.createdAt)) throw new Error(t('backtest.presets.invalid'));
  return { ...parsePresetData(data), id: data.id, name: data.name, createdAt: data.createdAt };
}

export function dataForPreset(setup: BacktestSetup): PresetData {
  return parsePresetData({ version: 1, zone: setup.zone, form: { ...setup.form, csvImportId: null }, range: setup.range, appVersion: APP_VERSION });
}

export function setupFromPreset(preset: PresetData): Omit<BacktestSetup, 'id'> {
  return { zone: { ...preset.zone, id: crypto.randomUUID(), is_active: false }, form: { ...preset.form, csvImportId: null }, range: preset.range, unsaved: true };
}
