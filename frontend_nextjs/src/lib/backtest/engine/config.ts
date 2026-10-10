/**
 * Zonen-Einstellungen → Rechenwerte des Bots (Grid und Fraktal).
 * Quelle: worker_python/src/core/grid_execution/config.py (extract_zone_config, _lot_of,
 * money_per_price_unit, money_to_price_distance, max_positions_of, _fractal_count, _choice).
 */
import { pyFloat, pyInt, zget, type SymbolInfos } from './helpers';
import { pyRound } from './pyRound';
import type { EngineState } from './state';
import { snapVolume } from './tradeUtils';
import type { Timeframe, ZoneDict } from './types';
import { zoneMagic } from './zoneMagic';

/** Ungültige Zone; `code` ist der Log-Code (der Run-Log übersetzt ihn), nicht der Text */
export class InvalidZoneConfigError extends Error {
  constructor(
    readonly code: string,
    readonly params: Record<string, unknown>,
  ) {
    super(code);
  }
}

/** Obergrenze des Speichers für gemeldete Lot-Anhebungen (wie in Python) */
const LOT_RAISED_LOG_CAP = 200;

export interface ZoneConfig {
  orderType: string;
  minPrice: number;
  maxPrice: number;
  gridStep: number;
  lotSize: number;
  takeProfit: number;
  stopLoss: number;
  symbol: string;
  syncBuySell: boolean;
  levelsBelow: number;
  levelsAbove: number;
  maxPositions: number;
  isBreakout: boolean;
  pullbackDistance: number;
  sellGridStep: number;
  sellLotSize: number;
  sellTakeProfit: number;
  sellStopLoss: number;
  sellPullbackDistance: number;
  targetMagic: number;
  stepByLoss: boolean;
  instantEntry: boolean;
  entryMode: 'grid' | 'fractal';
  fractalTimeframe: Timeframe;
  /** breakout: Ausbruch (Stop) · rebound: Umkehr (Limit) */
  fractalOrderMode: 'breakout' | 'rebound';
  /** false: Fraktal-Orders ohne SL */
  fractalUseSl: boolean;
  fractalSlMode: 'atr' | 'sar' | 'opposite_fractal' | 'buffer';
  fractalSlBuffer: number;
  fractalAtrPeriod: number;
  fractalAtrMultiplier: number;
  fractalSarStep: number;
  fractalSarMax: number;
  /** TP = SL-Abstand × rr; 0 = kein TP */
  fractalRr: number;
  /** Orders je Richtung auf die neuesten Fraktale (BUY / SELL) */
  fractalOrderCount: number;
  sellFractalOrderCount: number;
  /** true: TP = fester Betrag (Kontowährung) → Preisabstand */
  fractalTpByMoney: boolean;
  fractalTpMoney: number;
  /** Nächste Fraktal-Order erst, wenn die jüngste Position der Richtung so weit im Verlust ist; 0 = keine Grenze */
  fractalNextLoss: number;
  fractalNextLossUnitVersion: number;
  /** money: Gewinn ≤ −X · pips: Version 1 Pips/Ticks, Version 0 Preisabstand */
  fractalNextLossMode: 'money' | 'pips';
}

const ENTRY_MODES = ['grid', 'fractal'] as const;
const FRACTAL_TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'] as const;
const FRACTAL_ORDER_MODES = ['breakout', 'rebound'] as const;
const FRACTAL_SL_MODES = ['atr', 'sar', 'opposite_fractal', 'buffer'] as const;
const FRACTAL_NEXT_LOSS_MODES = ['money', 'pips'] as const;
export const FRACTAL_MAX_ORDERS = 20;

/** Anzahl Fraktal-Orders 1 … 20; ungültiger Wert → Standard */
function fractalCount(value: unknown, fallback: number): number {
  try {
    return Math.min(FRACTAL_MAX_ORDERS, Math.max(1, pyInt(value)));
  } catch {
    return fallback;
  }
}

/** str(value) aus der erlaubten Liste, sonst der Standard (None → Standard) */
function choice<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const text = String(value ?? fallback);
  return (allowed as readonly string[]).includes(text) ? (text as T) : fallback;
}

/** Lot-Obergrenze des Bots, unabhängig von volume_max des Brokers */
export const MAX_LOT = 5.0;

/** Höchstzahl Positionen; 0 = unbegrenzt (500) */
export function maxPositionsOf(zone: ZoneDict, fallback = 10): number {
  return pyInt(zget(zone, 'max_positions', fallback)) || 500;
}

export function isFractalZone(zone: ZoneDict): boolean {
  return zone.entry_mode === 'fractal';
}

