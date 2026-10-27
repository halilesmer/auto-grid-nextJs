/**
 * Fraktal-Zone (FRZ): Prüfung je Bedingungs-ID und Zeichnungen Z-FRZ-01 bis Z-FRZ-06.
 * `analyzeFrz` sucht die Zonen aller geladenen Zeiteinheiten (FRZ-19 bis FRZ-30); `checkFrzCandidate` prüft eine
 * beliebige Kerze als Kandidat, auch wenn sie keine Zone ergibt (Zeichnung und ☐ gibt es trotzdem).
 *
 * Lesart der Zustände: bei Ereignis-Bedingungen (FRZ-06 Verletzung, FRZ-08 Docht ohne Schluss, FRZ-09, FRZ-10,
 * FRZ-14 bis FRZ-16, FRZ-22, FRZ-31 bis FRZ-39) heißt ☑ „liegt vor“. Das Urteil ergibt sich aus FRZ-02, FRZ-03,
 * FRZ-04, FRZ-07 und FRZ-10.
 */
import { TIMEFRAME_SEC } from '@/lib/analysis/candles';
import type { FormationContext, TimeframeView } from './context';
import {
  closesBeyond,
  countTests,
  fractalIndices,
  mergeGroups,
  otherSide,
  outward,
  probeFractal,
  rectGap,
  scanZone,
  searchZones,
  strengthOf,
  wickEnd,
  zoneGeometry,
  type Rect,
  type ZoneGeometry,
  type ZoneScan,
  type ZoneSide,
} from './frz';
import { CONTEXT_TIMEFRAMES, FRZ_PARAMS, type ContextTimeframe } from './params';
import type { Anchor, Candidate, Check, CheckState, Drawing, FormationBar, RuleKind, RuleStatus, Verdict } from './types';

const N = FRZ_PARAMS.neighbors;

/** Art und Status je Bedingung. FRZ-12 und FRZ-28 sind reine Anzeige und haben keine Prüfung. */
const RULES: Record<string, [RuleKind, RuleStatus]> = {
  'FRZ-01': ['required', 'confirmed'],
  'FRZ-02': ['required', 'confirmed'],
  'FRZ-03': ['required', 'confirmed'],
  'FRZ-04': ['required', 'confirmed'],
  'FRZ-05': ['required', 'confirmed'],
  'FRZ-06': ['required', 'confirmed'],
  'FRZ-07': ['required', 'confirmed'],
  'FRZ-08': ['required', 'confirmed'],
  'FRZ-09': ['required', 'confirmed'],
  'FRZ-10': ['exclusion', 'confirmed'],
  'FRZ-11': ['required', 'confirmed'],
  'FRZ-13': ['required', 'assumption'],
  'FRZ-14': ['required', 'confirmed'],
  'FRZ-15': ['required', 'confirmed'],
  'FRZ-16': ['required', 'assumption'],
  'FRZ-18': ['exclusion', 'assumption'],
  'FRZ-19': ['required', 'confirmed'],
  'FRZ-20': ['required', 'confirmed'],
  'FRZ-21': ['exclusion', 'confirmed'],
  'FRZ-22': ['required', 'assumption'],
  'FRZ-24': ['exclusion', 'confirmed'],
  'FRZ-25': ['bonus', 'confirmed'],
  'FRZ-27': ['required', 'confirmed'],
  'FRZ-29': ['bonus', 'confirmed'],
  'FRZ-30': ['bonus', 'confirmed'],
  'FRZ-31': ['required', 'assumption'],
  'FRZ-32': ['bonus', 'confirmed'],
  'FRZ-33': ['exclusion', 'confirmed'],
  'FRZ-34': ['bonus', 'confirmed'],
  'FRZ-35': ['required', 'confirmed'],
  'FRZ-36': ['required', 'assumption'],
  'FRZ-37': ['bonus', 'confirmed'],
  'FRZ-38': ['bonus', 'confirmed'],
  'FRZ-39': ['bonus', 'assumption'],
};

/** Bedingungen mit Prüfung, in der Reihenfolge des Regelwerks */
export const FRZ_CHECK_IDS: readonly string[] = Object.keys(RULES);

