/**
 * Auswahl und Aufteilung der Trades für den Statistik-Tab: ganzes Konto, eine Zone (alle Setups) oder ein
 * Setup einer Zone; Aufteilung je Zone, je Setup, je Wochentag, je Stunde (Schließzeit, MT5-Zeit). Die Zone
 * kommt nur aus dem Register (`Trade.zone`), „Zone unbekannt“ wird nie einer Zone zugeschlagen.
 */
import { computeStats, type TradeStats } from './stats';
import type { Trade } from './tradePairing';

export type StatsScope =
  | { kind: 'account' }
  | { kind: 'zone'; magic: number }
  | { kind: 'setup'; magic: number; sid: number };

export function inScope(tr: Trade, scope: StatsScope): boolean {
  if (scope.kind === 'account') return true;
  if (tr.zone.kind !== 'zone' || tr.zone.magic !== scope.magic) return false;
  return scope.kind === 'zone' || tr.fractal?.sid === scope.sid;
}

export type BreakdownKind = 'zone' | 'setup' | 'weekday' | 'hour';

/**
 * Gruppenschlüssel:
 * - zone: `z:<magic>`, `unknown`, `manual`, `other`;
 * - setup: `s:<magic>:<sid>` für Fraktal-Trades einer Zone, `s:<magic>:none` für Zonen-Trades ohne
 *   Fraktal-Kommentar, sonst wie bei zone (`unknown`/`manual`/`other`);
 * - weekday: `0`–`6` (0 = Sonntag), hour: `0`–`23`.
 */
export function groupKey(tr: Trade, kind: BreakdownKind): string {
  if (kind === 'weekday') return String(new Date(tr.exitTime * 1000).getUTCDay());
  if (kind === 'hour') return String(new Date(tr.exitTime * 1000).getUTCHours());
  if (tr.zone.kind !== 'zone') return tr.zone.kind;
  if (kind === 'zone') return `z:${tr.zone.magic}`;
  return `s:${tr.zone.magic}:${tr.fractal ? tr.fractal.sid : 'none'}`;
}

export interface Group {
  key: string;
  stats: TradeStats;
}

const ORDER: Record<string, number> = { unknown: 1, manual: 2, other: 3 };

/** Gruppen mit denselben Kennzahlen wie das Ganze; Wochentage ab Montag, Stunden aufsteigend */
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
    const [, magic, sid] = key.split(':');
    return [0, Number(magic), sid === undefined ? 0 : sid === 'none' ? 1000 : Number(sid)];
  };
  return [...map.entries()]
    .map(([key, list]) => ({ key, stats: computeStats(list) }))
    .sort((a, b) => {
      const ra = rank(a.key);
      const rb = rank(b.key);
      return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
    });
}
