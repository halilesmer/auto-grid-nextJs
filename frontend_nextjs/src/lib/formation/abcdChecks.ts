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
import { closesBeyond, countTests, outward, probeFractal, wickEnd, type Rect } from './frz';
import {
  dReached,
  extensionPrice,
  gapToRect,
  innerLevels,
  selectPoints,
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
import { emergencyStopOf, fibPrice, strongZoneAt } from './trade';
import { tradeStatusOf } from './tradeStatus';
import { abcdTrade, withTrade } from './tradeApply';
import type { TradeStatus } from './tradeStatus';
import { abcdIsCdt } from './cdt';
import { evaluate as evaluateBat } from './batChecks';
import { evaluate as evaluateGar } from './garChecks';
import { buildEnv, dirSide, envFor, neighborTf, type Env } from './reasons';
import { reversalAt } from './reversal';
import { earlyReversalOf, type EarlyReversal } from './earlyReversal';
import { reentryOf } from './reentry';
import { cLegOf, lowerAbcdAt, lowerCandleAt, noPeakDivergence } from './cLeg';
import { exemptFor, settle } from './settle';
import { TIMEFRAME_SEC } from '@/lib/analysis/candles';
import { levelXA, ordered, pipOf, shapeOfX } from './xabcd';
import { divergenceOf, engulfZones, rsiExtreme, zoneSideOf } from './sig';
import { TRADE_RULES, type Anchor, type Candidate, type Check, type CheckState, type Drawing, type RuleKind, type RuleStatus, type Verdict } from './types';

const N = FRZ_PARAMS.neighbors;

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

/**
 * ABCD-16: Gartley oder Bat auf denselben A, B, C (X = Wendepunkt vor A), nicht ungültig, mit D-Ziel in der Zone Z-ABCD-04.
 * Toleranz der Zone: HARMONIC_PARAMS.touchPips (wie GAR-05). Gartley-D-Ziel: 0.786 von X → A (GAR-07);
 * Bat-D-Ziel: 0.886 von X → A (BAT-07). Ohne X nicht messbar.
 */
function harmonicD(env: Env, p: AbcdPoints, dInput: AbcdPoint | undefined, pip: number, zone: [number, number]): CheckState {
  const { tf } = env;
  const { pivots } = env.trends.get(tf)!;
  const bars = env.views.get(tf)!.bars;
  const at = pivots.findIndex((q) => q.idx === p.a.idx);
  const x = at > 0 ? pivots[at - 1] : null;
  if (!x) return U;
  const s = shapeOfX(bars, { x: { idx: x.idx, price: x.price }, a: p.a, b: p.b, c: p.c }, dInput);
  if (!ordered(s)) return 'unmet';
  const tol = HARMONIC_PARAMS.touchPips * pip;
  const inZone = (price: number) => price >= zone[0] - tol && price <= zone[1] + tol;
  const gartley = inZone(levelXA(s, GAR_PARAMS.dAtX.level));
  const bat = inZone(levelXA(s, BAT_PARAMS.dLevel));
  const holds = (hit: boolean, evaluate: typeof evaluateGar) => hit && evaluate(env, tf, s, pip).verdict !== 'invalid';
  return flag(holds(gartley, evaluateGar) || holds(bat, evaluateBat));
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

function evaluate(env: Env, p: AbcdPoints, dInput: AbcdPoint | undefined, pip: number, atEntry?: AtEntry): Candidate {
  return evaluateFull(env, p, dInput, pip, atEntry).candidate;
}

function evaluateFull(
  env: Env,
  p: AbcdPoints,
  dInput: AbcdPoint | undefined,
  pip: number,
  atEntry?: AtEntry,
): { candidate: Candidate; big: BigTarget | null; frozenFrom: AbcdPoint | null } {
  const { tf } = env;
  const view = env.views.get(tf)!;
  const trend = env.trends.get(tf)!;
  const fib = env.fibs.get(tf)!;
  const { bars } = view;
  const last = bars.length - 1;
  const s = shapeOf(bars, p, dInput);
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
  const atr = view.atr[d ? d.idx : last] ?? null;
  const near = atr !== null ? ABCD_PARAMS.nearAtr * atr : null;
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

  const inner = innerLevels(trend, s);
  const isNear = (level: number) => near !== null && Math.abs(level - s.level1) <= near;
  add('ABCD-09', near === null ? U : flag(inner.some(isNear)));

  // zweites Level nahe Level 1 (ABCD-15): −0.272 von A → B, 0.618 einer größeren Gegenbewegung, innere Bewegung
  const bigLegs: FibLeg[] = [...fib.legs, ...(higherTf ? (env.fibs.get(higherTf)?.legs ?? []) : [])].filter(
    (leg) => (leg.dir === 'up') !== (es === 'resistance') && legLength(leg) > s.len,
  );
  const secondLevels = [
    extensionPrice(s, ABCD_PARAMS.minExtension),
    ...bigLegs.map((leg) => levelPrice(leg, ABCD_PARAMS.confluenceLevel)),
    ...inner,
  ];
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
  const zonePrices = [s.level1, secondLevels.find(isNear) ?? extensionPrice(s, ABCD_PARAMS.minExtension)];
  const harmonic = near === null ? U : harmonicD(env, p, dInput, pip, [Math.min(...zonePrices), Math.max(...zonePrices)]);
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
    for (let k = s.c.idx + 1; k <= d.idx; k++) {
      const toward = es === 'resistance' ? bars[k].close > bars[k].open : bars[k].close < bars[k].open;
      if (view.wide[k] === true && toward) strong++;
    }
    add('ABCD-23', flags.every((w) => w === null) ? U : flag(strong >= ABCD_PARAMS.wideBars), strong);
  }
  add('ABCD-24', abcdIsCdt(env, tf, es, s.b, s.d));
  add('ABCD-25', flag(timeframeExcluded(tf)));

  // Ziel-Fib wie Z-ABCD-05: ab A bei Divergenz oder Harmonik, sonst ab C
  const from = divState === 'met' || harmonic === 'met' ? s.a : s.c;
  // Stop eingefroren (HDL-14): `from` der Kerze, die Level 1 (mit Toleranz) zuerst erreicht; Divergenz und Harmonik gelten an dieser Kerze
  let frozenFrom: AbcdPoint | null = null;
  let freezeIdx = d ? d.idx : last;
  if (reached && d) {
    // Gleiche Rechnung wie `shortfall` (Anteil von AB), damit Schleife und `reached` an der Toleranzgrenze nicht auseinanderlaufen
    const missAt = (k: number) => Math.max(0, outward(es, s.level1) - outward(es, wickEnd(bars[k], es))) / s.len;
    let k = s.c.idx + 1;
    while (k <= last && missAt(k) > ABCD_PARAMS.tolerance) k++;
    // Ein eigenes D, dessen Preis nicht auf einem Docht liegt, kann keine Kerze treffen: dann gilt die Kerze des D
    if (k > last) k = d.idx;
    freezeIdx = k;
    const dk: AbcdPoint = { idx: k, price: wickEnd(bars[k], es) };
    const divK = divergenceOf(trend, es, s.b.idx, k);
    const divHolds = !!divK && divK.a.wave !== null && divK.b.wave !== null && divK.tie;
    const harmonicK = !divHolds && near !== null && harmonicD(env, p, dk, pip, [Math.min(...zonePrices), Math.max(...zonePrices)]) === 'met';
    frozenFrom = divHolds || harmonicK ? s.a : s.c;
  }
  // Eingefroren am Einstieg (Halil 2026-11-16): Ob es das große Ziel gibt und von wo der Stop gemessen wird (A oder C),
  // entscheiden nur die Daten bis zur Einstiegskerze. Spätere Kerzen ändern X-Schluss (GAR-18), Zonen, innere Wendepunkte
  // und Wave-Werte der Divergenz; das darf einen offenen Handel nicht umdeuten. Eine Rechnung in der Einstiegsumgebung für beides.
  let entryRun: { big: BigTarget | null } | null = null;
  if (atEntry && reached && d && freezeIdx < last) {
    const entryEnv = atEntry(bars[freezeIdx].time);
    const entryBars = entryEnv?.views.get(tf)?.bars;
    if (entryEnv && entryBars && entryBars.length > freezeIdx) {
      const dk: AbcdPoint = { idx: freezeIdx, price: wickEnd(bars[freezeIdx], es) };
      const probeD = dInput && dInput.idx <= freezeIdx ? dInput : undefined;
      const entryD = dInput && !probeD ? dk : probeD;
      const atK = evaluateFull(entryEnv, p, entryD, pip);
      entryRun = { big: atK.big };
      if (atK.frozenFrom) frozenFrom = atK.frozenFrom;
    }
  }
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
  // 1114-A4.3: großes AB=CD-Ziel nur bei harmonischem D mit bekanntem X; Versatz = A − X (Kauf: nach oben, Verkauf: nach unten)
  const xPrice = harmonic === 'met' ? harmonicXOf(env, p) : null;
  let big: BigTarget | null = xPrice === null ? null : { offset: s.a.price - xPrice, activation: s.a.price };
  if (entryRun) big = entryRun.big;
  const input = abcdTrade({
    from,
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
  if (early) {
    // Kein Fibo-Ziel, kein Anteil, kein Stand nach dem Einstieg (A4.5.3)
    input.entry = early.entry;
    input.stop = early.stop;
    input.tp1 = early.target1;
    input.reason = early.target1 === null ? { tp1: 'noZone' } : {};
    input.earlyReversal = { target2: early.target2, gap: early.gap };
  }
  // 1114-A4.2 b: Stand nach dem Einstieg; der Not-SL ist derselbe wie im Handelsblock (Schluss-Stop ± ATR(14))
  const atrNow = bars.length > 0 ? (view.atr[last] ?? null) : null;
  const status =
    !early && reached && d && input.entry !== null && input.stop !== null
      ? tradeStatusOf({
          bars,
          entryIdx: freezeIdx,
          side,
          entry: input.entry,
          stop: input.stop,
          emergencyStop: emergencyStopOf(input.stop, side, atrNow),
          from: from.price,
          targets: ABCD_PARAMS.targets,
          ...(big ? { big } : {}),
        })
      : null;
  if (status) input.status = status;
  // 1114-A4.4: Wiedereinstieg in die Engulf-Zone am D nach TP1 und TP2 (oder nur der Hinweis nach TP1); der erste Handel bleibt unberührt
  const reentry =
    status && d && status.tp1Fill !== undefined
      ? reentryOf({ bars, side, dIdx: d.idx, entryIdx: freezeIdx, status, diagKey: `${s.side}|${bars[s.a.idx]?.time}|${bars[s.b.idx]?.time}|${bars[s.c.idx]?.time}`, engulfZones: engulfZones(bars, view.wide), zones: [...env.frz.zones, ...env.frz.reversed] })
      : null;
  if (reentry?.kind === 'reentry') {
    input.reentry = { entry: reentry.entry, stop: reentry.stop, emergencyStop: emergencyStopOf(reentry.stop, side, atrNow), target: reentry.target, target2: reentry.target2 };
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
  const drawings = drawingsOf(env, s, reached, divState === 'met', harmonic === 'met', secondLevels.find(isNear), input.stop, freezeIdx, status, early, input.tpBig ?? null);
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
  return { candidate: withTrade(candidate, env, tf, input, false), big, frozenFrom };
}

function drawingsOf(env: Env, s: AbcdShape, reached: boolean, divergence: boolean, harmonic: boolean, second: number | undefined, stop: number | null, freezeIdx: number, status: TradeStatus | null, early: EarlyReversal | null, bigTarget: number | null): Drawing[] {
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
    const from = divergence || harmonic ? s.a : s.c;
    const levels = [ABCD_PARAMS.targets.tp1, ABCD_PARAMS.targets.tp2, ...(divergence ? [ABCD_PARAMS.targets.divergence] : [])];
    out.push({ id: 'Z-ABCD-05', tool: 'fib', anchors: [at(from.idx, from.price), at(s.d.idx, s.d.price)], levels, rules: TRADE_RULES, side });
    // Der Stop ist eingefroren und steht als eigene Linie (nicht mehr als Level der mitlaufenden Ziel-Fib)
    // Nach TP1 steht der Stop auf dem Einstieg: Linie ab der TP1-Kerze (1114-A4.2 b)
    if (stop !== null) {
      const moved = status?.stopMovedIdx;
      const shown = status && moved !== undefined ? status.stopNow : stop;
      out.push({ id: 'Z-ABCD-07', tool: 'hline', anchors: [at(moved ?? freezeIdx, shown)], rules: TRADE_RULES, side });
      out.push({ id: 'Z-ABCD-08', tool: 'label', anchors: [{ time: lastTime, price: shown }], label: 'stop', rules: TRADE_RULES, side });
    }
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
function entryEnvOf(ctx: FormationContext, tf: ContextTimeframe): AtEntry {
  return (entryTime) => buildEnv(ctx, entryTime + TIMEFRAME_SEC[tf], tf);
}

/** Sucht je geladener Zeiteinheit (hoch → tief) die letzten Punkte A, B, C und misst D */
export function analyzeAbcd(ctx: FormationContext, t: number): AbcdAnalysis[] {
  const tfs = ctx.timeframes();
  const base = tfs.length > 0 ? buildEnv(ctx, t, tfs[0]) : null;
  if (!base) return [];
  const pip = pipOf(ctx.symbol);
  return tfs.map((tf) => {
    const env = envFor(base, ctx, t, tf);
    const points = selectPoints(env.trends.get(tf)!.pivots);
    return { tf, candidate: points ? evaluate(env, points, undefined, pip, entryEnvOf(ctx, tf)) : unmeasurable(tf) };
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
