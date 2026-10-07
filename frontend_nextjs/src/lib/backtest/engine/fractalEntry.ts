/**
 * Fraktal-Einstieg: die Zone setzt statt eines Grids nur Pending Orders auf Fraktal-Stufen.
 * Quelle: worker_python/src/core/grid_execution/fractal_entry.py (manage_fractal_orders).
 *
 * Je Seite (oben "U" / unten "D") bekommen die neuesten N bestätigten Fraktale je eine Order
 * (ENG-21, ENG-26): breakout → oberes Fraktal BUY STOP, unteres SELL STOP; rebound → oberes SELL LIMIT,
 * unteres BUY LIMIT. Hat der Kurs ein Fraktal erreicht, ist es „verbraucht“: keine neue Order, eine
 * bestehende bleibt (über die Füllung entscheidet der Broker). Verschwindet eine Fraktal-Order, ohne
 * dass der Bot sie löscht, gilt das Fraktal als erledigt. ENG-30: die nächste Order einer Richtung erst,
 * wenn die jüngste Position der Richtung genug im Verlust ist.
 *
 * Nicht übernommen: die Datei fractal_state_<konto>.json (der Lauf startet ohne sie) und die Orders
 * entfernter Zusatz-Setups (legacy_setup_orders.py; der Backtest erzeugt keine).
 */
import { fractalsOf, type BarFractal } from '@/lib/analysis/fractals';
import { FRACTAL_MAX_ORDERS, moneyToPriceDistance, type ZoneConfig } from './config';
import { atr, parabolicSar } from './fractalSignals';
import { normalizePrice, normalizeVolume, type SymbolInfos } from './helpers';
import {
  cancelOrder,
  fractalComment,
  modifyPendingOrder,
  modifyPositionTpSl,
  parseFractalComment,
  sendPendingOrderHelper,
} from './orders';
import type { EngineState, FractalTrack } from './state';
import {
  ORDER_TYPE_BUY_LIMIT,
  ORDER_TYPE_BUY_STOP,
  ORDER_TYPE_SELL_LIMIT,
  ORDER_TYPE_SELL_STOP,
  POSITION_TYPE_BUY,
  POSITION_TYPE_SELL,
  TF_SECONDS,
  type Bar,
  type Broker,
  type Order,
  type Position,
  type Tick,
  type Timeframe,
} from './types';

/** Gelesene geschlossene Kerzen für Fraktal, ATR und SAR */
const RATES_COUNT = 300;

type Side = 'U' | 'D';
type Direction = 'BUY' | 'SELL';

interface DesiredOrder {
  side: Side;
  fractal: BarFractal;
  direction: Direction;
  orderType: number;
  price: number;
  sl: number;
  tp: number;
  lot: number;
  /** false: Kurs näher als stops_level am Einstieg → keine neue Order */
  priceOk: boolean;
  /** false: SL/TP näher als stops_level am Einstieg (MT5 lehnt ab / enforce_stops_level verschiebt) */
  stopsOk: boolean;
  doneKey: string;
  /** true: Kurs hat das Fraktal erreicht → keine neue Order, eine bestehende bleibt */
  consumed: boolean;
}

function placeable(d: DesiredOrder): boolean {
  return !d.consumed && d.priceOk && d.stopsOk;
}

/** Kerzen und Indikatoren der Zone in diesem Durchlauf */
interface Market {
  closed: Bar[];
  forming: Bar;
  ups: BarFractal[];
  downs: BarFractal[];
  atrVals: (number | null)[];
  sarVals: (number | null)[];
  sarLong: boolean[];
}

/** Ein Log je Schlüssel und Wert (_log_once); `fractalTime` siehe FractalLogged */
function logOnce(
  state: EngineState,
  key: string,
  entry: { zone: number; fractalTime: number | null; value: unknown },
  level: 'INFO' | 'WARN',
  code: string,
  params: Record<string, unknown>,
): void {
  if (state.fractalLogged.get(key)?.value === entry.value) return;
  state.fractalLogged.set(key, entry);
  state.log(level, code, params);
}

// ------------------------------------------------------------------ Erledigt-Liste

