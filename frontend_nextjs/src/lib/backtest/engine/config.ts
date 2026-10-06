/**
 * Zonen-Einstellungen → Motor-Konfiguration. Quelle:
 * worker_python/src/core/grid_execution/config.py (extract_zone_config, max_positions_of,
 * money_to_price_distance, _lot_of). Fraktal-Felder (Setups, SL-Modus …) kommen mit B3.
 */
import type { SymbolInfos } from './gridHelpers';
import { pyRound } from './pyRound';
import { pyBool, pyFloat, pyGet, pyInt, pyStr, type LogFn } from './state';
import { snapVolume } from './tradeUtils';
import { zoneMagic, type Zone } from './zoneMagic';

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

/** Lot-Obergrenze des Motors (unabhängig von volume_max) */
export const MAX_LOT = 5.0;

export function isFractalZone(zone: unknown): boolean {
  return !!zone && typeof zone === 'object' && (zone as Zone).entry_mode === 'fractal';
}

/** Positionsgrenze der Zone (0 = unbegrenzt → 500) */
export function maxPositionsOf(zone: Zone, def = 10): number {
  return pyInt(pyGet(zone, 'max_positions', def)) || 500;
}

/** Geld je 1 Lot und 1,0 Preiseinheit (tick_value / tick_size, sonst Kontraktgröße) */
export function moneyPerPriceUnit(symbol: string, symbolInfos: SymbolInfos | null): number | null {
  const info = (symbolInfos ?? {})[symbol];
  if (info === undefined) return null;
  const tickValue = Number(info.trade_tick_value || 0);
  const tickSize = Number(info.trade_tick_size || 0);
  if (tickValue > 0 && tickSize > 0) return tickValue / tickSize;
  const contract = Number(info.trade_contract_size || 0);
  return contract > 0 ? contract : null;
}

/** „Abstand nach Verlust“: Betrag → Preisabstand (auf point gerundet, mind. 1 point) */
export function moneyToPriceDistance(
  amount: number,
  lot: number,
  symbol: string,
  symbolInfos: SymbolInfos | null,
): number | null {
  const perUnit = moneyPerPriceUnit(symbol, symbolInfos);
  if (!perUnit || lot <= 0) return null;
  let distance = Number(amount) / (lot * perUnit);
  const info = (symbolInfos ?? {})[symbol];
  const point = Number(info?.point || 0);
  if (point > 0) {
    distance = Math.max(point, pyRound(pyRound(distance / point) * point, Math.trunc(Number(info?.digits ?? 5))));
  }
  return distance;
}

// Erhöhtes Lot nicht in jedem Durchlauf loggen: (Zone, Symbol, Seite, eingegeben, benutzt)
const lotRaisedLogged = new Set<string>();

function lotOf(raw: unknown, symbol: string, symbolInfos: SymbolInfos | null, zoneIdx: number, side: string, log: LogFn): number {
  let lot: number;
  try {
    lot = pyFloat(raw);
  } catch {
    lot = 0;
  }
  if (Number.isNaN(lot)) lot = 0;
  const capped = Math.min(MAX_LOT, lot);
  const info = (symbolInfos ?? {})[symbol];
  const result = info !== undefined ? snapVolume(capped, info) : Math.max(0.01, capped);
  if (result > lot + 1e-9) {
    const key = `${zoneIdx}|${symbol}|${side}|${lot}|${result}`;
    if (!lotRaisedLogged.has(key)) {
      if (lotRaisedLogged.size > 200) lotRaisedLogged.clear();
      lotRaisedLogged.add(key);
      log(`Zone ${zoneIdx + 1}: ${side} lot ${lot} ${symbol} için geçersiz/minimumun altında → ${result} kullanılıyor`, 'WARNING');
    }
  }
  return result;
}

