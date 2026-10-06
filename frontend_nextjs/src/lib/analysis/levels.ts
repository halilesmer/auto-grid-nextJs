/**
 * Stufen einer Grid-Zone für den Chart: dieselbe Rechnung wie der Bot
 * (worker_python/src/core/grid_execution/levels.py → generate_levels, „desired“ Stufen).
 * Gerechnet wird vom aktuellen Preis aus; bei „Abstand nach Verlust“ und „sofortiger Einstieg“ von
 * der letzten offenen Position der Seite aus. Nur zur Anzeige, der Bot rechnet selbst.
 * Die Kernrechnung `levelSets` nutzt auch der Bot-Nachbau des Backtests (lib/backtest/engine/, BKT-02).
 */
import type { SymbolDetail, ZoneSettings } from '@/store/types';
import { getSymbolConfig, lossToPriceDistance, normalizeLot } from '@/utils/zoneHelpers';
import { pyRound } from '@/lib/backtest/engine/pyRound';

/** Offene Position wie in den Live-Metriken (grid_metrics.py): type 0 = BUY, 1 = SELL */
export interface LevelPosition {
  ticket: number;
  magic: number;
  type: number;
  price_open: number | null;
  time?: number | null;
  time_msc?: number | null;
}

export type LevelsUnavailable = 'fractal' | 'noSymbolInfo' | 'noPrice';

export interface ZoneLevels {
  buy: number[];
  sell: number[];
  /** Gesetzt, wenn keine Stufen gerechnet werden können (Grund für den Hinweis) */
  unavailable?: LevelsUnavailable;
}

/** Wie der Motor: MAX_LOT in grid_execution/config.py */
const MAX_LOT = 5;
const POSITION_BUY = 0;
const POSITION_SELL = 1;

/**
 * `pricePoint`: Preisschritt und Nachkommastellen des Symbols (z. B. aus der /rates-Antwort), sonst aus
 * `symbolDetails`. Ohne beides keine Stufen: gerundet auf 2 Stellen lägen sie bei 3-/5-stelligen
 * Symbolen falsch.
 */
export function zoneLevels(
  zone: ZoneSettings,
  price: number | null,
  positions: LevelPosition[],
  symbolDetails: Record<string, SymbolDetail>,
  pricePoint: { point: number; digits: number } | null = null,
): ZoneLevels {
  if (zone.entry_mode === 'fractal') return { buy: [], sell: [], unavailable: 'fractal' };
  if (price === null || !Number.isFinite(price) || price <= 0) return { buy: [], sell: [], unavailable: 'noPrice' };

  const symbol = (zone.symbol ?? '').toUpperCase();
  const detail = symbolDetails[symbol];
  const cfg = getSymbolConfig(symbol, symbolDetails);
  const detailGrid = detail && detail.point > 0 ? detail : null;
  const grid = pricePoint && pricePoint.point > 0 ? pricePoint : detailGrid;
  if (!grid) return { buy: [], sell: [], unavailable: 'noSymbolInfo' };
  const normalize = (p: number) => pyRound(pyRound(p / grid.point) * grid.point, grid.digits);
  const lotOf = (raw: number) => {
    const capped = Math.min(MAX_LOT, Number.isFinite(raw) ? raw : 0);
    return detail ? normalizeLot(capped, cfg) : Math.max(0.01, capped);
  };

  const sync = zone.sync_buy_sell ?? true;
  let step = Math.max(0.00001, zone.grid_step);
  let sellStep = sync ? step : Math.max(0.00001, zone.sell_grid_step ?? step);
  let pullback = zone.pullback_distance ?? 0.5;
  let sellPullback = sync ? pullback : (zone.sell_pullback_distance ?? pullback);

  if (zone.step_by_loss) {
    const lot = lotOf(zone.lot_size);
    const sellLot = sync || zone.sell_lot_size == null ? lot : lotOf(zone.sell_lot_size);
    const conv = (amount: number, l: number) => lossToPriceDistance(amount, l, cfg);
    const s = conv(step, lot);
    const ss = conv(sellStep, sellLot);
    if (s === null || ss === null) return { buy: [], sell: [], unavailable: 'noSymbolInfo' };
    step = s;
    sellStep = ss;
    pullback = pullback > 0 ? (conv(pullback, lot) ?? 0) : 0;
    sellPullback = sellPullback > 0 ? (conv(sellPullback, sellLot) ?? 0) : 0;
  }

  const sets = levelSets(
    {
      orderType: (zone.order_type ?? 'BUY').toUpperCase(),
      minPrice: zone.min_price,
      maxPrice: zone.max_price,
      gridStep: step,
      sellGridStep: sellStep,
      levelsBelow: Math.max(0, Math.floor(zone.levels_below ?? 0)),
      levelsAbove: Math.max(0, Math.floor(zone.levels_above ?? 0)),
      isBreakout: Boolean(zone.is_breakout),
      pullbackDistance: pullback,
      sellPullbackDistance: sellPullback,
      anchored: Boolean(zone.step_by_loss || zone.instant_entry),
      magic: zone.magic,
    },
    price,
    positions,
    normalize,
  );
  return { buy: sets.desiredBuy, sell: sets.desiredSell };
}