function doneKeyOf(zoneKey: string, config: ZoneConfig, side: Side): string {
  // Symbol und Zeitrahmen im Schlüssel: ein auf H4 erledigtes Fraktal sperrt nach dem Wechsel auf M15 nichts
  return `${zoneKey}:${config.symbol}:${config.fractalTimeframe}:${side}`;
}

function markDone(state: EngineState, key: string, barTime: number): boolean {
  let times = state.fractalDone.get(key);
  if (!times) {
    times = new Set();
    state.fractalDone.set(key, times);
  }
  if (times.has(barTime)) return false;
  times.add(barTime);
  // Nur die neuesten FRACTAL_MAX_ORDERS Fraktale können Kandidat sein; ältere Einträge braucht es nicht
  if (times.size > FRACTAL_MAX_ORDERS) {
    const newest = [...times].sort((a, b) => a - b).slice(-FRACTAL_MAX_ORDERS);
    state.fractalDone.set(key, new Set(newest));
  }
  return true;
}

function trackedOf(state: EngineState, zoneIdx: number): Map<number, FractalTrack> {
  let tracked = state.fractalTracked.get(zoneIdx);
  if (!tracked) {
    tracked = new Map();
    state.fractalTracked.set(zoneIdx, tracked);
  }
  return tracked;
}

/** Verschwundene Fraktal-Orders und Fraktal-Positionen als erledigt markieren (_update_done) */
function updateDone(
  state: EngineState,
  zoneIdx: number,
  zoneKey: string,
  config: ZoneConfig,
  zoneOrders: Order[],
  zonePositions: Position[],
): void {
  const tracked = trackedOf(state, zoneIdx);
  const live = new Set(zoneOrders.map((o) => o.ticket));
  const positionIds = new Set(zonePositions.map((p) => p.identifier || p.ticket));

  for (const [ticket, track] of [...tracked]) {
    if (live.has(ticket)) continue;
    tracked.delete(ticket);
    if (state.fractalOwnCancels.has(ticket)) {
      state.fractalOwnCancels.delete(ticket);
      continue;
    }
    if (markDone(state, track.doneKey, track.barTime)) {
      state.log('INFO', 'fractal.done', {
        zone: zoneIdx + 1,
        side: track.side,
        time: track.barTime,
        ticket,
        filled: positionIds.has(ticket),
      });
    }
  }

  for (const p of zonePositions) {
    const parsed = parseFractalComment(p.comment);
    // Position eines entfernten Zusatz-Setups (Nummer ≥ 2) erledigt kein Fraktal dieser Zone
    if (parsed && parsed[0] === 1) markDone(state, doneKeyOf(zoneKey, config, parsed[1]), parsed[2]);
  }

  // Tickets, die keine Zone mehr verfolgt, sammeln sich nicht an
  const stillTracked = new Set<number>();
  for (const t of state.fractalTracked.values()) for (const ticket of t.keys()) stillTracked.add(ticket);
  for (const ticket of [...state.fractalOwnCancels]) {
    if (!stillTracked.has(ticket)) state.fractalOwnCancels.delete(ticket);
  }
}

// ------------------------------------------------------------------ Ziel-Orders

function directionOf(config: ZoneConfig, side: Side): Direction {
  const breakout = config.fractalOrderMode === 'breakout';
  if (side === 'U') return breakout ? 'BUY' : 'SELL';
  return breakout ? 'SELL' : 'BUY';
}

/** SL nach dem gewählten Modus (nicht normiert) oder null, wenn er sich nicht berechnen lässt */
function slFor(config: ZoneConfig, direction: Direction, f: BarFractal, m: Market): number | null {
  const buf = config.fractalSlBuffer;
  switch (config.fractalSlMode) {
    case 'atr': {
      const a = f.index >= 0 && f.index < m.atrVals.length ? m.atrVals[f.index] : null;
      if (a === null) return null;
      const k = config.fractalAtrMultiplier * a;
      return direction === 'BUY' ? f.low - k : f.high + k;
    }
    case 'opposite_fractal': {
      // BUY → unter das letzte untere Fraktal, SELL → über das letzte obere
      const refs = direction === 'BUY' ? m.downs : m.ups;
      if (refs.length === 0) return null;
      const ref = refs[refs.length - 1].price;
      return direction === 'BUY' ? ref - buf : ref + buf;
    }
    case 'sar':
      return m.sarVals.length > 0 ? m.sarVals[m.sarVals.length - 1] : null;
    case 'buffer':
      return direction === 'BUY' ? f.low - buf : f.high + buf;
  }
}

