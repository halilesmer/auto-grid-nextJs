/**
 * AB=CD (ABCD): Prüfung je Bedingungs-ID und Zeichnungen Z-ABCD-01 bis Z-ABCD-10.
 * `analyzeAbcd` sucht je geladener Zeiteinheit die letzten Punkte A, B, C aus den Wendepunkten und misst D;
 * `checkAbcdCandidate` prüft eigene Punkte, auch wenn sie keine Formation ergeben (Zeichnung und ☐ gibt es trotzdem).
 *
 * Lesart der Zustände: bei Ereignis-Bedingungen (ABCD-03, ABCD-07, ABCD-08, ABCD-21 bis ABCD-26) heißt ☑
 * „liegt vor“, bei Ausschlüssen also „ausgeschlossen“. Ohne die nötigen Daten ist der Zustand „nicht messbar“.
 * Die Art von ABCD-19 und ABCD-20 hängt von anderen Bedingungen ab und steht im Feld `kind` des Ergebnisses.
 */
import type { FormationContext } from './context';
import { closesBeyond, countTests, outward, probeFractal, wickEnd, type Rect, type ZoneSide } from './frz';
import {
  depthOk,
  dReached,
  entryIdxOf,
  extensionPrice,
  gapToRect,
  innerLevels,
  selectOrder,
  shapeOf,
  shortfall,
  timeframeExcluded,
  trendBreaksC,
  type AbcdPoint,
  type AbcdPoints,
  type AbcdShape,
} from './abcd';
import { levelPrice, legLength, type FibLeg } from './fib';
import { ABCD_PARAMS, BAT_PARAMS, CONTEXT_TIMEFRAMES, FRZ_PARAMS, GAR_PARAMS, HARMONIC_PARAMS, type ContextTimeframe } from './params';
import { emergencyStopOf, fibPrice, strongZoneAt, targetEnd } from './trade';
import { tradeStatusOf } from './tradeStatus';
import { abcdTrade, withTrade } from './tradeApply';
import type { TradeStatus } from './tradeStatus';
import { legDir, type TrendModel } from './trd';
import { abcdIsCdt } from './cdt';
import { evaluate as evaluateBat } from './batChecks';
import { evaluate as evaluateGar } from './garChecks';
import { buildEnv, buildEnvWithoutZones, dirSide, envFor, neighborTf, type Env } from './reasons';
import { reversalAt } from './reversal';
import { earlyReversalOf, type EarlyReversal } from './earlyReversal';
import { reentryOf } from './reentry';
import { enteredTrade, entryInHistory, hiddenOf, historyStart, pointsKey as shownPointsKey, recordShown, shownKeysOf, tradeAtOf, tradeKey } from './shownTrade';
import { cLegOf, lowerAbcdAt, lowerCandleAt, noPeakDivergence } from './cLeg';
import { exemptFor, settle } from './settle';
import { TIMEFRAME_SEC } from '@/lib/analysis/candles';
import { levelXA, ordered, pipOf, shapeOfX } from './xabcd';
import { divergenceOf, engulfZones, rsiExtreme, zoneSideOf } from './sig';
import { TRADE_RULES, type Trade, type Anchor, type Candidate, type Check, type CheckState, type Drawing, type FormationBar, type RuleKind, type RuleStatus, type Verdict } from './types';

const N = FRZ_PARAMS.neighbors;

/** Arbeitszähler der AB=CD-Suche (Arbeitsgrenze im Test, nicht Zeit): `full` = volle Kandidatenmessungen (`evaluateFull`) */
export const abcdWork = { full: 0 };

const RULES: Record<string, [RuleKind, RuleStatus]> = {
  'ABCD-01': ['required', 'confirmed'],
  'ABCD-02': ['required', 'assumption'],
  'ABCD-03': ['required', 'confirmed'],
  'ABCD-04': ['required', 'confirmed'],
  'ABCD-05': ['required', 'secondary'],
  'ABCD-06': ['required', 'confirmed'],
  'ABCD-07': ['required', 'confirmed'],
  'ABCD-08': ['required', 'assumption'],
  'ABCD-09': ['bonus', 'secondary'],
  'ABCD-10': ['required', 'confirmed'],
  'ABCD-11': ['required', 'assumption'],
  'ABCD-12': ['bonus', 'confirmed'],
  'ABCD-13': ['bonus', 'confirmed'],
  'ABCD-14': ['bonus', 'confirmed'],
  'ABCD-15': ['bonus', 'confirmed'],
  'ABCD-16': ['bonus', 'confirmed'],
  'ABCD-17': ['bonus', 'confirmed'],
  'ABCD-18': ['bonus', 'assumption'],
  'ABCD-19': ['bonus', 'confirmed'],
  'ABCD-20': ['bonus', 'confirmed'],
  'ABCD-21': ['exclusion', 'confirmed'],
  'ABCD-22': ['exclusion', 'confirmed'],
  'ABCD-23': ['exclusion', 'assumption'],
  'ABCD-24': ['exclusion', 'confirmed'],
  'ABCD-25': ['exclusion', 'confirmed'],
  'ABCD-26': ['exclusion', 'assumption'],
};

/** Bedingungen mit Prüfung, in der Reihenfolge des Regelwerks */
export const ABCD_CHECK_IDS: readonly string[] = Object.keys(RULES);

export interface AbcdPointsInput {
  tf: ContextTimeframe;
  /** Dochtspitzen: Öffnungszeit der Kerze und Preis */
  a: Anchor;
  b: Anchor;
  c: Anchor;
  /** Ohne Angabe: der äußerste Docht seit C */
  d?: Anchor;
}

export interface AbcdAnalysis {
  tf: ContextTimeframe;
  candidate: Candidate;
  /**
   * Nur wenn ein laufender Handel Vorrang hat (1122-A1.3): der Kandidat, den die Punktwahl ohne Vorrang gezeigt hätte.
   * Er ist verdeckt, solange der laufende Handel dauert (Messung im Verlaufsscan, keine Anzeige).
   */
  displaced?: Candidate;
}

const flag = (cond: boolean): CheckState => (cond ? 'met' : 'unmet');
const tri = (v: boolean | null): CheckState => (v === null ? 'unmeasurable' : flag(v));
const U: CheckState = 'unmeasurable';

const mk = (id: string, state: CheckState, value?: number, kind?: RuleKind): Check => {
  const [defaultKind, status] = RULES[id];
  return { id, kind: kind ?? defaultKind, status, state, ...(value === undefined ? {} : { value }), drawings: [] };
};

interface NearZone {
  rect: Rect;
  tf: ContextTimeframe;
  /** Tests der Fraktalzone vor der D-Kerze (ohne D selbst); Engulf-Zonen haben keine Zählung */
  testsBeforeD: number;
}

/** Urteil „nicht ungültig“ von Gartley und Bat je Umgebung und Form (Code + Form als Schlüssel): Level-Umfeld und Stop-Anker am Einstieg fragen dieselbe Form oft zweimal */
const harmonicHolds = new WeakMap<Env, Map<string, boolean>>();

/**
 * ABCD-16: Gartley oder Bat auf denselben A, B, C (X = Wendepunkt vor A), nicht ungültig, mit D-Ziel in der Zone Z-ABCD-04.
 * Toleranz der Zone: HARMONIC_PARAMS.touchPips (wie GAR-05). Gartley-D-Ziel: 0.786 von X → A (GAR-07);
 * Bat-D-Ziel: 0.886 von X → A (BAT-07). Ohne X nicht messbar.
 */
