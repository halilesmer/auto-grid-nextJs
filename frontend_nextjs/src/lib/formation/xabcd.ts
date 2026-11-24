/**
 * XABCD-Kern für Gartley und Bat: Bausteine als reine Funktionen über geschlossene Kerzen einer Zeiteinheit.
 * X, A, B und C sind vier aufeinanderfolgende Wendepunkte des Trendzugs (trd.ts), D ist der äußerste Docht seit C.
 * Das AB=CD im Inneren kommt aus abcd.ts (`shapeOf` mit A, B, C), ohne dessen Verhalten zu ändern.
 * Preise laufen über `outward(Seite, Preis)`; eine Kauf-Formation (X, B, D sind Tiefs) und ihr Spiegelbild sind derselbe Code.
 * Level der Fib X → A und der Fib A → B stehen in der Notation Start = 1, Ende = 0 (Ausdehnungen negativ).
 */
import { shapeOf, extremeAfter, gapToRect, type AbcdShape } from './abcd';
import { TIMEFRAME_SEC } from '@/lib/analysis/candles';
import type { FormationContext } from './context';
import { closesBeyond, outward, probeFractal, wickEnd, type Rect, type ZoneSide } from './frz';
import { CONTEXT_TIMEFRAMES, HARMONIC_PARAMS, FRZ_PARAMS, type ContextTimeframe } from './params';
import { buildEnv, dirSide, envFor, neighborTf, type Env } from './reasons';
import { enteredTrade, entryInHistory, frozenOf, hiddenOf, historyStart, pointsKey, recordShown, shownKeysOf, tradeAtOf, tradeKey } from './shownTrade';
import { reversalAt } from './reversal';
import { engulfZones, rsiExtreme, trailingRun, divergenceOf, zoneSideOf } from './sig';
import type { Pivot, TrendModel } from './trd';
import type { Anchor, Candidate, Check, CheckState, FormationBar, Side } from './types';

type Bars = readonly FormationBar[];

export interface XPoint {
  idx: number;
  price: number;
  /** Kerze des Trend-Pivots, wenn der Punkt für die Messung auf die Dochtspitze verschoben wurde; sonst fehlt das Feld */
  pivotIdx?: number;
}

/** Kerze des Trend-Pivots eines Punktes (Strukturprüfungen gegen `trend.pivots`); Messungen nehmen `idx` und `price` */
export const pivotIdxOf = (p: XPoint): number => p.pivotIdx ?? p.idx;

/** X, A, B, C vor der Messung: Kerzenindex und Preis */
export interface XabcdBase {
  x: XPoint;
  a: XPoint;
  b: XPoint;
  c: XPoint;
}

export interface XabcdShape extends XabcdBase {
  /** Seite von X, B und D (Tief = Unterstützung beim Kauf): dort liegt D */
  es: ZoneSide;
  /** Seite von A und C */
  cs: ZoneSide;
  /** Seite des Trades am D: Richtung von X → A (aufwärts → Kauf) */
  side: Side;
  /** Länge X → A */
  len: number;
  /** äußerster Docht in Richtung X seit C; null ohne Kerze nach C (oder der Eingabe-Punkt) */
  d: XPoint | null;
  /** AB=CD im Inneren (A, B, C) mit Level 1 und Korrekturtiefe von C */
  abcd: AbcdShape;
}

const N = FRZ_PARAMS.neighbors;

/** Formen und Verhältnisse; `d` überschreibt den gemessenen äußersten Docht (eigene Punkte) */
export function shapeOfX(bars: Bars, p: XabcdBase, d?: XPoint): XabcdShape {
  const base = shapeOf(bars, { a: p.a, b: p.b, c: p.c }, d);
  // D sucht ab dem Trend-Pivot von C, nicht ab einer davor liegenden Dochtspitze von C
  const abcd = d || p.c.pivotIdx === undefined ? base : { ...base, d: extremeAfter(bars, Math.max(p.c.idx, p.c.pivotIdx), base.es) };
  return {
    ...p,
    es: abcd.es,
    cs: abcd.cs,
    side: abcd.side,
    len: Math.abs(p.a.price - p.x.price),
    d: abcd.d,
    abcd,
  };
}

/**
 * Kandidaten: C ist einer der letzten `lookbackPivots` Wendepunkte, B, A und X sind die drei davor; jüngstes C zuerst.
 * Welcher Kandidat gilt, entscheiden die Formbedingungen in `analyzeGar` bzw. `analyzeBat`.
 */
export function selectBases(pivots: readonly Pivot[]): XabcdBase[] {
  const pt = (p: Pivot): XPoint => ({ idx: p.idx, price: p.price });
  const out: XabcdBase[] = [];
  for (let j = pivots.length - 1; j >= Math.max(3, pivots.length - HARMONIC_PARAMS.lookbackPivots); j--) {
    out.push({ x: pt(pivots[j - 3]), a: pt(pivots[j - 2]), b: pt(pivots[j - 1]), c: pt(pivots[j]) });
  }
  return out;
}

/**
 * Punkt auf den äußersten Docht der Schwingung (Halil 2026-11-13): die EWO-Regel des Trends meldet einen Pivot oft eine Kerze zu spät,
 * die Fib-Verhältnisse brauchen aber die echte Dochtspitze. Gesucht wird in den Kerzen `fromIdx` bis ausschließlich `toIdx`:
 * bei einem Tief der tiefste Low, bei einem Hoch der höchste High. Nur eine strikt äußere Spitze ersetzt den Punkt; bei Gleichstand
 * bleibt der Pivot. Der Trend selbst bleibt unverändert.
 */
export function extremeWick(bars: Bars, point: XPoint, side: ZoneSide, fromIdx: number, toIdx: number): XPoint {
  let best = point;
  for (let k = Math.max(0, fromIdx); k < toIdx && k < bars.length; k++) {
    const price = wickEnd(bars[k], side);
    if (outward(side, price) > outward(side, best.price)) best = { idx: k, price };
  }
  return best;
}

/** X: zwischen dem Pivot vor X (ausgeschlossen; ohne ihn ab der ersten geladenen Kerze) und der Kerze von A (ausgeschlossen) */
export const deepestWickX = (bars: Bars, x: XPoint, side: ZoneSide, prevIdx: number | null, aIdx: number): XPoint =>
  extremeWick(bars, x, side, prevIdx === null ? 0 : prevIdx + 1, aIdx);

/**
 * X, dann A, dann B auf ihre äußersten Dochte; jeder Punkt sucht nach dem verschobenen Vorgänger (Reihenfolge X → A → B):
 * A zwischen X und dem Pivot von B, B zwischen A und dem Pivot von C; C nur nach bestätigtem C→D-Bein (`shiftC`, Schluss bis `untilIdx`). D bleibt.
 * `pivotIdx` hält die Kerze des Trend-Pivots für die Strukturprüfungen fest.
 */
