/** ENG-31: Spread-Entscheidungen wie core/spread_guard.py; keine zukünftigen Daten. */
import { spreadGuardError, type SpreadGuardSettings, type SpreadGuardStatus } from '@/lib/spreadGuardSettings';
import { extractZoneConfig, InvalidZoneConfigError } from './config';
import type { SymbolInfos } from './helpers';
import { pyRound } from './pyRound';
import type { EngineState } from './state';
import type { Broker, Tick, ZoneDict } from './types';
import { zoneMagic } from './zoneMagic';
import { cancelOrder, getAllRobotOrders } from './orders';

interface History { samples: [number, number][]; reference: number | null }
interface Latch { signature: string; limit: number | null }

export function tickSpread(tick: Tick | null, wall: number, digits: number): number | null {
  if (!tick) return null;
  const stamp = tick.time_msc / 1000 || tick.time;
  if (![tick.bid, tick.ask, stamp].every(Number.isFinite) || tick.bid <= 0 || tick.ask < tick.bid || stamp <= 0 || wall - stamp < 0 || wall - stamp > 60) return null;
  return pyRound(tick.ask - tick.bid, digits);
}

export class SpreadGuard {
  readonly histories = new Map<string, History>();
  readonly status = new Map<number, SpreadGuardStatus>();
  readonly zones = new Map<number, { index: number; zone: ZoneDict }>();
  private readonly latches = new Map<number, Latch>();
  private readonly recovery = new Map<number, number>();
  private readonly gridLimits = new Map<number, number | null>();
  private infos: SymbolInfos = {};

  configure(zones: readonly ZoneDict[], infos: SymbolInfos, state: EngineState): void {
    this.infos = infos;
    this.zones.clear();
    for (const [index, zone] of zones.entries()) {
      const magic = zoneMagic(zone, index);
      this.zones.set(magic, { index, zone });
      const cfg = zone.spread_guard as SpreadGuardSettings | undefined;
      if (cfg?.enabled && cfg.mode === 'grid') {
        try {
          const c = extractZoneConfig(zone, index, infos, state);
          const steps: number[] = [];
          if (c.orderType === 'BUY' || c.orderType === 'BOTH') steps.push(c.gridStep);
          if (c.orderType === 'SELL' || c.orderType === 'BOTH') steps.push(c.sellGridStep);
          this.gridLimits.set(magic, steps.length && steps.every((step) => Number.isFinite(step) && step > 0) ? Math.min(...steps) * (cfg.grid_percent ?? 0) / 100 : null);
        } catch (error) {
          if (!(error instanceof InvalidZoneConfigError)) throw error;
          // Unberechenbare Abstände sperren den Einstieg; evaluate zeigt invalid_settings.
          this.gridLimits.set(magic, null);
        }
      }
    }
    for (const magic of this.status.keys()) {
      if (!this.zones.has(magic)) {
        this.status.delete(magic);
        this.latches.delete(magic);
        this.recovery.delete(magic);
      }
    }
  }

  threshold(magic: number): number | null {
    const entry = this.zones.get(magic);
    if (!entry) return null;
    const cfg = entry.zone.spread_guard as SpreadGuardSettings;
    if (cfg.mode === 'fixed') return cfg.max_spread ?? null;
    if (cfg.mode === 'grid') return this.gridLimits.get(magic) ?? null;
    const h = this.histories.get(String(entry.zone.symbol));
    let ref = h && h.samples.length >= 60 ? h.reference : null;
    if (ref === null && cfg.bootstrap === 'manual') ref = cfg.initial_spread ?? null;
    return ref !== null ? ref * (cfg.multiplier ?? 0) : null;
  }

  observe(spreads: Map<string, number | null>, wall: number): void {
    const symbols = new Set<string>();
    for (const { zone } of this.zones.values()) {
      const cfg = zone.spread_guard as SpreadGuardSettings | undefined;
      if (cfg?.enabled && cfg.mode === 'relative') symbols.add(String(zone.symbol));
    }
    for (const symbol of symbols) {
      const h = this.histories.get(symbol) ?? { samples: [], reference: null };
      this.histories.set(symbol, h);
      h.samples = h.samples.filter(([t]) => wall - 86400 < t && t <= wall);
      if (h.samples.length < 60) h.reference = null;
      const spread = spreads.get(symbol);
      const last = h.samples.at(-1);
      if (spread === null || spread === undefined || (last && Math.floor(last[0] / 60) === Math.floor(wall / 60))) continue;
      let frozen = false;
      for (const [magic, { zone }] of this.zones) {
        const cfg = zone.spread_guard as SpreadGuardSettings | undefined;
        if (zone.symbol !== symbol || !cfg?.enabled || cfg.mode !== 'relative') continue;
        const latch = this.latches.get(magic);
        if (spreadGuardError(zone)) continue;
        const liveLimit = this.threshold(magic);
        const oldLimit = latch && liveLimit !== null ? latch.limit : liveLimit;
        if (oldLimit !== null && (spread > oldLimit || latch !== undefined)) frozen = true;
      }
      if (h.samples.length < 60 || !frozen) {
        h.samples.push([wall, spread]);
        if (h.samples.length >= 60) {
          const ordered = h.samples.map((s) => s[1]).sort((a, b) => a - b);
          const half = Math.floor(ordered.length / 2);
          h.reference = ordered.length % 2 ? ordered[half] : (ordered[half - 1] + ordered[half]) / 2;
        }
      }
    }
  }