function harmonicD(env: Env, p: AbcdPoints, dInput: AbcdPoint | undefined, pip: number, zoneOf: () => [number, number]): CheckState {
  const { tf } = env;
  const { pivots } = env.trends.get(tf)!;
  const bars = env.views.get(tf)!.bars;
  const at = pivots.findIndex((q) => q.idx === p.a.idx);
  const x = at > 0 ? pivots[at - 1] : null;
  if (!x) return U;
  const s = shapeOfX(bars, { x: { idx: x.idx, price: x.price }, a: p.a, b: p.b, c: p.c }, dInput);
  if (!ordered(s)) return 'unmet';
  const zone = zoneOf();
  const tol = HARMONIC_PARAMS.touchPips * pip;
  const inZone = (price: number) => price >= zone[0] - tol && price <= zone[1] + tol;
  const gartley = inZone(levelXA(s, GAR_PARAMS.dAtX.level));
  const bat = inZone(levelXA(s, BAT_PARAMS.dLevel));
  let memo = harmonicHolds.get(env);
  if (!memo) harmonicHolds.set(env, (memo = new Map()));
  const known = memo;
  const holds = (hit: boolean, code: 'GAR' | 'BAT', evaluate: typeof evaluateGar) => {
    if (!hit) return false;
    const key = `${code}|${pip}|${JSON.stringify(s)}`;
    let ok = known.get(key);
    if (ok === undefined) known.set(key, (ok = evaluate(env, tf, s, pip).verdict !== 'invalid'));
    return ok;
  };
  return flag(holds(gartley, 'GAR', evaluateGar) || holds(bat, 'BAT', evaluateBat));
}

/** X der harmonischen Formation auf denselben A, B, C: der Wendepunkt vor A; null, wenn es keinen gibt */
function harmonicXOf(env: Env, p: AbcdPoints): number | null {
  const { pivots } = env.trends.get(env.tf)!;
  const at = pivots.findIndex((q) => q.idx === p.a.idx);
  return at > 0 ? pivots[at - 1].price : null;
}

/** Großes AB=CD-Ziel: Versatz A − X und Aktivierungspreis A */
interface BigTarget {
  offset: number;
  activation: number;
}

/** Stellt die Umgebung zum Zeitpunkt der Einstiegskerze her; der Aufrufer wertet dort das große Ziel aus */
type AtEntry = (entryTime: number) => Env | null;

export function evaluate(env: Env, p: AbcdPoints, dInput: AbcdPoint | undefined, pip: number, atEntry?: AtEntry): Candidate {
  return evaluateFull(env, p, dInput, pip, atEntry).candidate;
}

/**
 * Umfeld von Level 1: Nähe (ABCD_PARAMS.nearAtr × ATR am D bzw. an der letzten Kerze), innere Level (ABCD-09), zweite Level (ABCD-15) und
 * harmonisches D (ABCD-16) im Band zwischen Level 1 und dem nächsten zweiten Level. Gemeinsam für die Prüfung und die Rechnung am Einstieg.
 */
function levelContextOf(env: Env, p: AbcdPoints, s: AbcdShape, dInput: AbcdPoint | undefined, pip: number) {
  const { tf } = env;
  const view = env.views.get(tf)!;
  const last = view.bars.length - 1;
  const atr = view.atr[s.d ? s.d.idx : last] ?? null;
  const near = atr !== null ? ABCD_PARAMS.nearAtr * atr : null;
  const inner = innerLevels(env.trends.get(tf)!, s);
  const isNear = (level: number) => near !== null && Math.abs(level - s.level1) <= near;
  // zweites Level nahe Level 1 (ABCD-15): −0.272 von A → B, 0.618 einer größeren Gegenbewegung, innere Bewegung
  let second: number[] | undefined;
  const secondLevels = (): number[] => {
    if (second) return second;
    const higherTf = neighborTf(env, tf, -1);
    const bigLegs: FibLeg[] = [...env.fibs.get(tf)!.legs, ...(higherTf ? (env.fibs.get(higherTf)?.legs ?? []) : [])].filter(
      (leg) => (leg.dir === 'up') !== (s.es === 'resistance') && legLength(leg) > s.len,
    );
    return (second = [extensionPrice(s, ABCD_PARAMS.minExtension), ...bigLegs.map((leg) => levelPrice(leg, ABCD_PARAMS.confluenceLevel)), ...inner]);
  };
  let zoneMemo: [number, number] | undefined;
  const zone = (): [number, number] => {
    if (zoneMemo) return zoneMemo;
    const zonePrices = [s.level1, secondLevels().find(isNear) ?? extensionPrice(s, ABCD_PARAMS.minExtension)];
    return (zoneMemo = [Math.min(...zonePrices), Math.max(...zonePrices)]);
  };
  const harmonic: CheckState = near === null ? U : harmonicD(env, p, dInput, pip, zone);
  return { near, inner, isNear, secondLevels, zone, harmonic };
}

/** Stop eingefroren (HDL-14): `from` der Kerze, die Level 1 (mit Toleranz) zuerst erreicht; Divergenz und Harmonik gelten an dieser Kerze. Nur bei erreichtem D. */
function frozenAt(env: Env, p: AbcdPoints, s: AbcdShape, near: number | null, zone: () => [number, number], pip: number): { idx: number; from: AbcdPoint } {
  const bars = env.views.get(env.tf)!.bars;
  const k = entryIdxOf(bars, s)!;
  const dk: AbcdPoint = { idx: k, price: wickEnd(bars[k], s.es) };
  const divK = divergenceOf(env.trends.get(env.tf)!, s.es, s.b.idx, k);
  const divHolds = !!divK && divK.a.wave !== null && divK.b.wave !== null && divK.tie;
  const harmonicK = !divHolds && near !== null && harmonicD(env, p, dk, pip, zone) === 'met';
  return { idx: k, from: divHolds || harmonicK ? s.a : s.c };
}

/** 1114-A4.3: großes AB=CD-Ziel nur bei harmonischem D mit bekanntem X; Versatz = A − X (Kauf: nach oben, Verkauf: nach unten) */
function bigTargetOf(env: Env, p: AbcdPoints, s: AbcdShape, harmonic: CheckState): BigTarget | null {
  const xPrice = harmonic === 'met' ? harmonicXOf(env, p) : null;
  return xPrice === null ? null : { offset: s.a.price - xPrice, activation: s.a.price };
}

/**
 * Rechnung in der Einstiegsumgebung: großes Ziel und Stop-Anker, wie `evaluateFull` sie ohne `atEntry` liefert, ohne die übrigen Prüfungen
 * (Zonen, Signale, Erken dönüş, Wiedereinstieg, Zeichnungen hängen nicht daran; 1122-B5).
 */
function entryFactsOf(env: Env, p: AbcdPoints, dInput: AbcdPoint | undefined, pip: number): { big: BigTarget | null; frozenFrom: AbcdPoint | null } {
  const s = shapeOf(env.views.get(env.tf)!.bars, p, dInput);
  const { near, zone, harmonic } = levelContextOf(env, p, s, dInput, pip);
  const frozen = dReached(s) && s.d ? frozenAt(env, p, s, near, zone, pip) : null;
  return { big: bigTargetOf(env, p, s, harmonic), frozenFrom: frozen?.from ?? null };
}

/**
 * Einstiegskerze und eingefrorene Fakten des Handels (Halil 2026-11-16): Ob es das große Ziel gibt und von wo der Stop gemessen wird (A oder C),
 * entscheiden nur die Daten bis zur Einstiegskerze. Spätere Kerzen ändern X-Schluss (GAR-18), Zonen, innere Wendepunkte und Wave-Werte der
 * Divergenz; das darf einen offenen Handel nicht umdeuten. Eine Rechnung in der Einstiegsumgebung für beides. `entryBig` fehlt ohne diese Rechnung
 * (dann gilt das große Ziel der aktuellen Umgebung). `current` liefert das Umfeld von Level 1 der aktuellen Umgebung; gerechnet wird es nur,
 * wenn die Einstiegsumgebung keinen Stop-Anker gibt.
 */