export function shiftBase(bars: Bars, base: XabcdBase, xSide: ZoneSide, aSide: ZoneSide, prevIdx: number | null, untilIdx = Infinity): XabcdBase {
  const pin = (moved: XPoint, orig: XPoint): XPoint => (moved.idx === orig.idx ? orig : { ...moved, pivotIdx: orig.idx });
  const x = pin(deepestWickX(bars, base.x, xSide, prevIdx, base.a.idx), base.x);
  const a = pin(extremeWick(bars, base.a, aSide, x.idx + 1, base.b.idx), base.a);
  const b = pin(extremeWick(bars, base.b, xSide, a.idx + 1, base.c.idx), base.b);
  return { x, a, b, c: shiftC(bars, base.c, b, aSide, xSide, untilIdx) };
}

/** Erste Kerze nach dem Pivot von C, die jenseits von B schließt (bestätigtes C→D-Bein); -1 ohne solche Kerze */
export function closeBeyondBIdx(bars: Bars, c: XPoint, b: XPoint, bSide: ZoneSide): number {
  for (let k = c.idx + 1; k < bars.length; k++) if (closesBeyond(bars[k], b.price, bSide)) return k;
  return -1;
}

/**
 * C erst nach bestätigtem C→D-Bein (Halil 2026-11-13): C sucht seine Dochtspitze zwischen B (ausgeschlossen) und dem Pivot von C (eingeschlossen).
 * Kerzen nach dem Pivot gehören zum C→D-Bein und zählen nicht. Verschoben wird nur, wenn nach dem Pivot schon eine Kerze jenseits von B schließt;
 * ohne diesen Schluss bleibt C am Pivot. Zählt nur ein Schluss bis zur Kerze `untilIdx` (eingeschlossen): nach dem Einstieg bleibt C,
 * wie es beim Einstieg war (Halil 2026-11-21, 1121-A2.1 „C girişte donar“).
 */
export function shiftC(bars: Bars, c: XPoint, b: XPoint, cSide: ZoneSide, bSide: ZoneSide, untilIdx = Infinity): XPoint {
  const end = closeBeyondBIdx(bars, c, b, bSide);
  if (end < 0 || end > untilIdx) return c;
  const moved = extremeWick(bars, c, cSide, b.idx + 1, c.idx + 1);
  return moved.idx === c.idx ? c : { ...moved, pivotIdx: c.idx };
}