export function extractZoneConfig(
  zone: Zone,
  zoneIdx: number,
  log: LogFn,
  symbolInfos: SymbolInfos | null = null,
): ZoneConfig {
  if (!zone || typeof zone !== 'object' || Array.isArray(zone)) {
    throw new InvalidZoneConfigError(`Zone ${zoneIdx + 1}: config must be a dict`);
  }
  const orderType = pyStr(pyGet(zone, 'order_type', 'BUY')).toUpperCase();
  const minPrice = pyFloat(pyGet(zone, 'min_price', 0));
  const maxPrice = pyFloat(pyGet(zone, 'max_price', 0));
  if (minPrice >= maxPrice) throw new InvalidZoneConfigError(`Zone ${zoneIdx + 1}: min_price must be < max_price`);

  let gridStep = Math.max(0.00001, pyFloat(pyGet(zone, 'grid_step', 0.05)));
  let tpVal = pyFloat(pyGet(zone, 'take_profit', 0.05));
  let slVal = pyFloat(pyGet(zone, 'stop_loss', 0.0));
  const symbol = String(pyGet(zone, 'symbol', '')).toUpperCase().trim();
  if (!symbol) throw new InvalidZoneConfigError(`Zone ${zoneIdx + 1}: symbol is required`);
  const lotVal = lotOf(pyGet(zone, 'lot_size', 0.01), symbol, symbolInfos, zoneIdx, 'BUY', log);

  const isSync = pyBool(pyGet(zone, 'sync_buy_sell', true));
  let sellGridStep: number;
  let sellLotVal: number;
  let sellTpVal: number;
  let sellSlVal: number;
  let sellPullback: number;
  if (isSync) {
    sellGridStep = gridStep;
    sellLotVal = lotVal;
    sellTpVal = tpVal;
    sellSlVal = slVal;
    sellPullback = pyFloat(pyGet(zone, 'pullback_distance', 0.5));
  } else {
    sellGridStep = Math.max(0.00001, pyFloat(pyGet(zone, 'sell_grid_step', gridStep)));
    const rawSellLot = pyGet(zone, 'sell_lot_size', null);
    sellLotVal =
      rawSellLot === null || rawSellLot === undefined || rawSellLot === ''
        ? lotVal
        : lotOf(rawSellLot, symbol, symbolInfos, zoneIdx, 'SELL', log);
    sellTpVal = pyFloat(pyGet(zone, 'sell_take_profit', tpVal));
    sellSlVal = pyFloat(pyGet(zone, 'sell_stop_loss', slVal));
    sellPullback = pyFloat(pyGet(zone, 'sell_pullback_distance', pyGet(zone, 'pullback_distance', 0.5)));
  }

  const levelsBelow = pyInt(pyGet(zone, 'levels_below', 5));
  const levelsAbove = pyInt(pyGet(zone, 'levels_above', 5));
  const maxPositions = maxPositionsOf(zone);
  const isBreakout = pyBool(pyGet(zone, 'is_breakout', false));
  let pullback = pyFloat(pyGet(zone, 'pullback_distance', 0.5));
  const targetMagic = zoneMagic(zone, zoneIdx);

  const rawMode = pyGet(zone, 'entry_mode', null);
  const entryMode = pyStr(rawMode ?? 'grid') === 'fractal' ? 'fractal' : 'grid';
  const stepByLoss = pyBool(pyGet(zone, 'step_by_loss', false)) && entryMode === 'grid';

  if (stepByLoss) {
    const conv = (amount: number, lot: number) => {
      const d = moneyToPriceDistance(amount, lot, symbol, symbolInfos);
      if (d === null) {
        throw new InvalidZoneConfigError(
          `Zone ${zoneIdx + 1}: ${symbol} için tick değeri yok, zarara göre aralık hesaplanamıyor`,
        );
      }
      return d;
    };
    // Pullback / TP / SL dürfen 0 sein (= keins); 0 nicht auf 1 point heben
    const conv0 = (amount: number, lot: number) => (amount > 0 ? conv(amount, lot) : 0);
    gridStep = conv(gridStep, lotVal);
    sellGridStep = conv(sellGridStep, sellLotVal);
    pullback = conv0(pullback, lotVal);
    sellPullback = conv0(sellPullback, sellLotVal);
    tpVal = conv0(tpVal, lotVal);
    slVal = conv0(slVal, lotVal);
    sellTpVal = conv0(sellTpVal, sellLotVal);
    sellSlVal = conv0(sellSlVal, sellLotVal);
  }

  return {
    orderType,
    minPrice,
    maxPrice,
    gridStep,
    lotSize: lotVal,
    takeProfit: tpVal,
    stopLoss: slVal,
    symbol,
    syncBuySell: isSync,
    levelsBelow,
    levelsAbove,
    maxPositions,
    isBreakout,
    pullbackDistance: pullback,
    sellGridStep,
    sellLotSize: sellLotVal,
    sellTakeProfit: sellTpVal,
    sellStopLoss: sellSlVal,
    sellPullbackDistance: sellPullback,
    targetMagic,
    stepByLoss,
    instantEntry: pyBool(pyGet(zone, 'instant_entry', false)),
    entryMode,
  };
}