function frozenFactsOf(
  env: Env,
  p: AbcdPoints,
  s: AbcdShape,
  dInput: AbcdPoint | undefined,
  pip: number,
  atEntry: AtEntry | undefined,
  current: () => { near: number | null; zone: () => [number, number] },
): { freezeIdx: number; frozenFrom: AbcdPoint | null; entryBig: BigTarget | null | undefined } {
  const { tf } = env;
  const bars = env.views.get(tf)!.bars;
  const last = bars.length - 1;
  const { d } = s;
  if (!dReached(s) || !d) return { freezeIdx: d ? d.idx : last, frozenFrom: null, entryBig: undefined };
  const freezeIdx = entryIdxOf(bars, s)!;
  let frozenFrom: AbcdPoint | null = null;
  let entryBig: BigTarget | null | undefined;
  if (atEntry && freezeIdx < last) {
    const entryEnv = atEntry(bars[freezeIdx].time);
    const entryBars = entryEnv?.views.get(tf)?.bars;
    if (entryEnv && entryBars && entryBars.length > freezeIdx) {
      const dk: AbcdPoint = { idx: freezeIdx, price: wickEnd(bars[freezeIdx], s.es) };
      const probeD = dInput && dInput.idx <= freezeIdx ? dInput : undefined;
      const entryD = dInput && !probeD ? dk : probeD;
      const atK = entryFactsOf(entryEnv, p, entryD, pip);
      entryBig = atK.big;
      frozenFrom = atK.frozenFrom;
    }
  }
  if (!frozenFrom) {
    const { near, zone } = current();
    frozenFrom = frozenAt(env, p, s, near, zone, pip).from;
  }
  return { freezeIdx, frozenFrom, entryBig };
}

/** Form-Bedingungen: hält eine nicht, trägt das Tripel keinen Handel (1126-A20.2, Regelbuch-Abnahmefall abcd-neg-h4-01) */
const FORM_IDS = ['ABCD-01', 'ABCD-02', 'ABCD-04', 'ABCD-05', 'ABCD-06'];

/**
 * ABCD-01, Trendbezug (1126-A13.2): AB ist ein Impuls im Trend der Zeiteinheit. Ist B ein Wendepunkt des Trendzugs (gleicher Index und Seite),
 * zählt dessen Art; sonst die Richtung von AB gegen die Trendrichtung.
 */
export function abIsImpulse(trend: TrendModel, s: AbcdShape): boolean {
  const pivot = trend.pivots.find((q) => q.idx === s.b.idx && q.side === s.es);
  if (pivot) return pivot.kind === 'impulse';
  return trend.dir !== null && legDir(s.es) === trend.dir;
}

/** ABCD-01, -02, -04, -05, -06 des Tripels `s` (dieselbe Messung wie in `evaluateFull`): wahr, wenn alle halten */
function formHolds(bars: readonly FormationBar[], s: AbcdShape, trend: TrendModel): boolean {
  const { es, cs } = s;
  const fractalDone = (idx: number, sideOf: typeof es) => {
    const probe = probeFractal(bars, idx, sideOf);
    return probe.leftBars === N && probe.rightBars === N && probe.beyond === 0;
  };
  const depth = s.depth ?? undefined;
  return (
    s.a.idx < s.b.idx &&
    s.b.idx < s.c.idx &&
    abIsImpulse(trend, s) &&
    s.a.price === wickEnd(bars[s.a.idx], cs) &&
    s.b.price === wickEnd(bars[s.b.idx], es) &&
    s.c.price === wickEnd(bars[s.c.idx], cs) &&
    fractalDone(s.b.idx, es) &&
    fractalDone(s.c.idx, cs) &&
    depth !== undefined &&
    depth >= ABCD_PARAMS.minCorrection &&
    depth <= 1 &&
    depth <= ABCD_PARAMS.maxCorrection
  );
}

/**
 * Nur der Handel eines Tripels für die Wahl in `analyzeAbcd` (ohne D-Eingabe): Seite, Punkte A bis D, Einstieg, Stop, Stand und Einstiegskerze,
 * dieselben Werte wie `evaluateFull`. Einstieg und Stand hängen nicht am Urteil, an Zonen, Signalen oder Zeichnungen, nur an der Form, der
 * Einstiegsumgebung (`frozenFactsOf`) und der ATR. Prüfliste, Zeichnungen und Urteil fehlen: nie anzeigen, für die Anzeige `evaluate` rechnen.
 */
export function tradeOnlyOf(env: Env, p: AbcdPoints, pip: number, atEntry: AtEntry, limit?: number): Candidate {
  const { tf } = env;
  const view = env.views.get(tf)!;
  const { bars } = view;
  // D friert am Ende des Handels ein (1124-A2.1): zweite Messung mit D bis zur Endkerze
  if (limit === undefined) {
    const first = tradeOnlyOf(env, p, pip, atEntry, bars.length - 1);
    const endIdx = first.trade?.status?.endIdx;
    return endIdx !== undefined && endIdx < bars.length - 1 ? tradeOnlyOf(env, p, pip, atEntry, endIdx) : first;
  }
  const s = shapeOf(bars, p, undefined, limit);
  const { d } = s;
  const points: Candidate['points'] = {
    A: { time: bars[s.a.idx].time, price: s.a.price },
    B: { time: bars[s.b.idx].time, price: s.b.price },
    C: { time: bars[s.c.idx].time, price: s.c.price },
  };
  if (d) points.D = { time: bars[d.idx].time, price: d.price };
  const bare: Candidate = { code: 'ABCD', side: s.side, tf, points, checks: [], drawings: [], verdict: 'forming' };
  if (!dReached(s) || !d || !formHolds(bars, s, env.trends.get(tf)!)) return bare;
  let level: ReturnType<typeof levelContextOf> | undefined;
  const current = () => (level ??= levelContextOf(env, p, s, undefined, pip));
  const { freezeIdx, frozenFrom, entryBig } = frozenFactsOf(env, p, s, undefined, pip, atEntry, current);
  const big = entryBig !== undefined ? entryBig : bigTargetOf(env, p, s, current().harmonic);
  const input = abcdTrade({ from: frozenFrom, frozenFrom, d, level1: s.level1, reached: true, missed: 0, targets: ABCD_PARAMS.targets, divergence: false, big, strongZone: false, reachedRule: 'ABCD-08' });
  if (input.entry === null || input.stop === null || !frozenFrom) return bare;
  const status = tradeStatusOf({
    bars,
    entryIdx: freezeIdx,
    side: s.side,
    entry: input.entry,
    stop: input.stop,
    emergencyStop: emergencyStopOf(input.stop, s.side, bars.length > 0 ? (view.atr[freezeIdx - 1] ?? null) : null),
    from: frozenFrom.price,
    targets: ABCD_PARAMS.targets,
    ...(big ? { big } : {}),
  });
  const trade = { entry: input.entry, stop: input.stop, emergencyStop: null, tp1: null, reason: {}, sig29: null, status, entryIdx: freezeIdx } as unknown as Trade;
  return { ...bare, trade };
}

