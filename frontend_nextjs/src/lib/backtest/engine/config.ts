/**
 * Zonen-Einstellungen → Rechenwerte des Bots (Grid-Teil).
 * Quelle: worker_python/src/core/grid_execution/config.py (extract_zone_config, _lot_of,
 * money_per_price_unit, money_to_price_distance, max_positions_of). Fraktal-Felder kommen mit B3.
 */
import { pyFloat, pyInt, zget, type SymbolInfos } from './helpers';
import { pyRound } from './pyRound';
import type { EngineState } from './state';
import { snapVolume } from './tradeUtils';
import type { ZoneDict } from './types';
import { zoneMagic } from './zoneMagic';

export class InvalidZoneConfigError extends Error {}

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
  let lot = pyFloat(raw);
  if (Number.isNaN(lot)) lot = 0;
  const capped = Math.min(MAX_LOT, lot);
  const info = infos[symbol];
  const result = info ? snapVolume(capped, info) : Math.max(0.01, capped);
  if (result > lot + 1e-9) state.log('WARN', 'config.lotRaised', { zone: zoneIdx + 1, symbol, side, lot, used: result });
  return result;
}

export function extractZoneConfig(zone: ZoneDict, zoneIdx: number, infos: SymbolInfos, state: EngineState): ZoneConfig {
  const orderType = String(zget(zone, 'order_type', 'BUY')).toUpperCase();

  const minPrice = pyFloat(zget(zone, 'min_price', 0));
  const maxPrice = pyFloat(zget(zone, 'max_price', 0));
  if (minPrice >= maxPrice) throw new InvalidZoneConfigError(`Zone ${zoneIdx + 1}: min_price must be < max_price`);

  let gridStep = Math.max(0.00001, pyFloat(zget(zone, 'grid_step', 0.05)));
  let tp = pyFloat(zget(zone, 'take_profit', 0.05));
  let sl = pyFloat(zget(zone, 'stop_loss', 0.0));
  const symbol = String(zget(zone, 'symbol', '')).toUpperCase().trim();
  if (!symbol) throw new InvalidZoneConfigError(`Zone ${zoneIdx + 1}: symbol is required`);
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

  const entryMode = zone.entry_mode === 'fractal' ? 'fractal' : 'grid';
  // Fraktal-Modus nutzt Grid/TP/SL nicht: keine Umrechnung Betrag → Preis
  const stepByLoss = Boolean(zget(zone, 'step_by_loss', false)) && entryMode === 'grid';
  let pullback = pyFloat(zget(zone, 'pullback_distance', 0.5));

  if (stepByLoss) {
    const conv = (amount: number, l: number) => {
      const d = moneyToPriceDistance(amount, l, symbol, infos);
      if (d === null) throw new InvalidZoneConfigError(`Zone ${zoneIdx + 1}: no tick value for ${symbol}`);
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
  };
}