export interface FrzOptions {
  /** Einstiegs-Zeiteinheit: nur wenn sie M15 ist, gelten M15-Zonen (FRZ-27) */
  entryTf?: ContextTimeframe;
  /** Preise von Fibonacci-Zielen; liegt eines in einer Zwischenzone, entfällt FRZ-24 (Ausnahme). Kommt mit FIB. */
  fibTargets?: readonly number[];
}

export interface FrzCandidateInput {
  tf: ContextTimeframe;
  side: ZoneSide;
  /** Öffnungszeit der Kandidatenkerze (MT5-Sekunden) */
  time: number;
  /** Preis der Suchlinie (FRZ-01): das Dochtende muss ihn erreichen */
  level?: number;
}

export interface FrzZone {
  tf: ContextTimeframe;
  /** Seite der Zone in ihrer aktuellen Rolle */
  side: ZoneSide;
  role: 'original' | 'reversed';
  rect: Rect;
  /** Öffnungszeiten der Fraktalkerzen in der Zone (zusammengelegt: mehrere) */
  fractalTimes: number[];
  tests: number;
  /** 0 potenziell, 1 stark, 2 sehr stark */
  strength: 0 | 1 | 2;
  candidate: Candidate;
}

export interface FrzAnalysis {
  /** Gewählte Zonen: gefunden, gültig, zusammengelegt, innerhalb der Anzahl, nicht ausgeschlossen */
  zones: FrzZone[];
  /** Nach Schluss jenseits die Gegenzone (FRZ-35): je Seite die jüngsten Brüche */
  reversed: FrzZone[];
}

interface Member {
  idx: number;
  geom: ZoneGeometry;
}

interface Reversal {
  /** Rücktests in der neuen Rolle (FRZ-39) */
  retests: number;
  /** Rücktest mit Reaktion (FRZ-38) */
  reaction: boolean;
}

interface Group {
  side: ZoneSide;
  members: Member[];
  /** äußerstes Fraktal: seine Kerze steht für die Prüfungen FRZ-01 bis FRZ-16 */
  outer: Member;
  rect: Rect;
  found: boolean;
  /** 1-basiert, nah → fern; null, wenn nicht gefunden */
  rank: number | null;
  scan: ZoneScan;
  tests: number;
  strength: 0 | 1 | 2;
  reversal: Reversal | null;
}

interface TfModel {
  tf: ContextTimeframe;
  view: TimeframeView;
  dur: number;
  atr: number | null;
  frIdx: Record<ZoneSide, number[]>;
  live: Record<ZoneSide, number[]>;
  lines: Record<ZoneSide, number>;
  groups: Record<ZoneSide, Group[]>;
  allowed: boolean;
  selected: Record<ZoneSide, Group[]>;
}

interface Model {
  models: Map<ContextTimeframe, TfModel>;
  order: ContextTimeframe[];
  options: FrzOptions;
}

const lastValue = (s: (number | null)[]): number | null => {
  for (let k = s.length - 1; k >= 0; k--) if (s[k] !== null) return s[k];
  return null;
};

function makeGroup(m: TfModel, side: ZoneSide, members: Member[], found: boolean, rank: number | null): Group {
  const { bars } = m.view;
  const outer = members.reduce((a, b) => (outward(side, b.geom.extreme) > outward(side, a.geom.extreme) ? b : a));
  const rect: Rect = {
    top: Math.max(...members.map((x) => x.geom.top)),
    bottom: Math.min(...members.map((x) => x.geom.bottom)),
  };
  const scan = scanZone(bars, side, { ...rect, extreme: outer.geom.extreme }, outer.idx + N + 1);
  const from = Math.min(...members.map((x) => x.idx)) + N + 1;
  const to = (scan.firstBreak ?? bars.length) - 1;
  const nearMember = (k: number) => members.some((x) => Math.abs(k - x.idx) <= N);
  const tests = countTests(bars, side, rect, from, to, nearMember, m.frIdx[otherSide(side)]);
  let reversal: Reversal | null = null;
  if (scan.firstBreak !== null && scan.backBreak === null) {
    const role = otherSide(side);
    const retests = countTests(bars, role, rect, scan.firstBreak + 1, bars.length - 1, () => false, m.frIdx[side]);
    const reach = FRZ_PARAMS.testReach * (rect.top - rect.bottom);
    const brk = scan.firstBreak;
    const reaction =
      retests >= 1 &&
      m.frIdx[role].some((f) => {
        const e = wickEnd(bars[f], role);
        return f > brk && e >= rect.bottom - reach && e <= rect.top + reach;
      });
    reversal = { retests, reaction };
  }
  return { side, members, outer, rect, found, rank, scan, tests, strength: strengthOf(tests, members.length), reversal };
}