function evaluateFull(
  env: Env,
  p: AbcdPoints,
  dInput: AbcdPoint | undefined,
  pip: number,
  atEntry?: AtEntry,
  limit?: number,
): { candidate: Candidate; big: BigTarget | null; frozenFrom: AbcdPoint | null } {
  // D friert am Ende des Handels ein (1124-A2.1): zweite Messung mit D bis zur Endkerze; eigene Punkte mit D bleiben unberührt
  if (limit === undefined && dInput === undefined) {
    const nBars = env.views.get(env.tf)!.bars.length;
    const first = evaluateFull(env, p, dInput, pip, atEntry, nBars - 1);
    const endIdx = first.candidate.trade?.status?.endIdx;
    return endIdx !== undefined && endIdx < nBars - 1 ? evaluateFull(env, p, dInput, pip, atEntry, endIdx) : first;
  }
  abcdWork.full++;
  const { tf } = env;
  const view = env.views.get(tf)!;
  const trend = env.trends.get(tf)!;
  const { bars } = view;
  const last = bars.length - 1;
  const s = shapeOf(bars, p, dInput, limit);
  const { es, cs, side, d } = s;
  const checks: Check[] = [];
  const add = (id: string, state: CheckState, value?: number, kind?: RuleKind) => checks.push(mk(id, state, value, kind));

  // Form
  const fractalDone = (idx: number, sideOf: typeof es) => {
    const probe = probeFractal(bars, idx, sideOf);
    return probe.leftBars === N && probe.rightBars === N && probe.beyond === 0;
  };
  add(
    'ABCD-01',
    flag(
      s.a.idx < s.b.idx &&
        s.b.idx < s.c.idx &&
        abIsImpulse(trend, s) &&
        s.a.price === wickEnd(bars[s.a.idx], cs) &&
        s.b.price === wickEnd(bars[s.b.idx], es) &&
        s.c.price === wickEnd(bars[s.c.idx], cs),
    ),
  );
  add('ABCD-02', flag(fractalDone(s.b.idx, es) && fractalDone(s.c.idx, cs)));
  let beyondB = false;
  for (let k = s.c.idx + 1; k <= last; k++) if (closesBeyond(bars[k], s.b.price, es)) beyondB = true;
  add('ABCD-03', flag(beyondB));
  const depth = s.depth ?? undefined;
  add('ABCD-04', flag(depth !== undefined && depth >= ABCD_PARAMS.minCorrection), depth);
  add('ABCD-05', flag(depth !== undefined && depth <= 1), depth);
  add('ABCD-06', flag(depth !== undefined && depth <= ABCD_PARAMS.maxCorrection), depth);
  add('ABCD-07', flag(!!d && outward(es, d.price) >= outward(es, s.level1)), shortfall(s) ?? undefined);
  const reached = dReached(s);
  add('ABCD-08', flag(reached), shortfall(s) ?? undefined);

  // Ort und Kontext (gemessen an Level 1)
  const level = levelContextOf(env, p, s, dInput, pip);
  const { near, inner, isNear, harmonic } = level;
  const secondLevels = level.secondLevels();
  const tradeZone = zoneSideOf(side);
  const nearZones: NearZone[] = [];
  // Die Zone, die erst das D selbst bildet (fertiges Fraktal am D), zählt nicht als Ort des D (Zirkelschluss)
  const dTime = d ? bars[d.idx].time : Infinity;
  const testsBefore = (z: { rect: Rect; fractalTimes: number[] }): number => {
    if (!d) return 0;
    const lastFractal = Math.max(...z.fractalTimes.map((ft) => bars.findIndex((b) => b.time === ft)));
    return countTests(bars, tradeZone, z.rect, lastFractal + N + 1, d.idx - 1, () => false, []);
  };
  if (near !== null) {
    for (const z of [...env.frz.zones, ...env.frz.reversed]) {
      const formedByD = z.fractalTimes.every((ft) => ft >= dTime);
      if (z.side === tradeZone && !formedByD && gapToRect(z.rect, s.level1) <= near) {
        nearZones.push({ rect: z.rect, tf: z.tf, testsBeforeD: testsBefore(z) });
      }
    }
    for (const z of engulfZones(bars, view.wide)) {
      const formedByD = d !== null && z.idx >= d.idx;
      if (z.holds && z.side === side && !formedByD && gapToRect(z.rect, s.level1) <= near) {
        nearZones.push({ rect: z.rect, tf, testsBeforeD: 0 });
      }
    }
  }
  const higherTf = neighborTf(env, tf, -1);
  const lowerTf = neighborTf(env, tf, 1);

  add('ABCD-09', near === null ? U : flag(inner.some(isNear)));

  const confluent = secondLevels.filter(isNear);
  const hasConfluence = confluent.length > 0;

  add('ABCD-10', near === null ? U : flag(nearZones.length > 0 || hasConfluence));
  add('ABCD-11', near === null ? U : 'met', near ?? undefined);
  const tfRank = CONTEXT_TIMEFRAMES.indexOf(tf);
  const isHigher = (x: ContextTimeframe) => CONTEXT_TIMEFRAMES.indexOf(x) < tfRank || x === CONTEXT_TIMEFRAMES[0];
  const higherZones = nearZones.filter((z) => isHigher(z.tf));
  const higherLoaded = CONTEXT_TIMEFRAMES.some((x) => CONTEXT_TIMEFRAMES.indexOf(x) < tfRank && env.views.has(x));
  const noHigherContext = !higherLoaded && tf !== CONTEXT_TIMEFRAMES[0];
  if (near === null || (higherZones.length === 0 && noHigherContext)) add('ABCD-12', U);
  else add('ABCD-12', flag(higherZones.length > 0));
  add('ABCD-13', nearZones.length === 0 ? U : flag(nearZones.every((z) => z.testsBeforeD === 0)));
  const higherDir = higherTf ? (env.trends.get(higherTf)?.dir ?? null) : null;
  const withTrend = higherDir ? dirSide(higherDir) === side : null;
  add('ABCD-14', tri(withTrend));
  add('ABCD-15', near === null ? U : flag(hasConfluence), confluent.length);
  add('ABCD-16', harmonic);

  // Signal am D
  const rsiD = d ? (view.rsi[d.idx] ?? null) : null;
  const rsi17 = rsiD === null ? null : rsiExtreme(rsiD, side);
  const nearExtreme = (value: number) => (side === 'sell' ? value >= ABCD_PARAMS.rsiNear.sell : value <= ABCD_PARAMS.rsiNear.buy);
  const rsi18 = rsiD === null ? null : nearExtreme(rsiD);
  add('ABCD-17', tri(rsi17), rsiD ?? undefined);
  add('ABCD-18', tri(rsi18), rsiD ?? undefined);
  const div = d ? divergenceOf(trend, es, s.b.idx, d.idx) : null;
  const divState: CheckState = !div || div.a.wave === null || div.b.wave === null ? U : flag(div.tie);
  const counter = withTrend === null ? null : !withTrend;
  add('ABCD-19', divState, undefined, counter === true ? 'required' : 'bonus');
  const reversal: CheckState = d ? reversalAt(env, tf, side, d, lowerTf ? [tf, lowerTf] : [tf]) : U;
  const noRsi = checks.find((c) => c.id === 'ABCD-17')!.state === 'unmet' && checks.find((c) => c.id === 'ABCD-18')!.state === 'unmet';
  add('ABCD-20', reversal, undefined, noRsi ? 'required' : 'bonus');

  // Ausschluss
  if (counter === null) add('ABCD-21', U);
  else if (!counter) add('ABCD-21', 'unmet');
  else add('ABCD-21', divState === U ? U : flag(divState !== 'met'));
  // Eine Zone, durch die der Kurs schon geschlossen hat, wechselt die Rolle (FRZ-35): sie steht dann bei den gedrehten Zonen
  const broken: NearZone[] = [];
  if (near !== null) {
    for (const z of env.frz.reversed) {
      if (z.side !== tradeZone && gapToRect(z.rect, s.level1) <= near) broken.push({ rect: z.rect, tf: z.tf, testsBeforeD: 0 });
    }
  }
  const zonesAtD = [...nearZones, ...broken];
  if (!d || zonesAtD.length === 0) {
    add('ABCD-22', U);
  } else {
    const closedBeyond = zonesAtD.some((z) => {
      for (let k = d.idx; k <= last; k++) {
        if (side === 'sell' ? bars[k].close > z.rect.top : bars[k].close < z.rect.bottom) return true;
      }
      return false;
    });
    add('ABCD-22', flag(closedBeyond));
  }
  if (!d) {
    add('ABCD-23', U);
  } else {
    const flags = view.wide.slice(s.c.idx + 1, d.idx + 1);
    let strong = 0;
    let nNarrow = 0;
    for (let k = s.c.idx + 1; k <= d.idx; k++) {
      const toward = es === 'resistance' ? bars[k].close > bars[k].open : bars[k].close < bars[k].open;
      if (view.wide[k] === true && toward) strong++;
      if (view.narrow[k] === true) nNarrow++;
    }
    // Decision 1126-A20.2.1.1 (Halil, 2026-11-27, Option C): das D-Bein ist impulsiv wie in SIG-37 (mehr volumenstarke als schmale Kerzen), mit Untergrenze wideBars
    add('ABCD-23', flags.every((w) => w === null) ? U : flag(strong >= ABCD_PARAMS.wideBars && strong > nNarrow), strong);
  }
  add('ABCD-24', abcdIsCdt(env, tf, es, s.b, s.d));
  add('ABCD-25', flag(timeframeExcluded(tf)));

  // Ziel-Fib wie Z-ABCD-05 vor dem Einstieg: ab A bei Divergenz oder Harmonik, sonst ab C (danach `targetFrom`)
  const from = divState === 'met' || harmonic === 'met' ? s.a : s.c;
  const facts = frozenFactsOf(env, p, s, dInput, pip, atEntry, () => level);
  const { frozenFrom, freezeIdx } = facts;
  // Decision 1120-A35.1: nach dem Einstieg läuft die Ziel-Fib (TP1, TP2, TP3, Stand, Z-ABCD-05) ab dem eingefrorenen `from` der Einstiegskerze;
  // eine spätere Divergenz oder Harmonik am weitergelaufenen D ändert den Start nicht mehr. Vor dem Einstieg gilt das aktuelle `from`.
  const targetFrom = frozenFrom ?? from;
  // ABCD-26 nach der Einstiegskerze: ein Bruch von C ab dem Einstieg ist der Weg zum Ziel
  add('ABCD-26', flag(trendBreaksC(trend, s, reached && d ? freezeIdx : null)));
  const stateOf = (id: string) => checks.find((c) => c.id === id)!.state;
  // ABCD-03 und ABCD-08 warten auf den Endpunkt (im Aufbau); ABCD-07 (streng) ist durch die Toleranz von ABCD-08 ersetzt.
  // Die übrigen Pflichten zählen nur, solange kein Endpunkt wartet.
  const waiting = stateOf('ABCD-03') === 'unmet' || stateOf('ABCD-08') === 'unmet';
  const causesInvalid = (c: Check) =>
    (['ABCD-21', 'ABCD-22', 'ABCD-23', 'ABCD-24', 'ABCD-25', 'ABCD-26'].includes(c.id) && c.state === 'met') ||
    (['ABCD-01', 'ABCD-02', 'ABCD-04', 'ABCD-05', 'ABCD-06'].includes(c.id) && c.state === 'unmet') ||
    (!waiting && c.kind === 'required' && c.state === 'unmet' && c.id !== 'ABCD-07');
  const invalidBy = checks.filter(causesInvalid).map((c) => c.id);
  // Gleitkomma-Rauschen (Docht genau auf Level 1) zählt nicht als verfehlt
  const gap = d ? Math.max(0, outward(es, s.level1) - outward(es, d.price)) : 0;
  const missed = gap > 1e-9 * s.len ? gap : 0;
  // A4.2.8: sehr starke Zone der Gegenseite am TP1 des Einstiegs (nur Hinweis)
  const tp1Entry = frozenFrom ? fibPrice(frozenFrom.price, s.level1, ABCD_PARAMS.targets.tp1) : null;
  const strongZone = tp1Entry !== null && strongZoneAt([...env.frz.zones, ...env.frz.reversed], tp1Entry, side);
  // 1114-A4.5: Erken dönüş. Das Urteil bleibt „im Aufbau“; ein ungültiger Kandidat bekommt ihn nicht
  const lowerView = lowerTf ? env.views.get(lowerTf) : undefined;
  const early =
    invalidBy.length === 0 && !reached && d
      ? earlyReversalOf({
          bars,
          wide: view.wide,
          s,
          reached,
          zones: [...env.frz.zones, ...env.frz.reversed],
          engulfZones: engulfZones(bars, view.wide),
          sec: TIMEFRAME_SEC[tf],
          // 1119-A35.1.1: der Engulf wird wie bei ABCD-20 auch in der nächstkleineren Zeiteinheit gesucht (SIG-28)
          ...(lowerView && lowerTf ? { lower: { bars: lowerView.bars, wide: lowerView.wide, sec: TIMEFRAME_SEC[lowerTf] } } : {}),
        })
      : null;
  const big = facts.entryBig !== undefined ? facts.entryBig : bigTargetOf(env, p, s, harmonic);
  const input = abcdTrade({
    from: targetFrom,
    frozenFrom,
    d: d ?? null,
    level1: s.level1,
    reached,
    missed,
    targets: ABCD_PARAMS.targets,
    divergence: divState === 'met',
    big,
    strongZone,
    reachedRule: 'ABCD-08',
  });
  // 1120-A14.2: Ziel am Einstieg festgelegt, harmonisches D (ABCD-16) heute nicht mehr erfüllt → nur Hinweis
  if (big && harmonic !== 'met') input.tpBigHarmonicBroken = true;
  if (early) {
    // Kein Fibo-Ziel, kein Anteil, kein Stand nach dem Einstieg (A4.5.3)
    input.entry = early.entry;
    input.stop = early.stop;
    input.tp1 = early.target1;
    input.reason = early.target1 === null ? { tp1: 'noZone' } : {};
    input.earlyReversal = { target2: early.target2, gap: early.gap };
    input.entryAtrIdx = early.lower ? early.idx - 1 : early.idx;
  }
  // 1114-A4.2 b: Stand nach dem Einstieg; der Not-SL ist derselbe wie im Handelsblock (Schluss-Stop ± ATR(14))
  // Nach dem Einstieg zählt die ATR, die beim Einstieg bekannt war (die Vergangenheit ändert sich nicht): ein Einstieg in der Kerze (Level 1, Berührung)
  // kennt nur die ATR der Kerze davor; der Schluss einer Kerze (Engulf der Formations-Zeiteinheit) kennt die der Kerze selbst
  const atrAt = (i: number) => (bars.length > 0 ? (view.atr[i] ?? null) : null);
  const atrNow = atrAt(last);
  const status =
    !early && reached && d && input.entry !== null && input.stop !== null
      ? tradeStatusOf({
          bars,
          entryIdx: freezeIdx,
          side,
          entry: input.entry,
          stop: input.stop,
          emergencyStop: emergencyStopOf(input.stop, side, atrAt(freezeIdx - 1)),
          from: targetFrom.price,
          targets: ABCD_PARAMS.targets,
          ...(big ? { big } : {}),
        })
      : null;
  if (status) {
    input.status = status;
    input.entryAtrIdx = freezeIdx - 1;
  }
  // 1114-A4.4: Wiedereinstieg in die Engulf-Zone am D nach TP1 und TP2 (oder nur der Hinweis nach TP1); der erste Handel bleibt unberührt
  const reentry =
    status && d && status.tp1Fill !== undefined
      ? reentryOf({ bars, side, dIdx: d.idx, entryIdx: freezeIdx, status, diagKey: `${s.side}|${bars[s.a.idx]?.time}|${bars[s.b.idx]?.time}|${bars[s.c.idx]?.time}`, engulfZones: engulfZones(bars, view.wide), zones: [...env.frz.zones, ...env.frz.reversed] })
      : null;
  if (reentry?.kind === 'reentry') {
    input.reentry = { entry: reentry.entry, stop: reentry.stop, emergencyStop: emergencyStopOf(reentry.stop, side, atrAt(reentry.idx - 1)), target: reentry.target, target2: reentry.target2 };
  } else if (reentry?.kind === 'tp1Only') {
    input.reentryTp1Only = true;
  }
  // C-Bein (2026-11-16): vor Level 1 ein Handel von C Richtung D, gegen den AB=CD-Handel; nur der Handelsblock zeigt es, Prüfliste und Urteil bleiben
  if (!reached && !early) {
    const cLeg = cLegOf({
      bars,
      s,
      reached,
      early: false,
      withTrend,
      noDivergence: noPeakDivergence(trend, s),
      engulfZones: engulfZones(bars, view.wide),
      zones: [...env.frz.zones, ...env.frz.reversed],
      candle: lowerCandleAt(env, tf, s),
      lowerAbcd: lowerAbcdAt(env, tf, s),
      atr: atrNow,
    });
    if (cLeg) input.cLeg = cLeg;
  }
  const drawings = drawingsOf(env, s, reached, divState === 'met', targetFrom, secondLevels.find(isNear), input.stop, freezeIdx, status, early, input.tpBig ?? null, early ? null : input.entry);
  const withDrawings = checks.map((c) => ({
    ...c,
    drawings: [...new Set(drawings.filter((x) => x.rules.includes(c.id)).map((x) => x.id))],
  }));

  let verdict: Verdict = 'valid';
  if (invalidBy.length > 0) verdict = 'invalid';
  else if (waiting) verdict = 'forming';
  verdict = settle(verdict, withDrawings, exemptFor('ABCD', withDrawings));

  const points: Candidate['points'] = {
    A: { time: bars[s.a.idx].time, price: s.a.price },
    B: { time: bars[s.b.idx].time, price: s.b.price },
    C: { time: bars[s.c.idx].time, price: s.c.price },
  };
  if (d) points.D = { time: bars[d.idx].time, price: d.price };
  const candidate: Candidate = { code: 'ABCD', side, tf, points, checks: withDrawings, drawings, verdict, invalidBy };
  // 1126-A20.2: hält eine Form-Bedingung nicht, gibt es keinen Handel; Prüfliste, Urteil und die Zeichnungen der Form bleiben
  if (checks.some((c) => FORM_IDS.includes(c.id) && c.state === 'unmet')) {
    candidate.drawings = candidate.drawings.filter((x) => x.rules !== TRADE_RULES);
    return { candidate, big, frozenFrom };
  }
  const traded = withTrade(candidate, env, tf, input, false);
  // Einstiegskerze für den Vorrang laufender Handel in `analyzeAbcd` (1122-A1.3)
  if (status && traded.trade) traded.trade = { ...traded.trade, entryIdx: freezeIdx };
  return { candidate: traded, big, frozenFrom };
}