  evaluate(magic: number, spread: number | null, now: number): boolean {
    const entry = this.zones.get(magic);
    if (!entry) return true;
    const { zone } = entry;
    const cfg = zone.spread_guard as SpreadGuardSettings | undefined;
    if (!cfg?.enabled) {
      this.latches.delete(magic);
      this.recovery.delete(magic);
      this.status.delete(magic);
      return true;
    }
    let invalid = spreadGuardError(zone) !== null || (cfg.mode === 'grid' && this.gridLimits.get(magic) === null);
    let limit = invalid ? null : this.threshold(magic);
    if (limit !== null && !Number.isFinite(limit)) { invalid = true; limit = null; }
    let reason: SpreadGuardStatus['reason'] = limit === null ? 'learning' : 'ready';
    if (invalid) reason = 'invalid_settings';
    const signature = JSON.stringify([zone.symbol, Object.fromEntries(Object.entries(cfg).sort(([a], [b]) => a.localeCompare(b)))]);
    let latch = this.latches.get(magic);
    if (latch && latch.signature !== signature) {
      this.latches.delete(magic);
      this.recovery.delete(magic);
      latch = undefined;
    }
    if (latch && latch.limit !== null) limit = latch.limit;
    if (spread === null) reason = 'invalid_tick';
    else if (limit !== null && spread > limit) reason = 'high';
    let blocked: boolean;
    if (reason !== 'ready') {
      if (!latch) this.latches.set(magic, { signature, limit });
      else if (latch.limit === null && limit !== null) latch.limit = limit;
      this.recovery.delete(magic);
      blocked = true;
    } else if (latch && limit !== null && spread !== null) {
      if (latch.limit === null) latch.limit = limit;
      if (spread < limit * 0.8) {
        const start = this.recovery.get(magic) ?? now;
        this.recovery.set(magic, start);
        if (now - start >= 30) {
          this.latches.delete(magic);
          this.recovery.delete(magic);
          blocked = false;
        } else { blocked = true; reason = 'recovering'; }
      } else {
        this.recovery.delete(magic);
        blocked = true;
        reason = 'recovering';
      }
    } else blocked = false;
    const h = this.histories.get(String(zone.symbol));
    const start = this.recovery.get(magic);
    let recoverySeconds = blocked ? 30 : 0;
    if (start !== undefined) recoverySeconds = Math.max(0, 30 - (now - start));
    this.status.set(magic, { blocked, reason, spread, limit, samples: h?.samples.length ?? 0, reference: h?.reference ?? null,
      recovery_seconds: recoverySeconds, updated_at: now });
    return !blocked;
  }

  read(broker: Broker, symbol: string, now: number): number | null {
    return tickSpread(broker.symbolInfoTick(symbol), now, this.infos[symbol]?.digits ?? 8);
  }
}

function clearBlocked(broker: Broker, state: EngineState): void {
  for (const order of getAllRobotOrders(broker) ?? []) {
    const guard = state.spreadGuard;
    if (guard.status.get(order.magic)?.blocked && order.symbol === guard.zones.get(order.magic)?.zone.symbol) cancelOrder(broker, order, state);
  }
}

export function refreshSpreadGuard(broker: Broker, zones: readonly ZoneDict[], infos: SymbolInfos, state: EngineState): void {
  const guard = state.spreadGuard;
  guard.configure(zones, infos, state);
  const spreads = new Map<string, number | null>();
  for (const zone of zones) {
    const cfg = zone.spread_guard as SpreadGuardSettings | undefined;
    if (cfg?.enabled) spreads.set(String(zone.symbol), guard.read(broker, String(zone.symbol), state.now()));
  }
  guard.observe(spreads, state.now());
  for (const [magic, { zone }] of guard.zones) guard.evaluate(magic, spreads.get(String(zone.symbol)) ?? null, state.now());
  clearBlocked(broker, state);
}

export function entryAllowed(broker: Broker, magic: number, state: EngineState): boolean {
  const guard = state.spreadGuard;
  const entry = guard.zones.get(magic);
  if (!entry) return true;
  const allowed = guard.evaluate(magic, guard.read(broker, String(entry.zone.symbol), state.now()), state.now());
  if (!allowed) clearBlocked(broker, state);
  return allowed;
}
