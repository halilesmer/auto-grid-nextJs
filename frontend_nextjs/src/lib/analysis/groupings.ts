/**
 * Auswahl und Aufteilung der Trades für den Statistik-Tab: ganzes Konto, ein Symbol (alle seine Setups) oder
 * ein Setup (= Zone, Magic); Aufteilung je Symbol, je Setup, je Wochentag, je Stunde (Schließzeit, MT5-Zeit).
 * Das Setup kommt nur aus dem Register (`Trade.zone`), „Setup unbekannt“ wird nie einem Setup oder Symbol
 * zugeschlagen.
 */
import { computeStats, type TradeStats } from './stats';
import type { Trade } from './tradePairing';

export type StatsScope = { kind: 'account' } | { kind: 'symbol'; symbol: string } | { kind: 'zone'; magic: number };

/**
 * Symbol eines Setup-Trades ist das gehandelte Symbol des Deals, nicht das heutige Symbol des Setups: so zählt
 * ein Trade auch nach einer Symbol-Änderung zu dem Symbol, das wirklich gehandelt wurde. Vergleich ohne
 * Groß-/Kleinschreibung wie im Chart-Tab (belongsToZoneView): MT5 meldet z. B. „XAUUSDm“, die Karte speichert „XAUUSDM“.
 */
export function inScope(tr: Trade, scope: StatsScope): boolean {
  if (scope.kind === 'account') return true;
  if (tr.zone.kind !== 'zone') return false;
  if (scope.kind === 'symbol') return tr.symbol.toUpperCase() === scope.symbol.toUpperCase();
  return tr.zone.magic === scope.magic;
}

/** zone = je Setup (Magic) */
export type BreakdownKind = 'symbol' | 'zone' | 'weekday' | 'hour';

/**
 * Gruppenschlüssel:
 * - symbol: `s:<symbol>`; zone: `z:<magic>`; beide sonst `unknown`, `manual`, `other`;
 * - weekday: `0`–`6` (0 = Sonntag), hour: `0`–`23`.
 */
export function groupKey(tr: Trade, kind: BreakdownKind): string {
  if (kind === 'weekday') return String(new Date(tr.exitTime * 1000).getUTCDay());
  if (kind === 'hour') return String(new Date(tr.exitTime * 1000).getUTCHours());
  if (tr.zone.kind !== 'zone') return tr.zone.kind;
  if (kind === 'symbol') return `s:${tr.symbol}`;
  return `z:${tr.zone.magic}`;
}

export interface Group {
  key: string;
  stats: TradeStats;
}

const ORDER: Record<string, number> = { unknown: 1, manual: 2, other: 3 };

/** Gruppen mit denselben Kennzahlen wie das Ganze; Wochentage ab Montag, Stunden aufsteigend, Symbole nach Namen */
export function breakdown(trades: Trade[], kind: BreakdownKind): Group[] {
  const map = new Map<string, Trade[]>();
  for (const tr of trades) {
    const k = groupKey(tr, kind);
    const list = map.get(k);
    if (list) list.push(tr);
    else map.set(k, [tr]);
  }
  const rank = (key: string): [number, number, number] => {
    if (kind === 'weekday') return [0, (Number(key) + 6) % 7, 0];
    if (kind === 'hour') return [0, Number(key), 0];
    if (key in ORDER) return [ORDER[key], 0, 0];
    if (kind === 'symbol') return [0, 0, 0];
    return [0, Number(key.split(':')[1]), 0];
  };
  return [...map.entries()]
    .map(([key, list]) => ({ key, stats: computeStats(list) }))
    .sort((a, b) => {
      const ra = rank(a.key);
      const rb = rank(b.key);
      return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2] || a.key.localeCompare(b.key);
    });
}