function drawingsOf(env: Env, s: AbcdShape, reached: boolean, divergence: boolean, from: AbcdPoint, second: number | undefined, stop: number | null, freezeIdx: number, status: TradeStatus | null, early: EarlyReversal | null, bigTarget: number | null, entry: number | null): Drawing[] {
  const bars = env.views.get(env.tf)!.bars;
  const at = (idx: number, price: number): Anchor => ({ time: bars[idx].time, price });
  const lastTime = bars[bars.length - 1].time;
  const ids = (list: number[]) => list.map((n) => `ABCD-${String(n).padStart(2, '0')}`);
  const { side } = s;
  const zig = [at(s.a.idx, s.a.price), at(s.b.idx, s.b.price), at(s.c.idx, s.c.price)];
  if (s.d && reached) zig.push(at(s.d.idx, s.d.price));
  const ext = extensionPrice(s, ABCD_PARAMS.minExtension);
  const secondPrice = second ?? ext;
  const out: Drawing[] = [
    { id: 'Z-ABCD-01', tool: 'zigzag', anchors: zig, rules: ids([1, 2, 3]), side },
    { id: 'Z-ABCD-02', tool: 'hline', anchors: [at(s.b.idx, s.level1)], levels: [1], rules: ids([7, 8]), side },
    {
      id: 'Z-ABCD-03',
      tool: 'fib',
      anchors: [at(s.a.idx, s.a.price), at(s.b.idx, s.b.price)],
      levels: [ABCD_PARAMS.minCorrection, -ABCD_PARAMS.minExtension],
      rules: ids([4, 6]),
      side,
    },
    {
      id: 'Z-ABCD-04',
      tool: 'zone',
      anchors: [at(s.c.idx, Math.min(s.level1, secondPrice)), { time: lastTime, price: Math.max(s.level1, secondPrice) }],
      rules: ids([9, 15, 16]),
      side,
    },
    { id: 'Z-ABCD-06', tool: 'label', anchors: [{ time: lastTime, price: s.level1 }], rules: ids([7]), side },
  ];
  if (s.d && reached) {
    // Start der Ziel-Fib: A bei Divergenz oder Harmonik, sonst C; nach dem Einstieg eingefroren (1120-A35.1)
    const levels = [ABCD_PARAMS.targets.tp1, ABCD_PARAMS.targets.tp2, ...(divergence ? [ABCD_PARAMS.targets.divergence] : [])];
    // Ende höchstens am Stop wie TP1/TP2 im Handel (1121-A14.1); der Punkt D bleibt am Docht
    out.push({ id: 'Z-ABCD-05', tool: 'fib', anchors: [at(from.idx, from.price), at(s.d.idx, targetEnd(from.price, s.d.price, stop))], levels, rules: TRADE_RULES, side });
    // Der Stop ist eingefroren und steht als eigene Linie (nicht mehr als Level der mitlaufenden Ziel-Fib)
    // Nach TP1 steht der Stop auf dem Einstieg: Linie ab der TP1-Kerze (1114-A4.2 b)
    if (stop !== null) {
      const moved = status?.stopMovedIdx;
      const shown = status && moved !== undefined ? status.stopNow : stop;
      out.push({ id: 'Z-ABCD-07', tool: 'hline', anchors: [at(moved ?? freezeIdx, shown)], rules: TRADE_RULES, side });
      out.push({ id: 'Z-ABCD-08', tool: 'label', anchors: [{ time: lastTime, price: shown }], label: 'stop', rules: TRADE_RULES, side });
    }
  }
  // 1124-F2.6: Einstiegslinie ab der Einstiegskerze mit Beschriftung (blau); der Einstieg liegt an Level 1
  if (s.d && reached && entry !== null) {
    out.push({ id: 'Z-ABCD-11', tool: 'hline', anchors: [at(freezeIdx, entry)], label: 'entry', rules: TRADE_RULES, side });
    out.push({ id: 'Z-ABCD-12', tool: 'label', anchors: [{ time: lastTime, price: entry }], label: 'entry', rules: TRADE_RULES, side });
  }
  // 1114-A4.3: großes AB=CD-Ziel als eine Linie mit Beschriftung (läuft mit dem äußersten Docht wie die Ziel-Fib)
  if (s.d && reached && bigTarget !== null) {
    out.push({ id: 'Z-ABCD-09', tool: 'hline', anchors: [at(freezeIdx, bigTarget)], rules: TRADE_RULES, side });
    out.push({ id: 'Z-ABCD-10', tool: 'label', anchors: [{ time: lastTime, price: bigTarget }], label: 'bigTarget', rules: TRADE_RULES, side });
  }
  // Erken dönüş: der Stop (ferne Zonenkante) steht auf Z-ABCD-07/08 ab der Engulf-Kerze
  if (early && !reached) {
    out.push({ id: 'Z-ABCD-07', tool: 'hline', anchors: [at(early.idx, early.stop)], rules: TRADE_RULES, side });
    out.push({ id: 'Z-ABCD-08', tool: 'label', anchors: [{ time: lastTime, price: early.stop }], label: 'stop', rules: TRADE_RULES, side });
  }
  return out;
}