function buildTf(tf: ContextTimeframe, view: TimeframeView, options: FrzOptions): TfModel {
  const bars = view.bars;
  const frIdx = {
    resistance: fractalIndices(bars, 'resistance'),
    support: fractalIndices(bars, 'support'),
  };
  const m: TfModel = {
    tf,
    view,
    dur: TIMEFRAME_SEC[tf],
    atr: lastValue(view.atr),
    frIdx,
    live: { resistance: [], support: [] },
    lines: { resistance: NaN, support: NaN },
    groups: { resistance: [], support: [] },
    allowed: tf !== 'M15' || options.entryTf === 'M15',
    selected: { resistance: [], support: [] },
  };
  if (bars.length === 0) return m;
  for (const side of ['resistance', 'support'] as const) {
    m.live[side] = frIdx[side].filter((i) => {
      const g = zoneGeometry(bars, i, side, tf);
      return scanZone(bars, side, g, i + N + 1).firstBreak === null;
    });
    const { line, found } = searchZones(bars, side, m.live[side]);
    m.lines[side] = line;
    const members: Member[] = found.map((idx) => ({ idx, geom: zoneGeometry(bars, idx, side, tf) }));
    const groups = mergeGroups(members.map((x) => x.geom)).map((pos) => pos.map((p) => members[p]));
    const built = groups.map((g) => makeGroup(m, side, g, true, null));
    built.sort((a, b) => outward(side, a.outer.geom.extreme) - outward(side, b.outer.geom.extreme));
    m.groups[side] = built.map((g, k) => ({ ...g, rank: k + 1 }));
  }
  return m;
}

/** FRZ-24: ein Fraktal zwischen Kurs und einer stärkeren, getesteten Zone entfällt, außer an ihm liegt ein Fibonacci-Ziel */
function excludedByStrongerZone(m: TfModel, g: Group, options: FrzOptions): boolean {
  const farther = m.groups[g.side].some(
    (h) =>
      h.outer.idx !== g.outer.idx &&
      outward(g.side, h.outer.geom.extreme) > outward(g.side, g.outer.geom.extreme) &&
      h.tests >= 1 &&
      h.strength > g.strength,
  );
  const fibHere = (options.fibTargets ?? []).some((p) => p >= g.rect.bottom && p <= g.rect.top);
  return farther && !fibHere;
}

/** FRZ-21: nahe am Kurs liegt schon eine gewählte Zone einer höheren Zeiteinheit auf dieser Seite */
function nearHigherZone(model: Model, m: TfModel, g: Group): CheckState {
  const higher = model.order.filter((tf) => CONTEXT_TIMEFRAMES.indexOf(tf) < CONTEXT_TIMEFRAMES.indexOf(m.tf));
  if (higher.length === 0) return m.tf === 'D1' ? 'unmet' : 'unmeasurable';
  const price = m.view.bars[m.view.bars.length - 1].close;
  let undecided = false;
  for (const tf of higher) {
    const h = model.models.get(tf)!;
    for (const z of h.selected[g.side]) {
      if (h.atr === null) {
        undecided = true;
        continue;
      }
      const dist = g.side === 'resistance' ? Math.max(0, z.rect.bottom - price) : Math.max(0, price - z.rect.top);
      if (dist <= FRZ_PARAMS.nearAtr * h.atr) return 'met';
    }
  }
  return undecided ? 'unmeasurable' : 'unmet';
}