/** Ein Pip des Symbols (Annahme: Paare 0.0001, JPY-Paare 0.01, Gold 0.1, Silber 0.01, übrige Symbole 0.01) */
export function pipOf(symbol: string): number {
  const p = HARMONIC_PARAMS.pip;
  const s = symbol.toUpperCase();
  if (s.startsWith('XAU')) return p.gold;
  if (s.startsWith('XAG')) return p.silver;
  // Ohne Instrumentdaten zählen nur bekannte Währungscodes als Forex; ein Suffix bleibt möglich.
  const currencies = new Set(['AUD', 'CAD', 'CHF', 'CNH', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF', 'JPY', 'MXN', 'NOK', 'NZD', 'PLN', 'SEK', 'SGD', 'TRY', 'USD', 'ZAR']);
  const base = s.slice(0, 3);
  const quote = s.slice(3, 6);
  if (base === quote || !currencies.has(base) || !currencies.has(quote)) return p.other;
  return base === 'JPY' || quote === 'JPY' ? p.jpy : p.default;
}

/** Anteil der Strecke X → A, den ein Preis von A aus Richtung X zurückläuft (A = 0, X = 1); null bei Länge 0 */
export function retraceXA(s: XabcdShape, price: number): number | null {
  return s.len === 0 ? null : (outward(s.cs, s.a.price) - outward(s.cs, price)) / s.len;
}

/** Preis des Levels der Fib X → A (A = 0, X = 1) */
export const levelXA = (s: XabcdShape, level: number): number => s.a.price + level * (s.x.price - s.a.price);

/** Preis des Levels der Fib A → B (B = 0, A = 1; −0.272 liegt jenseits von B) */
export const levelAB = (s: XabcdShape, level: number): number => s.b.price + level * (s.a.price - s.b.price);

/** Länge A → B */
export const lenAB = (s: XabcdShape): number => Math.abs(s.a.price - s.b.price);

/** Berührung eines Pflicht-Levels: der Anteil `value` erreicht `level`, bis zur Toleranz (`touchPips` Pips) davor gilt noch als Berührung */
export const reaches = (value: number | null, level: number, len: number, pip: number): boolean =>
  value !== null && len > 0 && value >= level - (HARMONIC_PARAMS.touchPips * pip) / len;

/** Reihenfolge X < A < B < C (< D) und eine Strecke X → A ungleich 0 */
export function ordered(s: XabcdShape): boolean {
  const base = s.x.idx < s.a.idx && s.a.idx < s.b.idx && s.b.idx < s.c.idx && s.len > 0;
  return base && (s.d === null || s.d.idx > s.c.idx);
}

/** Die Punkte wechseln die Seite: X und B liegen auf einer Seite von A, C auf der anderen Seite von B (Zickzack in Trade-Richtung) */
export function alternates(s: XabcdShape): boolean {
  const sx = Math.sign(s.x.price - s.a.price);
  const sb = Math.sign(s.b.price - s.a.price);
  return sx !== 0 && sx === sb && Math.sign(s.c.price - s.b.price) === -sb;
}

/** Fraktal der Seite `side` an Kerze `idx` ist fertig (2 + 2 Nachbarn, keiner schließt jenseits) und der Preis ist die Dochtspitze */
export function fractalDone(bars: Bars, p: XPoint, side: ZoneSide): boolean {
  const probe = probeFractal(bars, p.idx, side);
  return probe.leftBars === N && probe.rightBars === N && probe.beyond === 0 && p.price === wickEnd(bars[p.idx], side);
}

/** Zwischen den Kerzen von X und A liegt kein Docht jenseits von X oder A: beide sind die Extreme derselben Bewegung */
export function oneMove(bars: Bars, s: XabcdShape): boolean {
  for (let k = s.x.idx; k <= s.a.idx; k++) {
    if (outward(s.es, wickEnd(bars[k], s.es)) > outward(s.es, s.x.price)) return false;
    if (outward(s.cs, wickEnd(bars[k], s.cs)) > outward(s.cs, s.a.price)) return false;
  }
  return true;
}

/** Abstand zweier Preise in Vielfachen der ATR; null ohne ATR */
export const atrDistance = (a: number, b: number, atr: number | null): number | null => (atr === null || atr <= 0 ? null : Math.abs(a - b) / atr);

/** Schluss jenseits von X in der H4-Reihe (ersatzweise der Formations-Zeiteinheit) nach der Kerze von X */
export function closedBeyondX(env: Env, tf: ContextTimeframe, s: XabcdShape): boolean {
  const close = HARMONIC_PARAMS.closeTimeframe as ContextTimeframe;
  const viewTf = env.views.has(close) ? close : tf;
  const view = env.views.get(viewTf)!;
  const xTime = env.views.get(tf)!.bars[s.x.idx].time;
  const dur = TIMEFRAME_SEC[viewTf];
  // die Kerze, die X enthält, zählt mit: sie schließt nach X
  return view.bars.some((b) => b.time + dur > xTime && closesBeyond(b, s.x.price, s.es));
}

/** Fraktalzonen zählen aus der Formations-Zeiteinheit und aus höheren, nicht aus tieferen (Regelbuch: „der Formations- oder einer höheren ZE“) */
export const zoneTfCounts = (zoneTf: ContextTimeframe, tf: ContextTimeframe): boolean =>
  CONTEXT_TIMEFRAMES.indexOf(zoneTf) <= CONTEXT_TIMEFRAMES.indexOf(tf);

/**
 * Rechteck der Fraktalzone, wie sie bei `dTime` zu sehen war (A46.1; FRZ-01..04: die Zone entsteht, wenn das Fraktal fertig ist):
 * Vereinigung der Mitglieder, deren Fraktalkerze UND `FRZ_PARAMS.neighbors` rechte Nachbarkerzen bis `dTime` geschlossen haben; null ohne solches Mitglied.
 * Eine zusammengelegte Zone verliert so ein jüngeres, noch unbestätigtes Mitglied, behält aber die älteren. D selbst braucht keinen Kerzenschluss.
 * Nachbarn zählen als Kerzen der Zonen-Zeiteinheit (Wochenende und Lücken zählen nicht), nicht als Sekunden.
 */
export function zoneRectAt(env: Env, z: { tf: ContextTimeframe; members: readonly { time: number; rect: Rect }[] }, dTime: number): Rect | null {
  const bars = env.views.get(z.tf)?.bars;
  if (!bars) return null;
  const dur = TIMEFRAME_SEC[z.tf];
  const rects = z.members.filter((m) => {
    const idx = bars.findIndex((b) => b.time === m.time);
    const last = idx < 0 ? undefined : bars[idx + N];
    return last !== undefined && last.time + dur <= dTime;
  }).map((m) => m.rect);
  if (rects.length === 0) return null;
  return { top: Math.max(...rects.map((r) => r.top)), bottom: Math.min(...rects.map((r) => r.bottom)) };
}

/** Zeitpunkt von D für die Zonenzeilen: das echte D, sonst unbegrenzt (die Zeile misst am Ziel-Preis; ein Zwischenextrem ist kein D) */
const dTimeOf = (view: { bars: readonly FormationBar[] }, s: XabcdShape, atD: boolean): number => (s.d && atD ? view.bars[s.d.idx].time : Infinity);

/** Zonen (Fraktal- und Engulf-Zonen) nahe `price`, die nicht erst das D selbst bildet */
export function zonesNear(env: Env, tf: ContextTimeframe, s: XabcdShape, price: number, near: number, atD = true): Rect[] {
  const view = env.views.get(tf)!;
  const tradeZone = zoneSideOf(s.side);
  const dTime = dTimeOf(view, s, atD);
  const out: Rect[] = [];
  for (const z of [...env.frz.zones, ...env.frz.reversed]) {
    // die Zone zählt erst, wenn Fraktalkerze und rechte Nachbarn vor D geschlossen haben (A46.1)
    const rect = z.side === tradeZone && zoneTfCounts(z.tf, tf) ? zoneRectAt(env, z, dTime) : null;
    if (rect && gapToRect(rect, price) <= near) out.push(rect);
  }
  for (const z of engulfZones(view.bars, view.wide)) {
    const formedByD = s.d !== null && z.idx >= s.d.idx;
    if (z.holds && z.side === s.side && !formedByD && gapToRect(z.rect, price) <= near) out.push(z.rect);
  }
  return out;
}

/** Zeit und Höhe genügen (Dauer X → D bzw. bis zur letzten Kerze, Höhe X → A als Vielfaches der ATR); null ohne ATR */
export function enoughSpace(s: XabcdShape, lastIdx: number, atr: number | null): boolean | null {
  if (atr === null || atr <= 0) return null;
  const to = s.d ? s.d.idx : lastIdx;
  return to - s.x.idx >= HARMONIC_PARAMS.space.bars && s.len >= HARMONIC_PARAMS.space.atr * atr;
}

/** Mindestens `share` der Kerzen von X bis A sind volumenstark (BAT-02); null, solange eine Kerze nicht messbar ist */
export function wideShareOfMove(wide: readonly (boolean | null)[], s: XabcdShape): boolean | null {
  const flags = wide.slice(s.x.idx + 1, s.a.idx + 1);
  if (flags.length === 0 || flags.some((f) => f === null)) return null;
  return flags.filter(Boolean).length / flags.length >= HARMONIC_PARAMS.wideShare;
}

/**
 * Höhere Zeiteinheit gegen den Trade (GAR-19): Divergenz in D1 und W1 an den Extremen und RSI(7) in H4 lange im Extrem.
 * W1 wird aus D1 gebildet (weekly.ts); fehlt es, ist der Teil nicht messbar. Ein ☐ eines Teils macht die Bedingung ☐.
 */
export function higherAgainst(env: Env, side: Side): CheckState {
  const against: Side = side === 'buy' ? 'sell' : 'buy';
  const d1 = env.trends.get('D1');
  const div = d1 ? divergenceOf(d1, zoneSideOf(against)) : null;
  const divD1 = !div || div.a.wave === null || div.b.wave === null ? null : div.tie;
  const w1 = env.trends.get('W1');
  const divW1Raw = w1 ? divergenceOf(w1, zoneSideOf(against)) : null;
  const divW1 = !divW1Raw || divW1Raw.a.wave === null || divW1Raw.b.wave === null ? null : divW1Raw.tie;
  const h4 = env.views.get('H4');
  const rsiRun = h4 ? trailingRun(h4.rsi.map((v) => rsiExtreme(v, against))) >= HARMONIC_PARAMS.longRun : null;
  const parts: (boolean | null)[] = [divD1, divW1, rsiRun];
  if (parts.includes(false)) return 'unmet';
  return parts.includes(null) ? 'unmeasurable' : 'met';
}

/** Anker an Kerze `idx` */
export const anchorAt = (bars: Bars, idx: number, price: number): Anchor => ({ time: bars[idx].time, price });

export const ids = (code: string, list: number[]): string[] => list.map((n) => `${code}-${String(n).padStart(2, '0')}`);

/** Eigene Punkte einer Prüfung: Dochtspitzen mit Öffnungszeit der Kerze */
export interface XabcdInput {
  tf: ContextTimeframe;
  x: Anchor;
  a: Anchor;
  b: Anchor;
  c: Anchor;
  /** Ohne Angabe: der äußerste Docht seit C */
  d?: Anchor;
}

export interface XabcdAnalysis {
  tf: ContextTimeframe;
  candidate: Candidate;
}

export type Evaluate = (env: Env, tf: ContextTimeframe, s: XabcdShape, pip: number) => Candidate;

/** Alles „nicht messbar“, im Aufbau */
export function unmeasurable(code: string, tf: ContextTimeframe, checkIds: readonly string[], rules: Record<string, [Check['kind'], Check['status']]>): Candidate {
  const checks: Check[] = checkIds.map((id) => ({ id, kind: rules[id][0], status: rules[id][1], state: 'unmeasurable', drawings: [] }));
  return { code, side: 'buy', tf, points: {}, checks, drawings: [], verdict: 'forming' };
}

/** Zähler der Suchlast für den Test (Arbeit statt Zeit, stabil unter Last): `evaluated` = Kandidatenmessungen, `keys` = Umgebungen für „beste Basis zum Zeitpunkt“, `bases` = geprüfte historische Basen, `entered`/`running` = darunter eingegangene bzw. laufende Handel, `keyBuilds` = Schlüssel, die `historicBases` aufbauen musste */
export const xabcdWork = { evaluated: 0, keys: 0, bases: 0, entered: 0, running: 0, keyBuilds: 0 };

/**
 * Beendete Handel je Kontext und Prüfer: Basis → Kerze, in der der Handel endete (`status.endIdx`). Aus allen Suchen, mit und ohne Zonen: Handel,
 * Punkte, Stop, Einstiegs- und Endkerze lesen keine Zone (nur Form-Bedingungen, Einstieg und Stand).
 * Nach dem Einstieg ist der Handel eingefroren (C und X, 1121-A2.1, 1122-A28.1) und sein Ende ändert sich mit späteren Kerzen nicht; eine spätere Suche
 * lässt ihn ohnehin weg (kein laufender Handel), also misst sie ihn nicht noch einmal.
 */
const endedStore = new WeakMap<FormationContext, WeakMap<object, Map<string, EndedTrade>>>();

/**
 * Basen ohne Einstieg je Kontext und Prüfer: Basis → bis zu welcher letzten Kerze sie ohne Einstieg gemessen wurde. Ohne Einstieg zu einer Kerze heißt
 * ohne Einstieg zu jeder früheren (D erreicht das Level nur später; der Einstieg hängt nur an der Form), solange C gleich verschoben ist:
 * `noCutMax` gilt ohne Schluss jenseits von B (C am Pivot), `cut` und `cutMax` mit diesem Schluss (C verschoben).
 */
const notEnteredStore = new WeakMap<FormationContext, WeakMap<object, Map<string, { noCutMax: number; cut?: number; cutMax?: number }>>>();

/** Beendeter Handel einer Basis: Endkerze, Handel (`tradeKey`), Punkte (`pointsKey`), Stop und Einstiegskerze */
interface EndedTrade {
  endIdx: number;
  key: string;
  points: string;
  stop: number | null;
  entryIdx: number;
}

/**
 * Kandidat einer Basis: C wie beim Einstieg (1121-A2.1). Zuerst mit verschobenem C gemessen; liegt der erste Schluss jenseits von B
 * nach der Einstiegskerze, wird mit C am Pivot neu gemessen (der Einstieg hing dann noch nicht vom verschobenen C ab).
 */
function candidateOf(env: Env, tf: ContextTimeframe, bars: Bars, pivots: readonly Pivot[], base: XabcdBase, evaluate: Evaluate, pip: number): Candidate {
  const xi = pivots.findIndex((p) => p.idx === base.x.idx);
  const prev = xi > 0 ? pivots[xi - 1].idx : null;
  return candidateOfBase(env, tf, bars, { base, prev, xSide: pivots[xi].side, aSide: pivots[xi + 1].side }, evaluate, pip);
}

/** Wie `candidateOf`, aber mit den Wendepunkten einer gegebenen (auch früheren) Zeit: `prev` begrenzt die Suche nach X (`deepestWickX`) */
function candidateOfBase(env: Env, tf: ContextTimeframe, bars: Bars, h: Omit<HistoricBase, 'current'>, evaluate: Evaluate, pip: number): Candidate {
  const { base, prev, xSide, aSide } = h;
  const picked = shiftBase(bars, base, xSide, aSide, prev);
  xabcdWork.evaluated++;
  const candidate = evaluate(env, tf, shapeOfX(bars, picked), pip);
  if (picked.c === base.c) return candidate;
  const entryIdx = candidate.trade?.entryIdx;
  const cut = closeBeyondBIdx(bars, base.c, picked.b, xSide);
  if (entryIdx === undefined || cut <= entryIdx) return candidate;
  xabcdWork.evaluated++;
  return evaluate(env, tf, shapeOfX(bars, shiftBase(bars, base, xSide, aSide, prev, entryIdx)), pip);
}

/**
 * Sucht je geladener Zeiteinheit (hoch → tief) die Punkte X, A, B, C: unter den Kandidaten der letzten `lookbackPivots` Wendepunkte gilt der mit den
 * wenigsten verletzten Form-Bedingungen (`misses`), bei Gleichstand der jüngste.
 * Ein eingegangener Handel, der zum Schluss seiner Einstiegskerze nicht gezeigt war, wird nie gezeigt: trägt die beste Basis einen solchen Handel, gilt
 * die nächstbeste ohne ihn (1122-A3.2). Den Handel hätte niemand eingehen können, und ein „schon laufender“ Handel, der auftaucht, kann mit der nächsten
 * Wendepunkt-Verschiebung wieder verschwinden. „Gezeigt“ ist das Ergebnis dieser Suche zu jenem Schluss (nach Auslassen und Vorrang); ein Handel, der in
 * der letzten Kerze eingeht, gilt zu ihrem Schluss nicht als verborgen.
 * Vorrang hat ein eingegangener Handel, der vor der letzten Kerze einging, noch läuft oder in der letzten Kerze endet und nicht verborgen ist. So fällt er erst nach seinem Ende weg und
 * zeigt sein Ende einmal (1121-A1.3, Entscheidung 1120-A42.1). Gesucht wird er unter allen Basen, deren X im Verlaufsfenster der Zeiteinheit liegt
 * (`HISTORY_DAYS`). Unter mehreren gilt der zuerst eingegangene (ein späterer Einstieg verdrängt ihn nicht), bei gleicher Einstiegskerze der mit den
 * wenigsten `misses`, dann der jüngste.
 * Endete die beim Einstieg gezeigte Basis eines Handels vor der letzten Kerze, gilt derselbe Handel (gleicher Schlüssel) auf einer anderen Basis als
 * verborgen: der beendete Handel kommt nicht mit anderem Stop wieder (das Ende zeigt sich einmal, 1120-A42.1; Basis friert am Einstieg ein, 1122-A28.1).
 */
export function analyzeXabcd(
  ctx: FormationContext,
  t: number,
  evaluate: Evaluate,
  misses: (c: Candidate) => number,
  empty: (tf: ContextTimeframe) => Candidate,
): XabcdAnalysis[] {
  const tfs = ctx.timeframes();
  const base = tfs.length > 0 ? buildEnv(ctx, t, tfs[0]) : null;
  if (!base) return [];
  const pip = pipOf(ctx.symbol);
  // gezeigter Handel je Kontext, Prüfer und Schluss (shownTrade.ts): hängt nur von den Kerzen bis dahin ab
  const keys = shownKeysOf(ctx, evaluate);
  let endedByScope = endedStore.get(ctx);
  if (!endedByScope) endedStore.set(ctx, (endedByScope = new WeakMap()));
  let ended = endedByScope.get(evaluate);
  if (!ended) endedByScope.set(evaluate, (ended = new Map()));
  let notEnteredByScope = notEnteredStore.get(ctx);
  if (!notEnteredByScope) notEnteredStore.set(ctx, (notEnteredByScope = new WeakMap()));
  let notEntered = notEnteredByScope.get(evaluate);
  if (!notEntered) notEnteredByScope.set(evaluate, (notEntered = new Map()));

  /** Gezeigter Kandidat der Zeiteinheit zum Zeitpunkt `at`; merkt sich seinen Handel als Schlüssel */
  const shownAt = (env: Env, tf: ContextTimeframe, at: number): Candidate | null => {
    const bars = env.views.get(tf)!.bars;
    const pivots = env.trends.get(tf)!.pivots;
    // je Basis einmal gemessen (die Basen aus vier aufeinanderfolgenden Wendepunkten sind durch ihr C eindeutig)
    const measured = new Map<number, Candidate>();
    const candidateFor = (b: XabcdBase) => {
      let c = measured.get(b.c.idx);
      if (!c) measured.set(b.c.idx, (c = candidateOf(env, tf, bars, pivots, b, evaluate, pip)));
      return c;
    };
    const top = bestRecent(pivots, candidateFor, misses);
    const last = bars.length - 1;
    // leere Zeiteinheit (keine Kerzen geladen): kein Schlüssel, keine Verlaufssuche
    if (last < 0) return top?.candidate ?? null;
    // Eingegangener Handel, der zum Schluss seiner Einstiegskerze nicht gezeigt war (1122-A3.2); Einstieg in der letzten Kerze: nicht verborgen
    const hidden = hiddenOf(tf, bars, tradeAt);
    // derselbe Handel mit den Punkten, die zum Schluss seiner Einstiegskerze gezeigt waren (C und X frieren am Einstieg ein, 1121-A2.1)
    const frozen = frozenOf(tf, bars, tradeAt);
    const bestShown = top && hidden(top.candidate) ? bestRecent(pivots, candidateFor, misses, hidden) : top;
    const recent = new Set(selectBases(pivots).map((b) => b.c.idx));
    const windowStart = historyStart(tf, at);
    // Basen aus den Wendepunkten JEDER früheren Kerze im Fenster: zeichnet der Trend B, C oder den Wendepunkt vor X nach dem Einstieg um,
    // bleibt die Basis des laufenden Handels mit ihren damaligen Punkten erhalten (Basis und Einstieg frieren am Einstieg ein, 1122-A28.1)
    const open: { candidate: Candidate; entryIdx: number }[] = [];
    // vor der letzten Kerze beendete Handel je Handels-Schlüssel (Punkte und Einstiegskerze)
    const endedByKey = new Map<string, EndedTrade[]>();
    const noteEnded = (e: EndedTrade) => {
      if (e.endIdx < last) endedByKey.set(e.key, [...(endedByKey.get(e.key) ?? []), e]);
    };
    // Das Fenster gilt für einen laufenden Handel ab seinem Einstieg (1122-A1.4 a, wie AB=CD): auch Basen mit X vor dem Fenster, deren C zu einer
    // Kerze im Fenster unter den letzten `lookbackPivots` Wendepunkten lag (nur dort kann ein Einstieg gezeigt worden sein, Regel B); sie zählen nur
    // mit einem laufenden Handel, der im Fenster einging. Der Vorlauf (`TREND_LEAD_DAYS`) lädt die Kerzen vor dem Fenster
    for (const h of historicBases(env.trends.get(tf)!, bars, windowStart, recent, HARMONIC_PARAMS.lookbackPivots)) {
      // X vor dem Fenster: der Einstieg (erste Berührung des D-Levels, `harmonicFreeze`) liegt spätestens in der Kerze von D, dem äußersten Docht
      // seit C; liegt D vor dem Fenster, liegt auch der Einstieg davor. Ohne Messung übersprungen
      const beforeWindow = !h.current && !recent.has(h.base.c.idx) && bars[h.base.x.idx].time < windowStart;
      if (beforeWindow) {
        const d = shapeOfX(bars, shiftBase(bars, h.base, h.xSide, h.aSide, h.prev)).d;
        if (!d || bars[d.idx].time < windowStart) continue;
      }
      // Ein schon beendeter Handel dieser Basis fällt wieder weg, ohne neu gemessen zu werden; eine Basis ohne Einstieg bleibt ohne Einstieg, solange
      // die Kerzen nicht weiter reichen als bei der Messung (und C gleich verschoben ist)
      const endKey = `${tf}|${h.prev}|${h.xSide}${h.aSide}|${[h.base.x, h.base.a, h.base.b, h.base.c].map((p) => `${p.idx}@${p.price}`).join('|')}`;
      const endedAt = ended.get(endKey);
      if (endedAt !== undefined && endedAt.endIdx < last) {
        noteEnded(endedAt);
        continue;
      }
      const none = notEntered.get(endKey);
      if (none !== undefined && (last <= none.noCutMax || (none.cut !== undefined && none.cut <= last && last <= none.cutMax!))) continue;
      // Die Messung der letzten Kerze (`candidateFor`) nimmt Vorgänger und Seiten aus den heutigen Wendepunkten; nur bei gleichen Werten gilt der Schlüssel
      let cacheable = true;
      if (h.current) {
        const xi = pivots.findIndex((p) => p.idx === h.base.x.idx);
        cacheable = (xi > 0 ? pivots[xi - 1].idx : null) === h.prev && pivots[xi].side === h.xSide && pivots[xi + 1].side === h.aSide;
      }
      const candidate = h.current ? candidateFor(h.base) : candidateOfBase(env, tf, bars, h, evaluate, pip);
      xabcdWork.bases++;
      const endIdx = candidate.trade?.status?.endIdx;
      const entryIdx = candidate.trade?.entryIdx;
      if (endIdx !== undefined && enteredTrade(candidate)) {
        const e: EndedTrade = { endIdx, key: tradeKey(candidate, bars)!, points: pointsKey(candidate), stop: candidate.trade!.stop ?? null, entryIdx: entryIdx! };
        if (cacheable) ended.set(endKey, e);
        noteEnded(e);
      }
      if (cacheable && !enteredTrade(candidate)) {
        const cut = closeBeyondBIdx(bars, h.base.c, shiftBase(bars, h.base, h.xSide, h.aSide, h.prev).b, h.xSide);
        const mark = none ?? { noCutMax: -1 };
        if (cut < 0) mark.noCutMax = Math.max(mark.noCutMax, last);
        else {
          mark.cut = cut;
          mark.cutMax = Math.max(mark.cutMax ?? -1, last);
        }
        notEntered.set(endKey, mark);
      }
      // in der letzten Kerze eingegangen: noch nie gezeigt, also kein Vorrang (gezeigt wird er nur als beste Basis)
      if (enteredTrade(candidate)) xabcdWork.entered++;
      if (!enteredTrade(candidate) || (endIdx !== undefined && endIdx < last) || entryIdx === last) continue;
      if (beforeWindow && !entryInHistory(tf, bars, candidate, at)) continue;
      xabcdWork.running++;
      open.push({ candidate, entryIdx: entryIdx! });
    }
    // Hayalet (1120-A42.1, 1122-A28.1): derselbe Handel auf einer anderen Basis, nachdem die beim Einstieg gezeigte Basis vor der letzten Kerze endete.
    // Die Identität hat keinen Stop (1122-A3.4.1), also ließe Regel B ihn durch; er käme mit anderem Stop und anderem Stand wieder.
    const dur = TIMEFRAME_SEC[tf];
    const ghost = (c: Candidate): boolean => {
      const list = enteredTrade(c) && c.trade!.entryIdx! < last ? endedByKey.get(tradeKey(c, bars)!) : undefined;
      if (!list) return false;
      const atEntry = tradeAt(tf, bars[c.trade!.entryIdx!].time + dur).points;
      // derselbe Ausgang (gleicher Stop, gleiche Endkerze) mit verschobenem Wendepunkt ist kein anderer Handel (1122-A3.2)
      const sameOutcome = (e: EndedTrade) => c.trade!.stop === e.stop && c.trade!.status!.endIdx === e.endIdx;
      return atEntry !== pointsKey(c) && list.some((e) => e.points === atEntry && !sameOutcome(e));
    };
    const skip = (c: Candidate) => hidden(c) || ghost(c);
    const best = bestShown && ghost(bestShown.candidate) ? bestRecent(pivots, candidateFor, misses, skip) : bestShown;
    // der zuerst eingegangene nicht verborgene Handel; `hidden` (rechnet frühere Schlüsse) nur, bis er gefunden ist
    open.sort((x, y) => x.entryIdx - y.entryIdx);
    let kept: { candidate: Candidate; unmet: number; entryIdx: number; frozen: boolean } | null = null;
    for (const o of open) {
      if (kept !== null && o.entryIdx > kept.entryIdx) break;
      if (skip(o.candidate)) continue;
      // nicht verborgen und gleiche Einstiegskerze: derselbe Handel (der gezeigte), also zuerst die beim Einstieg gezeigten Punkte, dann wenigste `misses`
      const unmet = misses(o.candidate);
      const isFrozen = frozen(o.candidate);
      if (kept !== null && (kept.frozen > isFrozen || (kept.frozen === isFrozen && unmet >= kept.unmet))) continue;
      kept = { candidate: o.candidate, unmet, entryIdx: o.entryIdx, frozen: isFrozen };
    }
    const shown = kept?.candidate ?? best?.candidate ?? null;
    recordShown(keys, tf, bars, shown);
    return shown;
  };
  // Handel, den die Suche zu einem früheren Schluss zeigte: ohne Zonen gerechnet, einmal je Kontext. Zonen lesen in den Harmoniken nur Bonus-Zeilen
  // (Zone am D, Umkehr der tieferen Zeiteinheit) und SIG-29; der gezeigte Handel hängt an Form-Bedingungen, Punkt-Ausschlüssen, Variante, Einstieg, Stand
  const tradeAt = tradeAtOf(ctx, keys, (e, tf, at) => shownAt(e, tf, at));
  return tfs.map((tf) => ({ tf, candidate: shownAt(envFor(base, ctx, t, tf), tf, t) ?? empty(tf) }));
}

/** Beste Basis der letzten `lookbackPivots` Wendepunkte: wenigste `misses`, bei Gleichstand die jüngste; `skip` lässt Kandidaten aus */
function bestRecent(
  pivots: readonly Pivot[],
  candidateFor: (base: XabcdBase) => Candidate,
  misses: (c: Candidate) => number,
  skip?: (c: Candidate) => boolean,
): { base: XabcdBase; candidate: Candidate; unmet: number } | null {
  let best: { base: XabcdBase; candidate: Candidate; unmet: number } | null = null;
  for (const base of selectBases(pivots)) {
    const candidate = candidateFor(base);
    if (skip?.(candidate)) continue;
    const unmet = misses(candidate);
    if (best === null || unmet < best.unmet) best = { base, candidate, unmet };
  }
  return best;
}

/** Basis samt den Wendepunkt-Seiten von X und A und dem Wendepunkt vor X (`prev`), wie zu einer bestimmten Zeit gezeichnet */
export interface HistoricBase {
  base: XabcdBase;
  prev: number | null;
  xSide: ZoneSide;
  aSide: ZoneSide;
  /** gleiche Punkte und gleicher Wendepunkt vor X wie in der letzten Kerze (dann gilt die Messung von `candidateFor`) */
  current?: boolean;
}

/** Die Wendepunkte der Zeit `k` gelten bis vor die nächstjüngere Zeit `upper` (Infinity: bis zur letzten Kerze); reicht das in das Fenster? */
const inWindow = (bars: Bars, upper: number, windowStart: number): boolean =>
  bars[Math.min(upper, bars.length) - 1].time >= windowStart;

/** Ergebnisse je Trendmodell (unveränderlich nach dem Bau) und Eingabe: viele Suchen früherer Schlüsse teilen sich dasselbe Modell */
const basesMemo = new WeakMap<TrendModel, Map<string, HistoricBase[]>>();

/** Wie `historicBasesRef`, aber artig: je Zeit nur die Basen um die Wendepunkte, die sich gegenüber der nächsten Zeit änderten; Ergebnis je Modell gemerkt */
export function historicBases(m: TrendModel, bars: Bars, windowStart: number, recent: ReadonlySet<number>, lookback = 0): HistoricBase[] {
  let byArgs = basesMemo.get(m);
  if (!byArgs) basesMemo.set(m, (byArgs = new Map()));
  const key = `${bars.length}|${windowStart}|${lookback}|${[...recent].join(',')}`;
  let out = byArgs.get(key);
  if (!out) byArgs.set(key, (out = historicBasesSweep(m, bars, windowStart, recent, lookback)));
  return out;
}

/**
 * Alle Basen X, A, B, C aus vier aufeinanderfolgenden Wendepunkten, wie sie zu IRGENDEINER Kerze im Trendzug standen (aus der Lebensdauer der
 * Wendepunkte, `TrendModel.spans`), jüngste Zeit und jüngstes C zuerst, jede Basis einmal. Nur Kerzen bis zur letzten: kein Blick in die Zukunft.
 * Eine Basis gilt, wenn ihr C unter den letzten Wendepunkten liegt (`recent`) oder ihr X im Fenster ab `windowStart`, oder wenn ihr C zu einer Zeit,
 * deren Wendepunkte bis in das Fenster gelten, unter den letzten `lookback` Wendepunkten jener Zeit lag (0: nie).
 */
export function historicBasesRef(m: TrendModel, bars: Bars, windowStart: number, recent: ReadonlySet<number>, lookback = 0): HistoricBase[] {
  const pt = (p: Pivot): XPoint => ({ idx: p.idx, price: p.price });
  const last = bars.length - 1;
  const times = new Set<number>([last]);
  for (const sp of m.spans) {
    if (bars[sp.pivot.idx].time < windowStart) continue;
    times.add(sp.from);
    if (sp.to !== Infinity) times.add(sp.to);
  }
  const keyOf = (prev: Pivot | undefined, ps: readonly Pivot[]) => [prev?.idx ?? null, ...ps.map((p) => `${p.idx}@${p.price}`)].join('|');
  const seen = new Set<string>();
  const out: HistoricBase[] = [];
  // Lebende Wendepunkte je Zeit k (jüngste zuerst) durch Mitlaufen statt je Zeit alle Spannen zu filtern: eine Spanne lebt für from <= k < to,
  // tritt beim Absinken von k unter `to` ein und verlässt die Menge unter `from` (danach nie wieder)
  const spans = m.spans;
  const byTo = spans.map((_, i) => i).sort((p, q) => spans[q].to - spans[p].to || p - q);
  const byFrom = spans.map((_, i) => i).sort((p, q) => spans[q].from - spans[p].from || p - q);
  let enter = 0;
  let leave = 0;
  const live = new Set<number>();
  let prev: readonly Pivot[] = [];
  let prevStop = Infinity;
  let prevPos = new Map<Pivot, number>();
  let upper = Infinity;
  for (const k of [...times].sort((a, b) => b - a)) {
    // die Wendepunkte dieser Zeit gelten für die Kerzen k bis vor der nächstjüngeren Zeit; reicht das in das Fenster, zählen die letzten `lookback`
    const top = inWindow(bars, upper, windowStart) ? lookback : 0;
    upper = k;
    let alive: readonly Pivot[];
    if (k === last) {
      alive = m.pivots;
    } else {
      while (enter < byTo.length && spans[byTo[enter]].to > k) {
        if (spans[byTo[enter]].from <= k) live.add(byTo[enter]);
        enter++;
      }
      while (leave < byFrom.length && spans[byFrom[leave]].from > k) live.delete(byFrom[leave++]);
      alive = [...live].map((i) => spans[i].pivot).sort((a, b) => a.idx - b.idx);
    }
    let stop = 2;
    for (let j = alive.length - 1; j >= 3; j--) {
      const [x, a, b, c] = [alive[j - 3], alive[j - 2], alive[j - 1], alive[j]];
      if (!recent.has(c.idx) && bars[x.idx].time < windowStart && j < alive.length - top) {
        stop = j;
        break;
      }
      // dieselben fünf Wendepunkte standen schon in der vorigen Zeit im bearbeiteten Teil: ihr Schlüssel ist in `seen`
      const q = prevPos.get(c);
      if (q !== undefined && q > prevStop && prev[q - 1] === b && prev[q - 2] === a && prev[q - 3] === x && prev[q - 4] === alive[j - 4]) continue;
      xabcdWork.keyBuilds++;
      const key = keyOf(alive[j - 4], [x, a, b, c]);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ base: { x: pt(x), a: pt(a), b: pt(b), c: pt(c) }, prev: j > 3 ? alive[j - 4].idx : null, xSide: x.side, aSide: a.side, current: k === last });
    }
    prev = alive;
    prevStop = stop;
    prevPos = new Map(alive.map((p, i) => [p, i]));
  }
  return out;
}