function unmeasurable(tf: ContextTimeframe): Candidate {
  const checks = ABCD_CHECK_IDS.map((id) => mk(id, U));
  return { code: 'ABCD', side: 'buy', tf, points: {}, checks, drawings: [], verdict: 'forming' };
}

/** Umgebung zum Ende der Einstiegskerze (Schlusszeit = Beginn + Dauer der Zeiteinheit) für das eingefrorene große Ziel */
export function entryEnvOf(ctx: FormationContext, tf: ContextTimeframe): AtEntry {
  // Ohne Zonen (1122-A41.1): am Einstieg zählen nur das große Ziel und der Stop-Anker (A oder C); beide hängen an Divergenz und harmonischem D
  // (Urteil von Gartley/Bat, deren Zonenzeilen nur Bonus sind), nicht an Zonen. Wie `tradeAtOf`: in einer Suche einmal je Zeitpunkt gerechnet
  return (entryTime) => buildEnvWithoutZones(ctx, entryTime + TIMEFRAME_SEC[tf], tf);
}

/**
 * Basen ohne Vorrang je Kontext (`${tf}|A|B|C` → Öffnungszeit der Kerze, ab der sie ausscheiden): beendeter Handel (ab der Kerze nach dem Ende)
 * oder beim Einstieg nicht gezeigt (ab der Kerze nach dem Einstieg). Beides hängt nur von Kerzen bis dahin ab und ändert sich danach nicht;
 * frühere Zeiten rechnen weiter voll. Spart die Neubewertung alter Basen in jedem Scan.
 */