function sideLogKey(zoneIdx: number, side: Side, f: BarFractal, kind = ''): string {
  return `${zoneIdx}|${side}|${kind}|${f.time}`;
}

function fractalParams(config: ZoneConfig, zoneIdx: number, side: Side, f: BarFractal): Record<string, unknown> {
  return { zone: zoneIdx + 1, tf: config.fractalTimeframe, side, price: f.price, time: f.time };
}

interface BuildContext {
  config: ZoneConfig;
  zoneIdx: number;
  zoneKey: string;
  m: Market;
  tick: Tick;
  infos: SymbolInfos;
  state: EngineState;
}

function buildDesired(ctx: BuildContext, side: Side, f: BarFractal): DesiredOrder | null {
  const { config, zoneIdx, zoneKey, m, tick, infos, state } = ctx;
  const breakout = config.fractalOrderMode === 'breakout';
  const direction = directionOf(config, side);
  const logKey = sideLogKey(zoneIdx, side, f);
  const params = fractalParams(config, zoneIdx, side, f);
  const sideEntry = (value: unknown) => ({ zone: zoneIdx, fractalTime: f.time, value });

  const doneKey = doneKeyOf(zoneKey, config, side);
  if (state.fractalDone.get(doneKey)?.has(f.time)) return null;
  if (!(config.minPrice <= f.price && f.price <= config.maxPrice)) {
    logOnce(state, logKey, sideEntry('range'), 'INFO', 'fractal.outOfRange', params);
    return null;
  }

  const later = [...m.closed.slice(f.index + 1), m.forming];
  const consumed =
    side === 'U'
      ? later.some((b) => b.high >= f.price) || tick.bid >= f.price
      : later.some((b) => b.low <= f.price) || tick.ask <= f.price;

  let orderType: number;
  let lot: number;
  if (direction === 'BUY') {
    orderType = breakout ? ORDER_TYPE_BUY_STOP : ORDER_TYPE_BUY_LIMIT;
    lot = config.lotSize;
  } else {
    orderType = breakout ? ORDER_TYPE_SELL_STOP : ORDER_TYPE_SELL_LIMIT;
    lot = config.sellLotSize;
  }
  const entry = normalizePrice(f.price, config.symbol, infos);
  const volume = normalizeVolume(lot, config.symbol, infos);
  const base = { side, fractal: f, direction, orderType, price: entry, lot: volume, doneKey };
  if (consumed) {
    // Nur zum Zuordnen der bestehenden Order (damit sie bleibt): keine neue Order, SL/TP unverändert
    // (stopsOk=false → kein MODIFY; dicht am Kurs griffe sonst freeze_level), keine SL-Warnung.
    // Das Log „überschritten“ schreibt manageOrders: erst dort ist klar, ob es eine Order gibt.
    return { ...base, sl: 0, tp: 0, priceOk: false, stopsOk: false, consumed: true };
  }

  const info = infos[config.symbol];
  const point = info?.point || 0;
  const stops = info ? (info.trade_stops_level || 0) * point : 0;
  const minDist = Math.max(point, 1e-9);

  const useSl = config.fractalUseSl;
  let sl: number | null = useSl ? slFor(config, direction, f, m) : 0;
  const valid = (value: number | null) => {
    if (value === null) return false;
    return direction === 'BUY' ? entry - value >= minDist : value - entry >= minDist;
  };

  if (useSl && !valid(sl)) {
    logOnce(state, sideLogKey(zoneIdx, side, f, 'sl'), sideEntry('fallback'), 'WARN', 'fractal.slFallback', {
      ...params,
      mode: config.fractalSlMode,
    });
    sl = direction === 'BUY' ? f.low - config.fractalSlBuffer : f.high + config.fractalSlBuffer;
  }
  // sl ist hier nur bei useSl=false 0 und sonst eine Zahl (der Ersatz oben ist nie null)
  const slPrice = useSl ? normalizePrice(sl as number, config.symbol, infos) : 0;
  if (useSl && !valid(slPrice)) {
    logOnce(state, sideLogKey(zoneIdx, side, f, 'sl_invalid'), sideEntry('invalid'), 'WARN', 'fractal.noValidSl', params);
    return null;
  }

  const risk = useSl ? Math.abs(entry - slPrice) : 0;
  let gap: number;
  if (direction === 'BUY') gap = breakout ? entry - tick.ask : tick.ask - entry;
  else gap = breakout ? tick.bid - entry : entry - tick.bid;

  let tpDist = 0;
  if (config.fractalTpByMoney) {
    if (config.fractalTpMoney > 0) {
      tpDist = moneyToPriceDistance(config.fractalTpMoney, lot, config.symbol, infos) || 0;
      if (tpDist === 0) {
        logOnce(state, sideLogKey(zoneIdx, side, f, 'tpmoney'), sideEntry('missing'), 'WARN', 'fractal.tpMoneyMissing', params);
      }
    }
  } else if (useSl && config.fractalRr > 0) {
    // Chance/Risiko braucht einen SL
    tpDist = config.fractalRr * risk;
  }
  let tp = 0;
  if (tpDist > 0) {
    tp = direction === 'BUY' ? entry + tpDist : entry - tpDist;
    tp = normalizePrice(tp, config.symbol, infos);
  }

  // Kurs näher als stops_level an der Stufe: MT5 lehnt ab (3 Ablehnungen pausieren die Zone) → warten
  const priceOk = gap > stops && gap > 0;
  const eps = minDist / 10;
  const stopsOk = (!useSl || risk >= stops - eps) && (tp === 0 || Math.abs(tp - entry) >= stops - eps);
  if (!priceOk) logOnce(state, logKey, sideEntry('near'), 'INFO', 'fractal.nearPrice', params);
  else if (!stopsOk) logOnce(state, logKey, sideEntry('stops'), 'WARN', 'fractal.stopsTooClose', { ...params, stops });

  return { ...base, sl: slPrice, tp, priceOk, stopsOk, consumed: false };
}