/**
 * Gleiche Basen in gleicher Reihenfolge wie `historicBasesRef`. Die Menge der lebenden Wendepunkte bleibt sortiert; zu einer Zeit kommen nur die Basen
 * neu hinzu, deren fünf Wendepunkte (mit dem Vorgänger von X) sich gegenüber der nächstjüngeren Zeit änderten: an Stellen mit eingefügten oder entfernten
 * Wendepunkten und unterhalb des tiefsten bearbeiteten Wendepunkts der vorigen Zeit. Der Rest steht schon in `seen`.
 */
function historicBasesSweep(m: TrendModel, bars: Bars, windowStart: number, recent: ReadonlySet<number>, lookback: number): HistoricBase[] {
  const pt = (p: Pivot): XPoint => ({ idx: p.idx, price: p.price });
  const last = bars.length - 1;
  const times = new Set<number>([last]);
  for (const sp of m.spans) {
    if (bars[sp.pivot.idx].time < windowStart) continue;
    times.add(sp.from);
    if (sp.to !== Infinity) times.add(sp.to);
  }
  const keyOf = (prev: Pivot | undefined, ps: readonly Pivot[]) => [prev?.idx ?? null, ...ps.map((p) => `${p.idx}@${p.price}`)].join('|');
  const seen = new Set<string>();
  const out: HistoricBase[] = [];
  const emit = (alive: readonly Pivot[], j: number, current: boolean) => {
    xabcdWork.keyBuilds++;
    const [x, a, b, c] = [alive[j - 3], alive[j - 2], alive[j - 1], alive[j]];
    const key = keyOf(alive[j - 4], [x, a, b, c]);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ base: { x: pt(x), a: pt(a), b: pt(b), c: pt(c) }, prev: j > 3 ? alive[j - 4].idx : null, xSide: x.side, aSide: a.side, current });
  };
  // größtes j, dessen C nicht unter den letzten Wendepunkten liegt (auch nicht unter den letzten `top` dieser Zeit) und dessen X vor dem Fenster
  // liegt; 2, wenn es keines gibt
  const stopOf = (alive: readonly Pivot[], top: number): number => {
    let lo = 0;
    let hi = alive.length - 1;
    let pos = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (bars[alive[mid].idx].time < windowStart) {
        pos = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    for (let j = Math.min(pos + 3, alive.length - 1 - top); j >= 3; j--) if (!recent.has(alive[j].idx)) return j;
    return 2;
  };
  const spans = m.spans;
  const byTo = spans.map((_, i) => i).sort((p, q) => spans[q].to - spans[p].to || p - q);
  const byFrom = spans.map((_, i) => i).sort((p, q) => spans[q].from - spans[p].from || p - q);
  let enter = 0;
  let leave = 0;
  const live = new Set<number>();
  // lebende Wendepunkte nach Kerze sortiert (gleiche Kerze: in der Reihenfolge des Eintritts)
  const arr: Pivot[] = [];
  const boundary = (idx: number, inclusive: boolean) => {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (inclusive ? arr[mid].idx <= idx : arr[mid].idx < idx) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  let first = true;
  let prevLow: Pivot | undefined;
  let upper = Infinity;
  for (const k of [...times].sort((a, b) => b - a)) {
    const topK = inWindow(bars, upper, windowStart) ? lookback : 0;
    upper = k;
    const added: Pivot[] = [];
    const removed: Pivot[] = [];
    if (k !== last) {
      while (enter < byTo.length && spans[byTo[enter]].to > k) {
        const i = byTo[enter++];
        if (spans[i].from <= k) {
          live.add(i);
          const pv = spans[i].pivot;
          arr.splice(boundary(pv.idx, true), 0, pv);
          added.push(pv);
        }
      }
      while (leave < byFrom.length && spans[byFrom[leave]].from > k) {
        const i = byFrom[leave++];
        if (!live.delete(i)) continue;
        const pv = spans[i].pivot;
        for (let q = boundary(pv.idx, false); q < arr.length; q++) {
          if (arr[q] === pv) {
            arr.splice(q, 1);
            break;
          }
        }
        removed.push(pv);
      }
    }
    const alive: readonly Pivot[] = k === last ? m.pivots : arr;
    const stop = stopOf(alive, topK);
    const top = alive.length - 1;
    if (first) {
      for (let j = top; j > stop; j--) emit(alive, j, k === last);
    } else {
      const todo = new Set<number>();
      const around = (from: number, to: number) => {
        for (let j = Math.max(from, stop + 1); j <= Math.min(to, top); j++) todo.add(j);
      };
      for (const pv of added) {
        for (let q = boundary(pv.idx, false); q < alive.length && alive[q].idx === pv.idx; q++) if (alive[q] === pv) around(q, q + 4);
      }
      for (const pv of removed) around(boundary(pv.idx, false) - 1, boundary(pv.idx, false) + 4);
      if (prevLow !== undefined) for (let j = stop + 1; j <= top && alive[j].idx <= prevLow.idx; j++) todo.add(j);
      for (const j of [...todo].sort((a, b) => b - a)) emit(alive, j, k === last);
    }
    prevLow = alive[stop + 1];
    first = false;
  }
  return out;
}

/** Prüft eigene Punkte; ist eine Kerze nicht geschlossen oder nicht geladen oder stimmt die Reihenfolge nicht, sind die Prüfungen nicht messbar */
export function checkXabcd(ctx: FormationContext, t: number, input: XabcdInput, evaluate: Evaluate, empty: (tf: ContextTimeframe) => Candidate): Candidate {
  const env = buildEnv(ctx, t, input.tf);
  const bars = env?.views.get(input.tf)?.bars;
  if (!env || !bars) return empty(input.tf);
  const idxOf = (a: Anchor) => bars.findIndex((b) => b.time === a.time);
  const at = (a: Anchor): XPoint => ({ idx: idxOf(a), price: a.price });
  const base: XabcdBase = { x: at(input.x), a: at(input.a), b: at(input.b), c: at(input.c) };
  const d = input.d ? at(input.d) : undefined;
  if (Object.values(base).some((p) => p.idx < 0) || (d && d.idx < 0)) return empty(input.tf);
  const s = shapeOfX(bars, base, d);
  return ordered(s) ? evaluate(env, input.tf, s, pipOf(ctx.symbol)) : empty(input.tf);
}

/** Verlauf eines Kandidaten für die Zeichnungen: X, A, B, C und, wenn D fertig ist, D */
export const zigOf = (bars: Bars, s: XabcdShape, withD: boolean): Anchor[] => {
  const out = [s.x, s.a, s.b, s.c].map((p) => anchorAt(bars, p.idx, p.price));
  if (withD && s.d) out.push(anchorAt(bars, s.d.idx, s.d.price));
  return out;
};

/** Eine Kerze nach C schließt jenseits von B (ABCD-03): erst dann wird D gesucht; zählt bis zur Kerze von D, ohne D bis zur letzten Kerze */
export function closedBeyondB(bars: Bars, s: XabcdShape): boolean {
  const to = s.d ? s.d.idx : bars.length - 1;
  for (let k = Math.max(s.c.idx, pivotIdxOf(s.c)) + 1; k <= to; k++) if (closesBeyond(bars[k], s.b.price, s.es)) return true;
  return false;
}

/** Trend der nächsthöheren geladenen Zeiteinheit in Trade-Richtung; ohne höhere Zeiteinheit nicht messbar */
export function higherWith(env: Env, tf: ContextTimeframe, side: Side): CheckState {
  const higher = neighborTf(env, tf, -1);
  const dir = higher ? env.trends.get(higher)?.dir : null;
  if (!dir) return 'unmeasurable';
  return dirSide(dir) === side ? 'met' : 'unmet';
}

/** Umkehrkerze in Trade-Richtung (Engulf, SIG-23 bis SIG-26, `reversalAt`) in der nächsttieferen geladenen Zeiteinheit ab der Kerze von D; ohne D oder tiefere Zeiteinheit nicht messbar */
export function lowerReversal(env: Env, tf: ContextTimeframe, s: XabcdShape): CheckState {
  const lower = neighborTf(env, tf, 1);
  const view = lower ? env.views.get(lower) : undefined;
  if (!s.d || !view) return 'unmeasurable';
  const from = env.views.get(tf)!.bars[s.d.idx].time;
  // die tiefere Zeiteinheit reicht nicht bis zur Kerze von D zurück: nichts zu vergleichen
  if (view.bars.length === 0 || view.bars[0].time > from) return 'unmeasurable';
  return reversalAt(env, tf, s.side, s.d, [lower!]);
}