function buildModel(ctx: FormationContext, t: number, options: FrzOptions): Model {
  const models = new Map<ContextTimeframe, TfModel>();
  for (const tf of ctx.timeframes()) {
    const view = ctx.view(tf, t);
    if (view) models.set(tf, buildTf(tf, view, options));
  }
  const model: Model = { models, order: [...models.keys()], options };
  // von hoch nach tief: FRZ-21 braucht die gewählten Zonen der höheren Zeiteinheiten
  for (const tf of model.order) {
    const m = models.get(tf)!;
    if (!m.allowed || m.view.bars.length === 0) continue;
    for (const side of ['resistance', 'support'] as const) {
      m.selected[side] = m.groups[side].filter(
        (g) =>
          g.rank! <= FRZ_PARAMS.zonesPerSide[tf] &&
          !excludedByStrongerZone(m, g, options) &&
          nearHigherZone(model, m, g) !== 'met',
      );
    }
  }
  return model;
}

const check = (id: string, state: CheckState, value?: number): Check => {
  const [kind, status] = RULES[id];
  return { id, kind, status, state, ...(value === undefined ? {} : { value }), drawings: [] };
};
const flag = (cond: boolean): CheckState => (cond ? 'met' : 'unmet');

function overlapsOtherTimeframe(model: Model, m: TfModel, g: Group): boolean {
  return model.order.some(
    (tf) => tf !== m.tf && model.models.get(tf)!.selected[g.side].some((z) => rectGap(z.rect, g.rect) === 0 && z.rect.top >= g.rect.bottom && z.rect.bottom <= g.rect.top),
  );
}

/** FRZ-09: ein Schluss einer tieferen Zeiteinheit jenseits seit der Bildung, die Zone der eigenen Zeiteinheit hält */
function lowerTimeframeBreak(model: Model, m: TfModel, g: Group): boolean {
  const formingBar = m.view.bars[g.outer.idx + N];
  if (!formingBar) return false;
  const formed = formingBar.time + m.dur;
  return model.order.some((tf) => {
    if (TIMEFRAME_SEC[tf] >= m.dur) return false;
    return model.models
      .get(tf)!
      .view.bars.some((b) => b.time >= formed && closesBeyond(b, g.outer.geom.extreme, g.side));
  });
}

const zoneDrawingId = (side: ZoneSide) => (side === 'resistance' ? 'Z-FRZ-03' : 'Z-FRZ-04');

function drawingsOf(m: TfModel, g: Group, line: number | null, shownSide: ZoneSide): Drawing[] {
  const { bars } = m.view;
  const last = bars[bars.length - 1];
  const rectAnchors: Anchor[] = [
    { time: bars[Math.min(...g.members.map((x) => x.idx))].time, price: g.rect.top },
    { time: last.time + m.dur, price: g.rect.bottom },
  ];
  const out: Drawing[] = g.members.map((x) => ({
    id: 'Z-FRZ-01',
    tool: 'marker',
    anchors: [{ time: bars[x.idx].time, price: x.geom.extreme }],
    rules: ['FRZ-01', 'FRZ-02', 'FRZ-03', 'FRZ-04'],
  }));
  if (line !== null) {
    out.push({ id: 'Z-FRZ-02', tool: 'hline', anchors: [{ time: last.time, price: line }], rules: ['FRZ-19'] });
  }
  if (g.members.length > 1) {
    out.push({ id: 'Z-FRZ-05', tool: 'zone', anchors: rectAnchors, rules: ['FRZ-22', 'FRZ-29'] });
  } else {
    const rules = ['FRZ-11', 'FRZ-12', 'FRZ-13', 'FRZ-14', 'FRZ-15', 'FRZ-16'];
    out.push({ id: zoneDrawingId(shownSide), tool: 'zone', anchors: rectAnchors, rules });
  }
  // FRZ-28: D1-Zone auch in H4 (und in H1, wenn nah am Kurs), H4-Zone in H4 und H1, H1-Zone nur in H1
  const near =
    m.atr !== null &&
    (shownSide === 'resistance' ? Math.max(0, g.rect.bottom - last.close) : Math.max(0, last.close - g.rect.top)) <=
      FRZ_PARAMS.nearAtr * m.atr;
  const visible: Record<ContextTimeframe, ContextTimeframe[]> = {
    D1: near ? ['D1', 'H4', 'H1'] : ['D1', 'H4'],
    H4: ['H4', 'H1'],
    H1: ['H1'],
    M15: ['M15'],
  };
  out.push({ id: 'Z-FRZ-06', tool: 'zone', anchors: rectAnchors, rules: ['FRZ-28'], timeframes: visible[m.tf] });
  return out;
}