/** Gleiche Fraktal-Order: Typ, Einstieg und Volumen gleich (SL/TP dürfen abweichen) */
function sameEntry(order: Order, d: DesiredOrder, tol: number): boolean {
  return order.type === d.orderType && Math.abs(order.price_open - d.price) <= tol && Math.abs(order.volume_current - d.lot) <= 1e-8;
}

function sameStops(order: Order, d: DesiredOrder, tol: number): boolean {
  return Math.abs((order.sl || 0) - d.sl) <= tol && Math.abs((order.tp || 0) - d.tp) <= tol;
}

/**
 * MT5 liefert die Historie beim ersten Abruf aus dem lokalen Cache; bis zum Abgleich mit dem Server
 * können die Kerzen Tage alt sein. Der letzte Tick muss in der laufenden Kerze liegen: liegt er mehr als
 * zwei Perioden dahinter, sind die Daten veraltet.
 */
function ratesStale(rates: Bar[], timeframe: Timeframe, tick: Tick): boolean {
  const tickTime = Math.trunc(tick.time || 0);
  if (!tickTime) return false;
  return tickTime - rates[rates.length - 1].time > 2 * TF_SECONDS[timeframe];
}

function ratesKey(zoneIdx: number, timeframe: Timeframe): string {
  return `${zoneIdx}|rates|${timeframe}`;
}

/** Kerzen veraltet (MT5 lädt noch) oder fehlen: einmal melden, bis sie wieder da sind */
function logRates(state: EngineState, config: ZoneConfig, zoneIdx: number, value: 'stale' | 'missing'): void {
  const tf = config.fractalTimeframe;
  const entry = { zone: zoneIdx, fractalTime: null, value };
  const params = { zone: zoneIdx + 1, symbol: config.symbol, tf };
  if (value === 'stale') logOnce(state, ratesKey(zoneIdx, tf), entry, 'INFO', 'fractal.ratesStale', params);
  else logOnce(state, ratesKey(zoneIdx, tf), entry, 'WARN', 'fractal.ratesMissing', params);
}

