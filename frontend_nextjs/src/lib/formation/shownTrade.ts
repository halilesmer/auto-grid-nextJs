/**
 * „Beim Einstieg gezeigt“: gemeinsame Bausteine der Suchen mit Handel (AB=CD und Harmoniken; 1122-A1.4, 1122-A3.2 bis A3.4).
 *
 * - Identität eines eingegangenen Handels: Seite, Einstiegskerze, Einstieg (`tradeKey`). Ohne Wendepunkte: rückt der Trend einen Punkt nach dem
 *   Einstieg und bleibt der Einstieg gleich, ist es derselbe Handel.
 * - „Gezeigt“ ist das Ergebnis der Suche zum Schluss einer Kerze (nach Auslassen und Vorrang). Die Suche merkt sich ihren gezeigten Handel je Schluss
 *   (`recordShown`); `tradeAtOf` rechnet einen früheren Schluss bei Bedarf einmal je Kontext nach (rekursiv, nur Kerzen bis dahin).
 * - Ein eingegangener Handel, der zum Schluss seiner Einstiegskerze nicht gezeigt war, ist verborgen (`hiddenOf`, Regel B); ein Einstieg in der
 *   letzten Kerze gilt zu ihrem Schluss nicht als verborgen.
 * - Das Verlaufsfenster gilt für einen laufenden Handel ab seinem Einstieg (`entryInHistory`, 1122-A1.4 a).
 * - Mit dem Handel merkt sich die Suche seine Punkte X, A, B, C (`pointsKey`): tragen mehrere Basen denselben Handel, gelten die beim Einstieg gezeigten
 *   Punkte (`frozenOf`; Basis und Einstieg frieren am Einstieg ein, 1121-A2.1, 1122-A28.1).
 */
import type { FormationContext } from './context';
import { HISTORY_DAYS, type ContextTimeframe } from './params';
import { DAY_SEC } from '@/lib/serverTime';
import { TIMEFRAME_SEC } from '@/lib/analysis/candles';
import { buildEnvWithoutZones, type Env } from './reasons';
import type { Candidate, FormationBar } from './types';

type Bars = readonly FormationBar[];
/** Gezeigter Handel (Schlüssel) und seine Punkte zu einem Schluss */
export interface Shown {
  key: string | null;
  points: string | null;
}
/** `${tf}|${Schlusszeit}` → gezeigter Handel und Punkte */
export type ShownKeys = Map<string, Shown>;
const NONE: Shown = { key: null, points: null };

/** Handel eingegangen (Einstieg mit Stand und Einstiegskerze) */
export const enteredTrade = (c: Candidate): boolean => c.trade?.entry != null && c.trade.status !== undefined && c.trade.entryIdx !== undefined;

/** Eingegangener Handel als Schlüssel: Seite, Einstiegskerze, Einstieg; der Preis trennt Basen mit einem Einstieg in derselben Kerze. Sonst `null`. */
export const tradeKey = (c: Candidate, bars: Bars): string | null => (enteredTrade(c) ? `${c.side}|${bars[c.trade!.entryIdx!].time}|${c.trade!.entry}` : null);

/** Punkte X, A, B, C eines Kandidaten (Kerze und Preis; fehlt einer: `-`): trennt Basen mit demselben Handel */
export const pointsKey = (c: Candidate): string =>
  (['X', 'A', 'B', 'C'] as const).map((k) => (c.points[k] ? `${c.points[k].time}@${c.points[k].price}` : '-')).join('|');

const store = new WeakMap<FormationContext, WeakMap<object, ShownKeys>>();

/** Schlüssel je Kontext und Suche (`scope`, z. B. die Prüffunktion): hängen nur von den Kerzen bis zur Zeit ab */
export function shownKeysOf(ctx: FormationContext, scope: object): ShownKeys {
  let byScope = store.get(ctx);
  if (!byScope) store.set(ctx, (byScope = new WeakMap()));
  let keys = byScope.get(scope);
  if (!keys) byScope.set(scope, (keys = new Map()));
  return keys;
}

/** Merkt den gezeigten Handel zum Schluss der letzten Kerze */
export function recordShown(keys: ShownKeys, tf: ContextTimeframe, bars: Bars, shown: Candidate | null): void {
  if (bars.length === 0) return;
  keys.set(`${tf}|${bars[bars.length - 1].time + TIMEFRAME_SEC[tf]}`, shown ? { key: tradeKey(shown, bars), points: pointsKey(shown) } : NONE);
}

/**
 * Handel und Punkte, die die Suche zum Schluss `at` zeigte. `shownAt(env, tf, at)` ist die Suche selbst und ruft `recordShown`; ein früherer Schluss wird einmal
 * je Kontext aus den Kerzen bis dahin gerechnet, ohne Zonen (`buildEnvWithoutZones`, 1122-A41.1): welcher Handel gezeigt ist, liest keine Zone
 * (Harmoniken: Form-Bedingungen, Punkt-Ausschlüsse, Variante, Einstieg, Stand; AB=CD: Einstieg, Stop und Stand nach Level 1).
 */
export function tradeAtOf(
  ctx: FormationContext,
  keys: ShownKeys,
  shownAt: (env: Env, tf: ContextTimeframe, at: number) => unknown,
): (tf: ContextTimeframe, at: number) => Shown {
  return (tf, at) => {
    const id = `${tf}|${at}`;
    if (!keys.has(id)) {
      const e = buildEnvWithoutZones(ctx, at, tf);
      if (e) shownAt(e, tf, at);
      if (!keys.has(id)) keys.set(id, NONE);
    }
    return keys.get(id)!;
  };
}

/** Eingegangener Handel, der zum Schluss seiner Einstiegskerze nicht gezeigt war (Regel B); Einstieg in der letzten Kerze: nicht verborgen */
export function hiddenOf(tf: ContextTimeframe, bars: Bars, tradeAt: (tf: ContextTimeframe, at: number) => Shown): (c: Candidate) => boolean {
  const last = bars.length - 1;
  const dur = TIMEFRAME_SEC[tf];
  return (c) => enteredTrade(c) && c.trade!.entryIdx! < last && tradeAt(tf, bars[c.trade!.entryIdx!].time + dur).key !== tradeKey(c, bars);
}

/** Eingegangener Handel mit den Punkten, die zum Schluss seiner Einstiegskerze gezeigt waren */
export function frozenOf(tf: ContextTimeframe, bars: Bars, tradeAt: (tf: ContextTimeframe, at: number) => Shown): (c: Candidate) => boolean {
  const dur = TIMEFRAME_SEC[tf];
  return (c) => enteredTrade(c) && tradeAt(tf, bars[c.trade!.entryIdx!].time + dur).points === pointsKey(c);
}

/** Beginn des Verlaufsfensters der Zeiteinheit zur Zeit `at` (`HISTORY_DAYS`) */
export const historyStart = (tf: ContextTimeframe, at: number): number => at - HISTORY_DAYS[tf] * DAY_SEC;

/** Einstieg eines eingegangenen Handels im Verlaufsfenster (1122-A1.4 a: das Fenster gilt ab dem Einstieg, nicht ab einem Wendepunkt) */
export const entryInHistory = (tf: ContextTimeframe, bars: Bars, c: Candidate, at: number): boolean =>
  enteredTrade(c) && bars[c.trade!.entryIdx!].time >= historyStart(tf, at);
