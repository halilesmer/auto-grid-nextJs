import type { ZoneSettings, SymbolDetail } from '@/store/types';

/** Standardwerte der Einstiegsregel (= Worker-Defaults in grid_execution/config.py); GRID = Verhalten wie bisher. */
export const ENTRY_DEFAULTS = {
  entry_mode: 'GRID',
  signal_timeframe: 'M5',
  use_ema: true,
  ema_period: 50,
  use_rsi: true,
  rsi_period: 14,
  rsi_buy_below: 40,
  rsi_sell_above: 60,
  use_bollinger: false,
  bb_period: 20,
  bb_deviation: 2,
  max_spread: 0,
  max_buy_positions: 0,
  max_sell_positions: 0,
  tp_mode: 'PRICE',
  take_profit_money: 0,
  sell_take_profit_money: 0,
} as const satisfies Partial<ZoneSettings>;

export type ResolvedEntry = { -readonly [K in keyof typeof ENTRY_DEFAULTS]-?: NonNullable<ZoneSettings[K]> };

/** Einstiegsfelder einer Zone mit Defaults für ältere Zonen ohne diese Felder. */
export function entryOf(zone: ZoneSettings): ResolvedEntry {
  const out = { ...ENTRY_DEFAULTS } as ResolvedEntry;
  for (const key of Object.keys(ENTRY_DEFAULTS) as (keyof ResolvedEntry)[]) {
    const v = zone[key];
    if (v !== undefined && v !== null) (out as Record<string, unknown>)[key] = v;
  }
  return out;
}

/** Signal wird ausgewertet: Filter-/Market-Modus oder Richtung AUTO (Worker: handler._entry_permissions). */
export function usesSignal(zone: ZoneSettings): boolean {
  return entryOf(zone).entry_mode !== 'GRID' || zone.order_type === 'AUTO';
}

export function defaultZone(): ZoneSettings {
  return {
    id: crypto.randomUUID(),
    is_active: false,
    symbol: '',
    order_type: 'BUY',
    min_price: 70.0,
    max_price: 80.0,
    grid_step: 0.05,
    lot_size: 0.01,
    take_profit: 0.05,
    stop_loss: 0.0,
    sell_grid_step: 0.05,
    sell_lot_size: 0.01,
    sell_take_profit: 0.05,
    sell_stop_loss: 0.0,
    is_breakout: false,
    pullback_distance: 0.5,
    sell_pullback_distance: 0.5,
    sync_buy_sell: true,
    levels_below: 5,
    levels_above: 5,
    max_positions: 10,
    clear_on_exit: true,
    clear_exit_side: 'SELL (Aşağı)',
    clear_scope: 'Sadece Bekleyen Emirler',
    clear_target_side: 'Sadece BUY İşlemleri',
    exit_condition: 'Anlık Fiyat',
    exit_timeframe: 'M15',
    ...ENTRY_DEFAULTS,
  };
}

export function zoneModified(original: ZoneSettings | undefined, current: ZoneSettings): boolean {
  if (!original) return true;
  const o = { ...original };
  const c = { ...current };
  delete o.is_active;
  delete c.is_active;
  return JSON.stringify(o) !== JSON.stringify(c);
}

export function parseFloatCustom(value: string, precision: number = 5): number {
  if (!value || value.trim() === '') return 0;
  const num = parseFloat(value);
  if (isNaN(num)) return 0;
  return Number(num.toFixed(precision));
}

export interface SymbolConfig {
  min: number;
  step: number;
  precision: number;
  volMin: number;
  volStep: number;
}

export function getSymbolConfig(symbol: string, symbolDetails: Record<string, SymbolDetail>): SymbolConfig {
  const detail = symbolDetails[symbol.toUpperCase()];
  if (!detail) {
    return { min: 0, step: 0.00001, precision: 5, volMin: 0.01, volStep: 0.01 };
  }
  const point = detail.point || 0.00001;
  const digits = detail.digits ?? 5;
  return {
    min: point,
    step: point,
    precision: digits,
    volMin: detail.volume_min ?? 0.01,
    volStep: detail.volume_step ?? 0.01,
  };
}