function readMarket(broker: Broker, config: ZoneConfig, zoneIdx: number, tick: Tick, state: EngineState): Market | null {
  const timeframe = config.fractalTimeframe;
  const rates = broker.copyRatesFromPos(config.symbol, timeframe, 0, RATES_COUNT + 1);
  if (rates !== null && rates.length >= 6 && ratesStale(rates, timeframe, tick)) {
    logRates(state, config, zoneIdx, 'stale');
    return null;
  }
  if (rates === null || rates.length < 6) {
    logRates(state, config, zoneIdx, 'missing');
    return null;
  }
  state.fractalLogged.delete(ratesKey(zoneIdx, timeframe));
  const closed = rates.slice(0, -1);
  const forming = rates[rates.length - 1];
  const [ups, downs] = fractalsOf(closed);
  const [sarVals, sarLong] = parabolicSar(closed, config.fractalSarStep, config.fractalSarMax);
  return { closed, forming, ups, downs, atrVals: atr(closed, config.fractalAtrPeriod), sarVals, sarLong };
}

// ------------------------------------------------------------------ Einstieg

/**
 * Fraktal-Orders der Zone verwalten. An der Positionsgrenze werden die Pending Orders gelöscht und keine
 * neuen gesetzt; die Erledigt-Liste und der SAR-Nachzug laufen weiter. Rückgabe wie Python: false, wenn
 * Tick oder Kerzen fehlen (die Orders bleiben dann unberührt).
 */
export function manageFractalOrders(
  broker: Broker,
  config: ZoneConfig,
  zoneIdx: number,
  zoneKey: string,
  robotPositions: Position[],
  robotOrders: Order[],
  infos: SymbolInfos,
  state: EngineState,
): boolean {
  const symbol = config.symbol;
  const zoneOrders = robotOrders.filter((o) => o.magic === config.targetMagic);
  const zonePositions = robotPositions.filter((p) => p.magic === config.targetMagic);

  updateDone(state, zoneIdx, zoneKey, config, zoneOrders, zonePositions);

  const tick = broker.symbolInfoTick(symbol);
  if (!tick) {
    logRates(state, config, zoneIdx, 'missing');
    return false;
  }

  const m = readMarket(broker, config, zoneIdx, tick, state);
  if (!m) return false;

  const allow = !atLimit(state, zoneIdx, config, zonePositions.length);
  const ctx: BuildContext = { config, zoneIdx, zoneKey, m, tick, infos, state };
  const candidates = manageOrders(broker, ctx, zoneOrders, zonePositions, allow);
  if (config.fractalUseSl && config.fractalSlMode === 'sar') {
    trailSar(broker, ctx, zonePositions, m.sarVals[m.sarVals.length - 1], m.sarLong[m.sarLong.length - 1]);
  }

  // Einmal-Logs von Fraktalen außerhalb des Fensters sammeln sich nicht an. An der Positionsgrenze gibt es
  // keine Kandidaten; die Einträge bleiben, damit nach der Grenze dieselben Logs nicht noch einmal kommen.
  if (allow) {
    for (const [key, entry] of [...state.fractalLogged]) {
      if (entry.zone === zoneIdx && entry.fractalTime !== null && !candidates.has(entry.fractalTime)) {
        state.fractalLogged.delete(key);
      }
    }
  }
  return true;
}

/** Zone an der Positionsgrenze? Warnung nur beim Erreichen / bei geänderter Zahl */
function atLimit(state: EngineState, zoneIdx: number, config: ZoneConfig, openPositions: number): boolean {
  const key = `${zoneIdx}|limit`;
  if (openPositions < config.maxPositions) {
    state.fractalLogged.delete(key);
    return false;
  }
  logOnce(state, key, { zone: zoneIdx, fractalTime: null, value: openPositions }, 'WARN', 'fractal.maxPositions', {
    zone: zoneIdx + 1,
    open: openPositions,
    max: config.maxPositions,
  });
  return true;
}