function evaluate(model: Model, m: TfModel, g: Group, role: 'original' | 'reversed', level: number | undefined): Candidate {
  const { bars } = m.view;
  const i = g.outer.idx;
  const side = g.side;
  const geom = g.outer.geom;
  const probe = probeFractal(bars, i, side);
  const scan = g.scan;
  const brk = scan.firstBreak;
  const reversed = brk !== null && scan.backBreak === null;
  const wide = brk === null ? null : m.view.wide[brk];
  const strengthBeforeBreak = g.strength;
  const lineValue = level ?? m.lines[side];
  const drawings = drawingsOf(m, g, g.found ? m.lines[side] : null, role === 'original' ? side : otherSide(side));

  let wickIgnored = 0;
  let closeBeyond = false;
  for (let k = Math.max(0, i - N); k < bars.length; k++) {
    if (k === i) continue;
    if (closesBeyond(bars[k], geom.extreme, side)) closeBeyond = true;
    else if (side === 'resistance' ? bars[k].high > geom.extreme : bars[k].low < geom.extreme) wickIgnored++;
  }

  const ex21 = nearHigherZone(model, m, g);
  const ex24 = excludedByStrongerZone(m, g, model.options);
  const reachesLine =
    lineValue === undefined || (side === 'resistance' ? bars[i].high >= lineValue : bars[i].low <= lineValue);
  const latestLive = m.live[side][m.live[side].length - 1];
  let breakCandleState: CheckState = 'unmet';
  if (brk !== null) breakCandleState = wide === null ? 'unmeasurable' : flag(wide);
  const thinPending: CheckState = geom.thin === null && !geom.wickless ? 'unmeasurable' : 'unmet';

  const checks: Check[] = [
    check('FRZ-01', flag(reachesLine)),
    check('FRZ-02', flag(probe.rightBars === N), probe.rightBars),
    check('FRZ-03', flag(probe.leftBars === N), probe.leftBars),
    check('FRZ-04', flag(probe.beyond === 0), probe.beyond),
    check('FRZ-05', flag(!closeBeyond), wickIgnored),
    check('FRZ-06', flag(brk !== null), brk === null ? undefined : bars[brk].time),
    check('FRZ-07', flag(brk === null)),
    check('FRZ-08', flag(scan.wickBreaches > 0 && brk === null), scan.wickBreaches),
    check('FRZ-09', flag(brk === null && lowerTimeframeBreak(model, m, g))),
    check('FRZ-10', flag(scan.backBreak !== null)),
    check('FRZ-11', flag(geom.baseHeight > 0), geom.baseHeight),
    check('FRZ-13', geom.thin === null ? 'unmeasurable' : flag(geom.thin), geom.baseHeight),
    check('FRZ-14', geom.rule === 'thin' ? 'met' : thinPending),
    check('FRZ-15', flag(geom.wickless)),
    check('FRZ-16', flag(geom.manipulation)),
    check('FRZ-18', 'unmeasurable'),
    check('FRZ-19', flag(g.found)),
    check('FRZ-20', flag(g.rank !== null && g.rank <= FRZ_PARAMS.zonesPerSide[m.tf]), g.rank ?? undefined),
    check('FRZ-21', ex21),
    check('FRZ-22', flag(g.members.length >= 2), g.members.length),
    check('FRZ-24', flag(ex24)),
    check('FRZ-25', flag(g.members.some((x) => x.idx === latestLive))),
    check('FRZ-27', flag(m.allowed)),
    check('FRZ-29', flag(g.members.length >= 2), g.members.length),
    check('FRZ-30', flag(overlapsOtherTimeframe(model, m, g))),
    check('FRZ-31', flag(g.tests >= 1), g.tests),
    check('FRZ-32', flag(g.tests >= FRZ_PARAMS.strongTests), g.tests),
    check('FRZ-33', flag(g.strength === 0)),
    check('FRZ-34', flag(g.strength === 2), g.tests),
    check('FRZ-35', flag(reversed)),
    check('FRZ-36', breakCandleState),
    check('FRZ-37', flag(reversed && strengthBeforeBreak >= 1 && wide === true), strengthBeforeBreak),
    check('FRZ-38', flag(g.reversal?.reaction === true)),
    check(
      'FRZ-39',
      flag(
        g.reversal !== null &&
          brk !== null &&
          g.reversal.retests <= FRZ_PARAMS.fresh.maxRetests &&
          bars.length - 1 - brk <= FRZ_PARAMS.fresh.maxBars,
      ),
      g.reversal?.retests,
    ),
  ].map((c) => ({ ...c, drawings: drawings.filter((d) => d.rules.includes(c.id)).map((d) => d.id) }));

  let verdict: Verdict = 'valid';
  if (role === 'reversed') {
    if (scan.backBreak !== null) verdict = 'invalid';
  } else if (probe.leftBars < N || probe.beyond > 0 || brk !== null) verdict = 'invalid';
  else if (probe.rightBars < N) verdict = 'forming';

  const expectsSell = (role === 'original') === (side === 'resistance');
  return {
    code: 'FRZ',
    side: expectsSell ? 'sell' : 'buy',
    tf: m.tf,
    points: { F: { time: bars[i].time, price: geom.extreme } },
    checks,
    drawings,
    verdict,
  };
}