export interface LevelSetInput {
  orderType: string;
  minPrice: number;
  maxPrice: number;
  gridStep: number;
  sellGridStep: number;
  levelsBelow: number;
  levelsAbove: number;
  isBreakout: boolean;
  pullbackDistance: number;
  sellPullbackDistance: number;
  /** „Abstand nach Verlust“ / „sofortiger Einstieg“: Raster ab der letzten Position der Seite */
  anchored: boolean;
  magic: number | undefined;
}

/** Gewünschte Stufen (Orders) und erlaubte Stufen (Orders dort bleiben stehen), wie generate_levels */
export interface LevelSets {
  desiredBuy: number[];
  desiredSell: number[];
  acceptableBuy: number[];
  acceptableSell: number[];
}

/** Puffer der erlaubten Stufen über die gewünschten hinaus (buffer_steps in levels.py) */
const BUFFER_STEPS = 2;

/**
 * Kernrechnung von generate_levels (worker_python/src/core/grid_execution/levels.py), gemeinsam für die
 * Chart-Stufen (zoneLevels) und den Bot-Nachbau des Backtests (lib/backtest/engine/handler.ts).
 * `normalize` rundet einen Preis aufs Raster des Symbols (normalize_price).
 */
export function levelSets(
  input: LevelSetInput,
  price: number,
  positions: LevelPosition[],
  normalize: (p: number) => number,
): LevelSets {
  const anchor = (type: number, s: number) => {
    if (input.anchored) {
      const side = positions.filter((p) => p.magic === input.magic && p.type === type && p.price_open !== null);
      if (side.length > 0) {
        // Wie der Bot: jüngste nach time_msc, bei Gleichstand das höhere Ticket
        const at = (p: LevelPosition) => p.time_msc ?? (p.time ?? 0) * 1000;
        const last = side.reduce((a, b) => (at(b) > at(a) || (at(b) === at(a) && b.ticket > a.ticket) ? b : a));
        const open = last.price_open as number;
        return open + pyRound((price - open) / s) * s;
      }
    }
    return pyRound(price / s) * s;
  };

  const zMin = pyRound(input.minPrice, 5);
  const zMax = pyRound(input.maxPrice, 5);
  const inZone = (p: number) => zMin <= pyRound(p, 5) && pyRound(p, 5) <= zMax;
  const { gridStep: step, sellGridStep: sellStep, levelsBelow: below, levelsAbove: above } = input;
  const sets: LevelSets = { desiredBuy: [], desiredSell: [], acceptableBuy: [], acceptableSell: [] };

  for (const p of positions) {
    if (p.magic !== input.magic || p.price_open === null) continue;
    if (p.type === POSITION_BUY) sets.acceptableBuy.push(normalize(p.price_open));
    else if (p.type === POSITION_SELL) sets.acceptableSell.push(normalize(p.price_open));
  }

  if (input.orderType === 'BUY' || input.orderType === 'BOTH') {
    const a = anchor(POSITION_BUY, step);
    if (!input.isBreakout) {
      for (let i = 1; i <= below; i++) if (inZone(a - i * step)) sets.desiredBuy.push(normalize(a - i * step));
    }
    for (let i = 1; i <= above; i++) {
      const p = a + i * step;
      if (input.isBreakout && pyRound(p - price, 5) < pyRound(input.pullbackDistance, 5)) continue;
      if (inZone(p)) sets.desiredBuy.push(normalize(p));
    }
    for (let i = -below - BUFFER_STEPS; i < above + BUFFER_STEPS + 1; i++) {
      const p = a + i * step;
      if (input.isBreakout && p < price) continue;
      sets.acceptableBuy.push(normalize(p));
    }
  }
  if (input.orderType === 'SELL' || input.orderType === 'BOTH') {
    const a = anchor(POSITION_SELL, sellStep);
    if (!input.isBreakout) {
      for (let i = 1; i <= above; i++) if (inZone(a + i * sellStep)) sets.desiredSell.push(normalize(a + i * sellStep));
    }
    for (let i = 1; i <= below; i++) {
      const p = a - i * sellStep;
      if (input.isBreakout && pyRound(price - p, 5) < pyRound(input.sellPullbackDistance, 5)) continue;
      if (inZone(p)) sets.desiredSell.push(normalize(p));
    }
    for (let i = -below - BUFFER_STEPS; i < above + BUFFER_STEPS + 1; i++) {
      const p = a + i * sellStep;
      if (input.isBreakout && p > price) continue;
      sets.acceptableSell.push(normalize(p));
    }
  }
  return sets;
}
