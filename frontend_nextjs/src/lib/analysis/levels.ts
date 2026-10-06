/**
 * Stufen einer Grid-Zone für den Chart: dieselbe Rechnung wie der Bot
 * (worker_python/src/core/grid_execution/levels.py → generate_levels, „desired“ Stufen).
 * Gerechnet wird vom aktuellen Preis aus; bei „Abstand nach Verlust“ und „sofortiger Einstieg“ von
 * der letzten offenen Position der Seite aus. Nur zur Anzeige, der Bot rechnet selbst.
 */
import type { SymbolDetail, ZoneSettings } from '@/store/types';
import { getSymbolConfig, lossToPriceDistance, normalizeLot } from '@/utils/zoneHelpers';

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

/** Python round(): halbe Werte zur geraden Zahl */
function pyRound(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

function round5(x: number): number {
  return Number(x.toFixed(5));
}

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
  const normalize = (p: number) => Number((pyRound(p / grid.point) * grid.point).toFixed(grid.digits));
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

  const anchored = Boolean(zone.step_by_loss || zone.instant_entry);
  const anchor = (type: number, s: number) => {
    if (anchored) {
      const side = positions.filter((p) => p.magic === zone.magic && p.type === type && p.price_open !== null);
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

  const zMin = round5(zone.min_price);
  const zMax = round5(zone.max_price);
  const inZone = (p: number) => zMin <= round5(p) && round5(p) <= zMax;
  const below = Math.max(0, Math.floor(zone.levels_below ?? 0));
  const above = Math.max(0, Math.floor(zone.levels_above ?? 0));
  const type = (zone.order_type ?? 'BUY').toUpperCase();
  const buy: number[] = [];
  const sell: number[] = [];

  if (type === 'BUY' || type === 'BOTH') {
    const a = anchor(POSITION_BUY, step);
    if (!zone.is_breakout) {
      for (let i = 1; i <= below; i++) if (inZone(a - i * step)) buy.push(normalize(a - i * step));
    }
    for (let i = 1; i <= above; i++) {
      const p = a + i * step;
      if (zone.is_breakout && round5(p - price) < round5(pullback)) continue;
      if (inZone(p)) buy.push(normalize(p));
    }
  }
  if (type === 'SELL' || type === 'BOTH') {
    const a = anchor(POSITION_SELL, sellStep);
    if (!zone.is_breakout) {
      for (let i = 1; i <= above; i++) if (inZone(a + i * sellStep)) sell.push(normalize(a + i * sellStep));
    }
    for (let i = 1; i <= below; i++) {
      const p = a - i * sellStep;
      if (zone.is_breakout && round5(price - p) < round5(sellPullback)) continue;
      if (inZone(p)) sell.push(normalize(p));
    }
  }
  return { buy, sell };
}