/** Gewinn/Verlust von 1 Lot je 1,0 Preiseinheit: tick_value / tick_size, sonst Kontraktgröße */
export function moneyPerPriceUnit(symbol: string, infos: SymbolInfos): number | null {
  const info = infos[symbol];
  if (!info) return null;
  const tickValue = info.trade_tick_value || 0;
  const tickSize = info.trade_tick_size || 0;
  if (tickValue > 0 && tickSize > 0) return tickValue / tickSize;
  const contract = info.trade_contract_size || 0;
  return contract > 0 ? contract : null;
}

/** „Abstand nach Verlust“: Betrag → Preisabstand, auf point gerundet, mindestens 1 point */
export function moneyToPriceDistance(amount: number, lot: number, symbol: string, infos: SymbolInfos): number | null {
  const perUnit = moneyPerPriceUnit(symbol, infos);
  if (!perUnit || lot <= 0) return null;
  let distance = amount / (lot * perUnit);
  const info = infos[symbol];
  const point = info?.point || 0;
  if (info && point > 0) distance = Math.max(point, pyRound(pyRound(distance / point) * point, info.digits));
  return distance;
}

function lotOf(raw: unknown, symbol: string, infos: SymbolInfos, zoneIdx: number, side: string, state: EngineState): number {
  // Ungültiger Wert oder NaN → 0 (wird unten auf volume_min gehoben)
  let lot: number;
  try {
    lot = pyFloat(raw);
  } catch {
    lot = 0;
  }
  if (Number.isNaN(lot)) lot = 0;
  const capped = Math.min(MAX_LOT, lot);
  const info = infos[symbol];
  const result = info ? snapVolume(capped, info) : Math.max(0.01, capped);
  if (result > lot + 1e-9) {
    const key = `${zoneIdx}|${symbol}|${side}|${lot}|${result}`;
    if (!state.lotRaisedLogged.has(key)) {
      if (state.lotRaisedLogged.size > LOT_RAISED_LOG_CAP) state.lotRaisedLogged.clear();
      state.lotRaisedLogged.add(key);
      state.log('WARN', 'config.lotRaised', { zone: zoneIdx + 1, symbol, side, lot, used: result });
    }
  }
  return result;
}