const noPriority = new WeakMap<FormationContext, Map<string, number>>();

/**
 * Beendete Handel je Kontext: Handels-Schlüssel (`tradeKey`) → Punkte (`pointsKey` aus shownTrade.ts) und Öffnungszeit der Endkerze. Das Ende
 * hängt nur von Kerzen bis dahin ab; eine Suche zählt nur Enden vor ihrer letzten Kerze (kein Blick in die Zukunft).
 */
const endedTradesStore = new WeakMap<FormationContext, Map<string, { points: string; stop: number | null; endTime: number }[]>>();

/** Schlüsselraum der AB=CD-Suche in den gezeigten Handeln je Kontext (`shownKeysOf`) */
const ABCD_SCOPE = {};

/**
 * Frühere C eines Tripels: Dochtspitzen auf der Seite von C zwischen B und dem jetzigen C mit gültiger Korrekturtiefe (1122-A1.4 c).
 * War eine davon beim Einstieg das C der Wahl, hat der Trend den Wendepunkt danach auf das jetzige C gerückt.
 */
function earlierCs(bars: readonly FormationBar[], p: AbcdPoints): AbcdPoints[] {
  const cSide: ZoneSide = p.b.price > p.a.price ? 'support' : 'resistance';
  const out: AbcdPoints[] = [];
  for (let k = p.b.idx + 1; k < p.c.idx; k++) {
    const price = wickEnd(bars[k], cSide);
    const tip = (j: number) => j > p.b.idx && j < p.c.idx && outward(cSide, wickEnd(bars[j], cSide)) >= outward(cSide, price);
    if (tip(k - 1) || tip(k + 1)) continue;
    const q = { a: p.a, b: p.b, c: { idx: k, price } };
    if (depthOk(q)) out.push(q);
  }
  return out;
}

/**
 * 1123-A (Entscheidung b1, Halil 2026-11-23): ein beendeter Handel, dessen D-Bein weiter als `ABCD_PARAMS.maxCdAb` × AB läuft, hat die
 * Proportion verloren; das AB=CD wird nicht mehr gewählt. Gemessen erst nach der Endkerze (das Ende zeigt sich einmal, 1120-A42.1); ein
 * laufender Handel ist nie betroffen (Vorrang 1122-A1.3). Vor dem Einstieg kann D nicht über Level 1 hinaus sein (Einstieg an Level 1).
 */
function proportionLost(c: Candidate, last: number, bars: readonly FormationBar[], p: AbcdPoints | undefined): boolean {
  const endIdx = c.trade?.status?.endIdx;
  const { A, B } = c.points;
  // 1123-A und 1126-A20.2: ohne Handel (Form verfehlt) gilt die Oberlinie sofort. Ein Tripel mit gültiger Form und ohne Einstieg hat D höchstens an Level 1 (CD ≤ AB), die Regel löst dort nie aus
  if (endIdx === undefined ? c.trade !== undefined : endIdx >= last) return false;
  if (!A || !B || !p) return false;
  // Gemessen am äußersten Docht bis zur letzten Kerze, nicht am eingefrorenen D des Handels (1124-A2.1): die Regel misst, wie weit das D-Bein weiterlief
  const d = shapeOf(bars, p).d;
  if (!d) return false;
  const ab = Math.abs(B.price - A.price);
  return ab > 0 && Math.abs(d.price - p.c.price) > ABCD_PARAMS.maxCdAb * ab;
}

/**
 * Sucht je geladener Zeiteinheit (hoch → tief) die Punkte A, B, C in der Reihenfolge von `selectOrder` und misst D.
 * Ein beendeter Handel mit verlorener Proportion (`proportionLost`, 1123-A) wird nicht mehr gewählt; es gilt die nächste in der Reihenfolge.
 * Ein eingegangener Handel, der zum Schluss seiner Einstiegskerze nicht gezeigt war, wird nie gezeigt: trägt die Wahl einen solchen Handel, gilt die
 * nächste in der Reihenfolge ohne ihn (1122-A1.4 b, wie 1122-A3.2 der Harmoniken). „Gezeigt“ ist das Ergebnis dieser Suche zu jenem Schluss (nach
 * Auslassen und Vorrang, `shownTrade.ts`); die Identität des Handels hat keine Wendepunkte (1122-A1.4 c).
 * Vorrang hat ein eingegangener Handel, der vor der letzten Kerze einging, noch läuft oder in der letzten Kerze endet und nicht verborgen ist. So fällt
 * er erst nach seinem Ende weg und zeigt sein Ende einmal (1122-A1.3 = Regel 1121-A1.3 der Harmoniken, Entscheidung 1120-A42.1). Gesucht wird unter
 * allen drei aufeinanderfolgenden Wendepunkten und ihren früheren C (`earlierCs`: das C beim Einstieg, wenn der Trend den Wendepunkt danach rückt),
 * deren Einstieg im Verlaufsfenster liegt (`HISTORY_DAYS`, 1122-A1.4 a); die Suche endet bei einem C, das ein weiteres Fenster davor liegt.
 * Unter mehreren gilt der zuerst eingegangene, bei gleicher Einstiegskerze der jüngste.
 */