/**
 * ENG-30: nächste Fraktal-Order der Richtung frei? Die jüngste Position der Richtung muss mindestens
 * fractalNextLoss im Verlust sein (money: Gewinn ≤ −X · pips: Kurs ≥ X gegen den Einstieg). 0 oder keine
 * Position: frei.
 */
function lossGateOpen(ctx: BuildContext, direction: Direction, zonePositions: Position[]): boolean {
  const { config, zoneIdx, tick, state } = ctx;
  const limit = config.fractalNextLoss;
  const key = `${zoneIdx}|next_loss|${direction}`;
  const posType = direction === 'BUY' ? POSITION_TYPE_BUY : POSITION_TYPE_SELL;
  const sameDir = zonePositions.filter((p) => p.type === posType);
  if (limit <= 0 || sameDir.length === 0) {
    state.fractalLogged.delete(key);
    return true;
  }
  // Jüngste Position: höchste (time_msc, Ticket); im Paritätsmodus fehlt time_msc
  const last = sameDir.reduce((a, b) => {
    const ta = a.time_msc || 0;
    const tb = b.time_msc || 0;
    return tb > ta || (tb === ta && b.ticket > a.ticket) ? b : a;
  });
  let reached: boolean;
  if (config.fractalNextLossMode === 'pips') {
    const against = direction === 'BUY' ? last.price_open - tick.bid : tick.ask - last.price_open;
    reached = against >= limit;
  } else {
    reached = last.profit <= -limit;
  }
  if (reached) {
    state.fractalLogged.delete(key);
    return true;
  }
  logOnce(state, key, { zone: zoneIdx, fractalTime: null, value: last.ticket }, 'INFO', 'fractal.nextLossWait', {
    zone: zoneIdx + 1,
    direction,
    ticket: last.ticket,
    limit,
    mode: config.fractalNextLossMode,
  });
  return false;
}

/**
 * Ziel-Orders bilden, bestehende Orders zuordnen oder löschen, fehlende setzen.
 * Rückgabe: Zeiten der betrachteten Fraktale (für das Aufräumen der Einmal-Logs).
 */
