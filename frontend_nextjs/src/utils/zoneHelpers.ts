import type { ZoneSettings, SymbolDetail } from '@/store/types';

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
    step_by_loss: false,
    instant_entry: false,
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
    entry_mode: 'grid',
    fractal_timeframe: 'H4',
    fractal_order_mode: 'breakout',
    fractal_sl_mode: 'atr',
    fractal_sl_buffer: 0.05,
    fractal_atr_period: 14,
    fractal_atr_multiplier: 1.5,
    fractal_sar_step: 0.02,
    fractal_sar_max: 0.2,
    fractal_rr: 2.0,
  };
}

/** Zeitrahmen, die der Worker kennt (grid_helpers.get_mt5_timeframe) */
export const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'] as const;

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
  /** 1 Lot, 1,0 Preisbewegung = so viel $ (trade_tick_value / trade_tick_size); unbekannt = null */
  moneyPerUnit: number | null;
}

/** Abstände (Grid, Pullback, TP, SL), die bei „Abstand nach Verlust“ als $-Betrag gelten */
export const LOSS_DISTANCE_FIELDS = [
  'grid_step',
  'sell_grid_step',
  'pullback_distance',
  'sell_pullback_distance',
  'take_profit',
  'sell_take_profit',
  'stop_loss',
  'sell_stop_loss',
] as const;

/** Eingabe-Konfiguration für Abstandsfelder: im Verlust-Modus $-Beträge mit 2 Nachkommastellen. */
export function distanceConfig(symbolConfig: SymbolConfig, byLoss: boolean | undefined): SymbolConfig {
  return byLoss ? { ...symbolConfig, min: 0.01, step: 0.01, precision: 2 } : symbolConfig;
}

/** Wie worker grid_execution/config.money_to_price_distance: $-Betrag → Preisabstand bei `lot`. */
export function lossToPriceDistance(amount: number, lot: number, symbolConfig: SymbolConfig): number | null {
  const perUnit = symbolConfig.moneyPerUnit;
  if (!perUnit || !(lot > 0) || !(amount > 0)) return null;
  const point = symbolConfig.step;
  const raw = amount / (lot * perUnit);
  return point > 0 ? Math.max(point, Number((Math.round(raw / point) * point).toFixed(symbolConfig.precision))) : raw;
}

/** Umkehrung: Preisabstand → $-Betrag bei `lot` (beim Umschalten des Modus), 2 Nachkommastellen. */
export function priceDistanceToLoss(distance: number, lot: number, symbolConfig: SymbolConfig): number | null {
  const perUnit = symbolConfig.moneyPerUnit;
  if (!perUnit || !(lot > 0)) return null;
  return Number((distance * lot * perUnit).toFixed(2));
}

export function getSymbolConfig(symbol: string, symbolDetails: Record<string, SymbolDetail>): SymbolConfig {
  const detail = symbolDetails[symbol.toUpperCase()];
  if (!detail) {
    return { min: 0, step: 0.00001, precision: 5, volMin: 0.01, volStep: 0.01, moneyPerUnit: null };
  }
  const point = detail.point || 0.00001;
  const digits = detail.digits ?? 5;
  return {
    min: point,
    step: point,
    precision: digits,
    volMin: detail.volume_min ?? 0.01,
    volStep: detail.volume_step ?? 0.01,
    moneyPerUnit: moneyPerUnit(detail),
  };
}
function moneyPerUnit(detail: SymbolDetail): number | null {
  const tickValue = detail.trade_tick_value ?? 0;
  const tickSize = detail.trade_tick_size ?? 0;
  if (tickValue > 0 && tickSize > 0) return tickValue / tickSize;
  const contract = detail.trade_contract_size ?? 0;
  return contract > 0 ? contract : null;
}