export function analyzeAbcd(ctx: FormationContext, t: number): AbcdAnalysis[] {
  const tfs = ctx.timeframes();
  const base = tfs.length > 0 ? buildEnv(ctx, t, tfs[0]) : null;
  if (!base) return [];
  const pip = pipOf(ctx.symbol);
  const keys = shownKeysOf(ctx, ABCD_SCOPE);
  let skipMap = noPriority.get(ctx);
  if (!skipMap) noPriority.set(ctx, (skipMap = new Map()));
  const skip = skipMap;
  let endedTrades = endedTradesStore.get(ctx);
  if (!endedTrades) endedTradesStore.set(ctx, (endedTrades = new Map()));
  const endedOf = endedTrades;

  /** Gezeigter Kandidat der Zeiteinheit zum Zeitpunkt `at` und die Wahl ohne Vorrang; merkt sich den gezeigten Handel */
  const search = (env: Env, tf: ContextTimeframe, at: number, full: boolean): { shown: Candidate | null; picked: Candidate | null } => {
    const pivots = env.trends.get(tf)!.pivots;
    const bars = env.views.get(tf)!.bars;
    const order = selectOrder(pivots);
    if (order.length === 0) {
      recordShown(keys, tf, bars, null);
      return { shown: null, picked: null };
    }
    const atEntry = entryEnvOf(ctx, tf);
    const last = bars.length - 1;
    const pointsKey = (p: AbcdPoints) => `${tf}|${bars[p.a.idx].time}|${bars[p.b.idx].time}|${bars[p.c.idx].time}`;
    // je Tripel einmal gemessen; für die Wahl genügt der Handel (`tradeOnlyOf`), voll gemessen wird nur das Ergebnis
    const measured = new Map<string, Candidate>();
    const pointsOf = new Map<Candidate, AbcdPoints>();
    const candidateFor = (p: AbcdPoints) => {
      const key = pointsKey(p);
      let c = measured.get(key);
      if (!c) {
        measured.set(key, (c = tradeOnlyOf(env, p, pip, atEntry)));
        pointsOf.set(c, p);
        noteEnded(c);
      }
      return c;
    };
    // beendeter Handel: Schlüssel, Punkte und Endzeit für die Hayalet-Prüfung
    const noteEnded = (c: Candidate) => {
      const endIdx = c.trade?.status?.endIdx;
      if (!enteredTrade(c) || endIdx === undefined) return;
      const k = tradeKey(c, bars)!;
      const e = { points: shownPointsKey(c), stop: c.trade!.stop ?? null, endTime: bars[endIdx].time };
      const list = endedOf.get(k) ?? [];
      if (!list.some((x) => x.points === e.points && x.endTime === e.endTime)) endedOf.set(k, [...list, e]);
    };
    const hidden = hiddenOf(tf, bars, tradeAt);
    // Hayalet (1120-A42.1, wie bei den Harmoniken): derselbe Handel mit anderen Punkten, nachdem der beim Einstieg gezeigte vor der letzten Kerze
    // endete. Die Identität hat keine Wendepunkte (1122-A1.4 c), also ließe Regel B ihn durch; er käme mit anderem Stand wieder.
    const ghost = (c: Candidate): boolean => {
      const list = enteredTrade(c) && c.trade!.entryIdx! < last ? endedOf.get(tradeKey(c, bars)!) : undefined;
      if (!list) return false;
      const atEntryPoints = tradeAt(tf, bars[c.trade!.entryIdx!].time + TIMEFRAME_SEC[tf]).points;
      // derselbe Ausgang (gleicher Stop, gleiche Endkerze) mit verschobenem Wendepunkt ist derselbe Handel (1122-A1.4 c)
      const endIdx = c.trade!.status!.endIdx;
      const sameOutcome = (e: { stop: number | null; endTime: number }) => c.trade!.stop === e.stop && endIdx !== undefined && bars[endIdx].time === e.endTime;
      return atEntryPoints !== shownPointsKey(c) && list.some((e) => e.points === atEntryPoints && e.endTime < bars[last].time && !sameOutcome(e));
    };
    let picked: Candidate | null = null;
    for (const p of order) {
      const c = candidateFor(p);
      if (!hidden(c) && !proportionLost(c, last, bars, pointsOf.get(c))) {
        picked = c;
        break;
      }
    }
    const pt = (q: (typeof pivots)[number]): AbcdPoint => ({ idx: q.idx, price: q.price });
    // Vorrang: unter allen Tripeln (und ihren früheren C) mit Einstieg im Fenster vor der letzten Kerze der zuerst eingegangene, der läuft und nicht
    // verborgen ist. Die Einstiegskerze kommt ohne Messung aus der Form (`entryIdxOf`); gemessen wird in Einstiegsreihenfolge bis zum ersten Treffer.
    const start = historyStart(tf, at);
    const queue: { p: AbcdPoints; key: string; entryIdx: number; order: number }[] = [];
    const enqueue = (p: AbcdPoints) => {
      const key = pointsKey(p);
      const from = skip.get(key);
      if (from !== undefined && bars[last].time >= from) return;
      const entryIdx = entryIdxOf(bars, shapeOf(bars, p));
      if (entryIdx === null || entryIdx >= last || bars[entryIdx].time < start) return;
      queue.push({ p, key, entryIdx, order: queue.length });
    };
    const searchFrom = historyStart(tf, start);
    for (let j = pivots.length - 1; j >= 2; j--) {
      const p: AbcdPoints = { a: pt(pivots[j - 2]), b: pt(pivots[j - 1]), c: pt(pivots[j]) };
      if (bars[p.c.idx].time < searchFrom) break;
      enqueue(p);
      for (const q of earlierCs(bars, p)) enqueue(q);
    }
    // gleiche Einstiegskerze: das jüngere Tripel zuerst (Reihenfolge der Suche)
    queue.sort((x, y) => x.entryIdx - y.entryIdx || x.order - y.order);
    let found: Candidate | null = null;
    for (const { p, key } of queue) {
      const candidate = candidateFor(p);
      if (!enteredTrade(candidate)) continue;
      const endIdx = candidate.trade!.status!.endIdx;
      const entryIdx = candidate.trade!.entryIdx!;
      if (endIdx !== undefined && endIdx < last) {
        skip.set(key, bars[endIdx + 1].time);
        continue;
      }
      // in der letzten Kerze eingegangen: noch nie gezeigt, also kein Vorrang (gezeigt wird er nur als Wahl)
      if (entryIdx === last || !entryInHistory(tf, bars, candidate, at)) continue;
      if (hidden(candidate)) {
        skip.set(key, bars[entryIdx + 1].time);
        continue;
      }
      // die übrigen Tripel derselben Einstiegskerze zuerst messen: ein beendeter, beim Einstieg gezeigter steht dann in `endedOf`
      for (const q of queue) if (q.entryIdx === entryIdx) candidateFor(q.p);
      if (ghost(candidate)) continue;
      found = candidate;
      break;
    }
    if (picked && ghost(picked)) {
      picked = null;
      for (const p of order) {
        const c = candidateFor(p);
        if (!hidden(c) && !ghost(c) && !proportionLost(c, last, bars, pointsOf.get(c))) {
          picked = c;
          break;
        }
      }
    }
    const shown = found ?? picked;
    recordShown(keys, tf, bars, shown);
    if (!full) return { shown, picked };
    const fullOf = (c: Candidate | null) => (c ? evaluate(env, pointsOf.get(c)!, undefined, pip, atEntry) : null);
    const shownFull = fullOf(shown);
    return { shown: shownFull, picked: picked === shown ? shownFull : fullOf(picked) };
  };
  /** Suche zu einem früheren Schluss: nur der gezeigte Handel zählt (`recordShown`) */
  const shownAt = (env: Env, tf: ContextTimeframe, at: number) => search(env, tf, at, false);
  const tradeAt = tradeAtOf(ctx, keys, shownAt);

  return tfs.map((tf) => {
    const { shown, picked } = search(envFor(base, ctx, t, tf), tf, t, true);
    if (!shown) return { tf, candidate: unmeasurable(tf) };
    if (shown === picked || !picked) return { tf, candidate: shown };
    return { tf, candidate: shown, displaced: picked };
  });
}

/** Prüft eigene Punkte; ist eine Kerze nicht geschlossen oder nicht geladen, sind die Prüfungen nicht messbar */
export function checkAbcdCandidate(ctx: FormationContext, t: number, input: AbcdPointsInput): Candidate {
  const env = buildEnv(ctx, t, input.tf);
  const bars = env?.views.get(input.tf)?.bars;
  if (!env || !bars) return unmeasurable(input.tf);
  const idxOf = (a: Anchor) => bars.findIndex((b) => b.time === a.time);
  const [ia, ib, ic] = [idxOf(input.a), idxOf(input.b), idxOf(input.c)];
  const idxD = input.d ? idxOf(input.d) : undefined;
  if (ia < 0 || ib < 0 || ic < 0 || idxD === -1) return unmeasurable(input.tf);
  const points: AbcdPoints = {
    a: { idx: ia, price: input.a.price },
    b: { idx: ib, price: input.b.price },
    c: { idx: ic, price: input.c.price },
  };
  return evaluate(env, points, input.d && idxD !== undefined ? { idx: idxD, price: input.d.price } : undefined, pipOf(ctx.symbol), entryEnvOf(ctx, input.tf));
}