function toZone(model: Model, m: TfModel, g: Group, role: 'original' | 'reversed'): FrzZone {
  return {
    tf: m.tf,
    side: role === 'original' ? g.side : otherSide(g.side),
    role,
    rect: g.rect,
    fractalTimes: g.members.map((x) => m.view.bars[x.idx].time),
    tests: g.tests,
    strength: g.strength,
    candidate: evaluate(model, m, g, role, undefined),
  };
}

export function analyzeFrz(ctx: FormationContext, t: number, options: FrzOptions = {}): FrzAnalysis {
  const model = buildModel(ctx, t, options);
  const zones: FrzZone[] = [];
  const reversed: FrzZone[] = [];
  for (const tf of model.order) {
    const m = model.models.get(tf)!;
    if (!m.allowed || m.view.bars.length === 0) continue;
    for (const side of ['resistance', 'support'] as const) {
      zones.push(...m.selected[side].map((g) => toZone(model, m, g, 'original')));
      const broken = m.frIdx[side]
        .map((idx) => makeGroup(m, side, [{ idx, geom: zoneGeometry(m.view.bars, idx, side, tf) }], false, null))
        .filter((g) => g.scan.firstBreak !== null && g.scan.backBreak === null)
        .sort((a, b) => b.scan.firstBreak! - a.scan.firstBreak! || b.outer.idx - a.outer.idx)
        .slice(0, FRZ_PARAMS.zonesPerSide[tf]);
      reversed.push(...broken.map((g) => toZone(model, m, g, 'reversed')));
    }
  }
  return { zones, reversed };
}

/** Prüft eine Kerze als Kandidat; die Kerze muss in der Zeiteinheit geschlossen sein, sonst sind die Prüfungen nicht messbar */
export function checkFrzCandidate(
  ctx: FormationContext,
  t: number,
  input: FrzCandidateInput,
  options: FrzOptions = {},
): Candidate {
  const model = buildModel(ctx, t, options);
  const m = model.models.get(input.tf);
  const idx = m ? m.view.bars.findIndex((b: FormationBar) => b.time === input.time) : -1;
  if (!m || idx < 0) {
    const checks = FRZ_CHECK_IDS.map((id) => check(id, id === 'FRZ-02' ? 'unmet' : 'unmeasurable'));
    return { code: 'FRZ', side: input.side === 'resistance' ? 'sell' : 'buy', tf: input.tf, points: {}, checks, drawings: [], verdict: 'forming' };
  }
  const found = m.groups[input.side].find((g) => g.members.some((x) => x.idx === idx));
  const group =
    found ?? makeGroup(m, input.side, [{ idx, geom: zoneGeometry(m.view.bars, idx, input.side, input.tf) }], false, null);
  return evaluate(model, m, group, 'original', input.level);
}