function manageOrders(broker: Broker, ctx: BuildContext, zoneOrders: Order[], zonePositions: Position[], allow: boolean): Set<number> {
  const { config, zoneIdx, m, infos, state } = ctx;
  const symbol = config.symbol;

  const desired: DesiredOrder[] = [];
  const candidates = new Set<number>();
  const sides: [Side, BarFractal[]][] = [
    ['U', m.ups],
    ['D', m.downs],
  ];
  for (const [side, items] of sides) {
    const direction = directionOf(config, side);
    if (!allow || (config.orderType !== direction && config.orderType !== 'BOTH')) continue;
    // Gesperrte Richtung: ihre Pending Orders finden unten keine Ziel-Order und werden gelöscht
    if (!lossGateOpen(ctx, direction, zonePositions)) continue;
    const count = direction === 'BUY' ? config.fractalOrderCount : config.sellFractalOrderCount;
    // Nur die neuesten `count` Fraktale: der Platz eines ungültigen bleibt leer, kein älteres rückt nach
    for (const f of items.slice(-count).reverse()) {
      candidates.add(f.time);
      const d = buildDesired(ctx, side, f);
      if (d) desired.push(d);
    }
  }

  const point = infos[symbol]?.point || 0;
  const tol = point > 0 ? point / 2 : 1e-9;
  const tracked = trackedOf(state, zoneIdx);

  const matched = new Set<number>();
  for (const order of zoneOrders) {
    const hit = desired.findIndex((d, i) => !matched.has(i) && sameEntry(order, d, tol));
    if (hit >= 0) {
      const d = desired[hit];
      matched.add(hit);
      tracked.set(order.ticket, { doneKey: d.doneKey, side: d.side, barTime: d.fractal.time });
      if (d.consumed) {
        const key = sideLogKey(zoneIdx, d.side, d.fractal, 'touched');
        const entry = { zone: zoneIdx, fractalTime: d.fractal.time, value: 'kept' };
        const params = { ...fractalParams(config, zoneIdx, d.side, d.fractal), ticket: order.ticket };
        logOnce(state, key, entry, 'INFO', 'fractal.touchedKept', params);
      }
      // Gleiches Fraktal, nur SL/TP neu (SAR / Gegenfraktal auf neuer Kerze): ändern statt löschen und
      // neu setzen. Ist der neue SL/TP ungültig, bleibt die Order wie sie ist.
      if (!sameStops(order, d, tol) && d.stopsOk) {
        const before = { sl: order.sl, tp: order.tp };
        if (modifyPendingOrder(broker, order, d.sl, d.tp, infos, state)) {
          const change = { sl: [before.sl, d.sl], tp: [before.tp, d.tp] };
          state.log('INFO', 'fractal.modified', { zone: zoneIdx + 1, ticket: order.ticket, ...change });
        }
      }
      continue;
    }
    if (cancelOrder(broker, order, state)) {
      state.log('INFO', 'fractal.cancelled', {
        zone: zoneIdx + 1,
        ticket: order.ticket,
        price: order.price_open,
        reason: allow ? 'noMatch' : 'maxPositions',
      });
    }
  }

  desired.forEach((d, i) => {
    if (matched.has(i)) return;
    if (d.consumed) {
      const entry = { zone: zoneIdx, fractalTime: d.fractal.time, value: 'consumed' };
      const params = fractalParams(config, zoneIdx, d.side, d.fractal);
      logOnce(state, sideLogKey(zoneIdx, d.side, d.fractal), entry, 'INFO', 'fractal.consumed', params);
      return;
    }
    if (!placeable(d)) return;
    const comment = fractalComment(config.targetMagic, d.side, d.fractal.time);
    const magic = config.targetMagic;
    const sent = sendPendingOrderHelper(broker, d.price, d.lot, d.tp, d.sl, zoneIdx, d.direction, symbol, infos, state, magic, comment);
    if (!sent) return;
    // Sofort verfolgen: wird die Order vor dem nächsten Durchlauf von Hand gelöscht, fällt es auf
    for (const o of broker.ordersGet() ?? []) {
      if (o.symbol === symbol && o.magic === config.targetMagic && o.comment === comment) {
        tracked.set(o.ticket, { doneKey: d.doneKey, side: d.side, barTime: d.fractal.time });
      }
    }
    const placed = { direction: d.direction, mode: config.fractalOrderMode, entry: d.price, sl: d.sl, tp: d.tp };
    state.log('INFO', 'fractal.placed', { ...fractalParams(config, zoneIdx, d.side, d.fractal), ...placed });
  });
  return candidates;
}

/**
 * SAR-Modus: SL der offenen Positionen auf den neuen SAR ziehen, nur in Gewinnrichtung. Alle Positionen der
 * Zone, auch die aus der Zeit vor dem Wechsel von Grid auf Fraktal.
 */
function trailSar(broker: Broker, ctx: BuildContext, positions: Position[], sar: number | null, sarIsLong: boolean): void {
  const { config, zoneIdx, tick, infos, state } = ctx;
  if (sar === null) return;
  const info = infos[config.symbol];
  const point = info?.point || 0;
  const stops = info ? (info.trade_stops_level || 0) * point : 0;
  const tol = point > 0 ? point / 2 : 1e-9;
  const newSl = normalizePrice(sar, config.symbol, infos);
  for (const p of positions) {
    const cur = p.sl || 0;
    const better =
      p.type === POSITION_TYPE_BUY
        ? sarIsLong && (cur === 0 || newSl > cur + tol) && tick.bid - newSl > stops
        : !sarIsLong && (cur === 0 || newSl < cur - tol) && newSl - tick.ask > stops;
    if (better && modifyPositionTpSl(broker, p, p.tp, newSl, infos, state)) {
      state.log('INFO', 'fractal.sarTrail', { zone: zoneIdx + 1, ticket: p.ticket, sl: [cur, newSl] });
    }
  }
}