export function extractZoneConfig(zone: ZoneDict, zoneIdx: number, infos: SymbolInfos, state: EngineState): ZoneConfig {
  const orderType = String(zget(zone, 'order_type', 'BUY')).toUpperCase();

  const minPrice = pyFloat(zget(zone, 'min_price', 0));
  const maxPrice = pyFloat(zget(zone, 'max_price', 0));
  if (minPrice >= maxPrice) throw new InvalidZoneConfigError('config.minNotBelowMax', { zone: zoneIdx + 1, minPrice, maxPrice });

  let gridStep = Math.max(0.00001, pyFloat(zget(zone, 'grid_step', 0.05)));
  let tp = pyFloat(zget(zone, 'take_profit', 0.05));
  let sl = pyFloat(zget(zone, 'stop_loss', 0.0));
  const symbol = String(zget(zone, 'symbol', '')).toUpperCase().trim();
  if (!symbol) throw new InvalidZoneConfigError('config.noSymbol', { zone: zoneIdx + 1 });
  const lot = lotOf(zget(zone, 'lot_size', 0.01), symbol, infos, zoneIdx, 'BUY', state);

  const sync = Boolean(zget(zone, 'sync_buy_sell', true));
  let sellGridStep: number;
  let sellLot: number;
  let sellTp: number;
  let sellSl: number;
  let sellPullback: number;
  if (sync) {
    sellGridStep = gridStep;
    sellLot = lot;
    sellTp = tp;
    sellSl = sl;
    sellPullback = pyFloat(zget(zone, 'pullback_distance', 0.5));
  } else {
    sellGridStep = Math.max(0.00001, pyFloat(zget(zone, 'sell_grid_step', gridStep)));
    const rawSellLot = zget(zone, 'sell_lot_size', null);
    sellLot = rawSellLot === null || rawSellLot === '' ? lot : lotOf(rawSellLot, symbol, infos, zoneIdx, 'SELL', state);
    sellTp = pyFloat(zget(zone, 'sell_take_profit', tp));
    sellSl = pyFloat(zget(zone, 'sell_stop_loss', sl));
    sellPullback = pyFloat(zget(zone, 'sell_pullback_distance', zget(zone, 'pullback_distance', 0.5)));
  }

  const entryMode = choice(zone.entry_mode, ENTRY_MODES, 'grid');
  // Fraktal-Modus nutzt Grid/TP/SL nicht: keine Umrechnung Betrag → Preis
  const stepByLoss = Boolean(zget(zone, 'step_by_loss', false)) && entryMode === 'grid';
  let pullback = pyFloat(zget(zone, 'pullback_distance', 0.5));
  // Eigene SELL-Anzahl nur bei BOTH ohne Sync (nur dann zeigt die UI das Feld)
  const fractalOrderCount = fractalCount(zget(zone, 'fractal_order_count', 1), 1);
  let sellFractalOrderCount = fractalOrderCount;
  if (orderType === 'BOTH' && !sync) {
    sellFractalOrderCount = fractalCount(zget(zone, 'sell_fractal_order_count', fractalOrderCount), fractalOrderCount);
  }

  if (stepByLoss) {
    const conv = (amount: number, l: number) => {
      const d = moneyToPriceDistance(amount, l, symbol, infos);
      if (d === null) throw new InvalidZoneConfigError('config.noTickValue', { zone: zoneIdx + 1, symbol });
      return d;
    };
    // Pullback / TP / SL dürfen 0 sein (= keiner); 0 nicht auf 1 point heben
    const conv0 = (amount: number, l: number) => (amount > 0 ? conv(amount, l) : 0);
    gridStep = conv(gridStep, lot);
    sellGridStep = conv(sellGridStep, sellLot);
    pullback = conv0(pullback, lot);
    sellPullback = conv0(sellPullback, sellLot);
    tp = conv0(tp, lot);
    sl = conv0(sl, lot);
    sellTp = conv0(sellTp, sellLot);
    sellSl = conv0(sellSl, sellLot);
  }

  const unitVersion = zone.fractal_next_loss_unit_version;
  let fractalNextLossUnitVersion = 0;
  if (unitVersion != null) fractalNextLossUnitVersion = typeof unitVersion === 'number' ? unitVersion : -1;
  return {
    orderType,
    minPrice,
    maxPrice,
    gridStep,
    lotSize: lot,
    takeProfit: tp,
    stopLoss: sl,
    symbol,
    syncBuySell: sync,
    levelsBelow: pyInt(zget(zone, 'levels_below', 5)),
    levelsAbove: pyInt(zget(zone, 'levels_above', 5)),
    maxPositions: maxPositionsOf(zone),
    isBreakout: Boolean(zget(zone, 'is_breakout', false)),
    pullbackDistance: pullback,
    sellGridStep,
    sellLotSize: sellLot,
    sellTakeProfit: sellTp,
    sellStopLoss: sellSl,
    sellPullbackDistance: sellPullback,
    targetMagic: zoneMagic(zone, zoneIdx),
    stepByLoss,
    instantEntry: Boolean(zget(zone, 'instant_entry', false)),
    entryMode,
    fractalTimeframe: choice(zone.fractal_timeframe, FRACTAL_TIMEFRAMES, 'H4'),
    fractalOrderMode: choice(zone.fractal_order_mode, FRACTAL_ORDER_MODES, 'breakout'),
    fractalUseSl: Boolean(zget(zone, 'fractal_use_sl', true)),
    fractalSlMode: choice(zone.fractal_sl_mode, FRACTAL_SL_MODES, 'atr'),
    fractalSlBuffer: Math.max(0, pyFloat(zget(zone, 'fractal_sl_buffer', 0.05))),
    fractalAtrPeriod: Math.max(1, pyInt(zget(zone, 'fractal_atr_period', 14))),
    fractalAtrMultiplier: Math.max(0, pyFloat(zget(zone, 'fractal_atr_multiplier', 1.5))),
    fractalSarStep: Math.max(0.001, pyFloat(zget(zone, 'fractal_sar_step', 0.02))),
    fractalSarMax: Math.max(0.001, pyFloat(zget(zone, 'fractal_sar_max', 0.2))),
    fractalRr: Math.max(0, pyFloat(zget(zone, 'fractal_rr', 2.0))),
    fractalOrderCount,
    sellFractalOrderCount,
    fractalTpByMoney: Boolean(zget(zone, 'fractal_tp_by_money', false)),
    fractalTpMoney: Math.max(0, pyFloat(zget(zone, 'fractal_tp_money', 10.0))),
    fractalNextLoss: Math.max(0, pyFloat(zget(zone, 'fractal_next_loss', 0) || 0)),
    fractalNextLossUnitVersion,
    fractalNextLossMode: choice(zone.fractal_next_loss_mode, FRACTAL_NEXT_LOSS_MODES, 'money'),
  };
}
