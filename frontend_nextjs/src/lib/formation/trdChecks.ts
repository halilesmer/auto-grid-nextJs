/**
 * Trend (TRD): Prüfung je Bedingungs-ID und Zeichnungen Z-TRD-01 bis Z-TRD-08.
 * `analyzeTrd` führt den Trendzug jeder geladenen Zeiteinheit; `checkTrdCandidate` prüft ein beliebiges Fraktal
 * als Wendepunkt, auch wenn es nicht gezeichnet wird (Zeichnung und ☐ gibt es trotzdem).
 *
 * Lesart der Zustände: bei Ereignis-Bedingungen (TRD-05, TRD-08, TRD-18, TRD-19, TRD-43) heißt ☑ „liegt vor“.
 * Punkt-Bedingungen (TRD-01 bis TRD-09) gelten für den gewählten Wendepunkt, sonst für das jüngste Fraktal.
 * Ohne die nötigen Daten ist der Zustand „nicht messbar“; Zustandsbedingungen ohne Ereignis ergeben ☐.
 */
import { TIMEFRAME_SEC } from '@/lib/analysis/candles';
import { closesBeyond, outward, probeFractal, wickEnd, type ZoneSide } from './frz';
import { CONTEXT_TIMEFRAMES, FRZ_PARAMS, TRD_PARAMS, type ContextTimeframe } from './params';
import {
  buildTrend,
  counterSide,
  extremeSide,
  lastOf,
  lensOf,
  lineAt,
  scanLine,
  trendLines,
  type TrdCand,
  type TrendDir,
  type TrendLine,
  type TrendModel,
} from './trd';
import type { FormationContext } from './context';
import type { Candidate, Check, CheckState, Drawing, RuleKind, RuleStatus, Side, Verdict } from './types';

const N = FRZ_PARAMS.neighbors;

/** Art und Status je Bedingung. TRD-14 und TRD-26 sind reine Anzeige und haben keine Prüfung. */
const RULES: Record<string, [RuleKind, RuleStatus]> = {
  'TRD-01': ['required', 'confirmed'],
  'TRD-02': ['required', 'confirmed'],
  'TRD-03': ['required', 'confirmed'],
  'TRD-04': ['required', 'confirmed'],
  'TRD-05': ['required', 'confirmed'],
  'TRD-06': ['required', 'confirmed'],
  'TRD-07': ['required', 'confirmed'],
  'TRD-08': ['required', 'assumption'],
  'TRD-09': ['required', 'confirmed'],
  'TRD-10': ['required', 'confirmed'],
  'TRD-11': ['required', 'confirmed'],
  'TRD-12': ['required', 'confirmed'],
  'TRD-13': ['required', 'confirmed'],
  'TRD-15': ['required', 'confirmed'],
  'TRD-16': ['required', 'confirmed'],
  'TRD-17': ['required', 'assumption'],
  'TRD-18': ['exclusion', 'confirmed'],
  'TRD-19': ['exclusion', 'confirmed'],
  'TRD-20': ['required', 'confirmed'],
  'TRD-21': ['bonus', 'confirmed'],
  'TRD-22': ['bonus', 'assumption'],
  'TRD-23': ['bonus', 'assumption'],
  'TRD-24': ['bonus', 'assumption'],
  'TRD-25': ['required', 'confirmed'],
  'TRD-27': ['bonus', 'confirmed'],
  'TRD-28': ['required', 'confirmed'],
  'TRD-29': ['required', 'confirmed'],
  'TRD-30': ['exclusion', 'assumption'],
  'TRD-31': ['bonus', 'confirmed'],
  'TRD-32': ['required', 'confirmed'],
  'TRD-33': ['required', 'confirmed'],
  'TRD-34': ['required', 'confirmed'],
  'TRD-35': ['required', 'confirmed'],
  'TRD-36': ['required', 'confirmed'],
  'TRD-37': ['required', 'confirmed'],
  'TRD-38': ['required', 'assumption'],
  'TRD-39': ['bonus', 'confirmed'],
  'TRD-40': ['required', 'assumption'],
  'TRD-41': ['bonus', 'confirmed'],
  'TRD-42': ['required', 'confirmed'],
  'TRD-43': ['exclusion', 'confirmed'],
  'TRD-44': ['bonus', 'secondary'],
  'TRD-45': ['bonus', 'assumption'],
  'TRD-46': ['bonus', 'secondary'],
  'TRD-47': ['bonus', 'secondary'],
  'TRD-48': ['bonus', 'secondary'],
};

/** Bedingungen mit Prüfung, in der Reihenfolge des Regelwerks */
export const TRD_CHECK_IDS: readonly string[] = Object.keys(RULES);
/** Immer „nicht messbar“: Reihenfolge der Auswertung und Wahl der Einstiegs-Zeiteinheit sind keine Kerzenbedingung */
export const TRD_UNMEASURABLE_IDS: readonly string[] = ['TRD-25', 'TRD-29'];

export interface TrdOptions {
  /** Seite des geplanten Trades (TRD-27, TRD-31 bis TRD-33); ohne sie sind diese Bedingungen nicht messbar */
  side?: Side;
  /** Zahl der Gründe außer TRD-27 (TRD-32, TRD-33); die Zählung selbst liefert SIG */
  reasons?: number;
}

export interface TrdPointInput {
  tf: ContextTimeframe;
  /** Öffnungszeit der Kerze des Wendepunkts (MT5-Sekunden) */
  time: number;
  side: ZoneSide;
}

export interface TrdAnalysis {
  tf: ContextTimeframe;
  dir: TrendDir | null;
  model: TrendModel;
  candidate: Candidate;
}

const sideOf = (dir: TrendDir): Side => (dir === 'up' ? 'buy' : 'sell');
const flag = (cond: boolean): CheckState => (cond ? 'met' : 'unmet');
const U: CheckState = 'unmeasurable';

type Models = Map<ContextTimeframe, TrendModel>;

function buildModels(ctx: FormationContext, t: number): Models {
  const models: Models = new Map();
  for (const tf of ctx.timeframes()) {
    const view = ctx.view(tf, t);
    if (view) models.set(tf, buildTrend(tf, view.bars, view.wave));
  }
  return models;
}

const neighbor = (models: Models, tf: ContextTimeframe, step: -1 | 1): TrendModel | undefined => {
  const next = CONTEXT_TIMEFRAMES[CONTEXT_TIMEFRAMES.indexOf(tf) + step];
  return next ? models.get(next) : undefined;
};

/** Phasen der Wave um einen Punkt: Bereich gleichen Vorzeichens, in dem der Punkt das Extrem sein muss (TRD-45) */
function waveDeviations(m: TrendModel): { checked: number; bad: number } {
  let checked = 0;
  let bad = 0;
  for (const p of m.pivots) {
    const w = m.wave[p.idx];
    if (w === null) continue;
    checked++;
    const wantPositive = p.side === 'resistance';
    if (wantPositive ? w <= 0 : w >= 0) {
      bad++;
      continue;
    }
    let lo = p.idx;
    let hi = p.idx;
    const sameSign = (k: number) => m.wave[k] !== null && (m.wave[k]! > 0) === wantPositive && m.wave[k] !== 0;
    while (lo > 0 && sameSign(lo - 1)) lo--;
    while (hi < m.bars.length - 1 && sameSign(hi + 1)) hi++;
    let best = wickEnd(m.bars[lo], p.side);
    for (let k = lo; k <= hi; k++) {
      if (outward(p.side, wickEnd(m.bars[k], p.side)) > outward(p.side, best)) best = wickEnd(m.bars[k], p.side);
    }
    if (best !== p.price) bad++;
  }
  return { checked, bad };
}

const mk = (id: string, state: CheckState, value?: number): Check => {
  const [kind, status] = RULES[id];
  return { id, kind, status, state, ...(value === undefined ? {} : { value }), drawings: [] };
};

function evaluate(models: Models, m: TrendModel, options: TrdOptions, p: TrdCand | null, explicit: boolean): Candidate {
  const { bars, pivots, dir } = m;
  const last = lastOf(pivots);
  const lines = trendLines(m);
  const line: TrendLine | undefined = lastOf(lines);
  const prevLine: TrendLine | undefined = lines.length >= 2 ? lines[lines.length - 2] : undefined;
  const higher = neighbor(models, m.tf, -1);
  const lower = neighbor(models, m.tf, 1);
  const corrLens = lensOf(m, 'correction');
  const impLens = lensOf(m, 'impulse');
  const lastBar = bars.length > 0 ? bars[bars.length - 1] : undefined;
  const checks: Check[] = [];
  const add = (id: string, state: CheckState, value?: number) => checks.push(mk(id, state, value));

  // Punkt-Bedingungen TRD-01 bis TRD-09
  const prevDrawn = p ? [...pivots].reverse().find((x) => x.idx < p.idx) : undefined;
  let alternates: CheckState = U;
  if (p) alternates = prevDrawn ? flag(prevDrawn.side !== p.side) : 'met';
  add('TRD-01', alternates);
  if (p) {
    const prevOpp = [...pivots].reverse().find((x) => x.side !== p.side && x.idx < p.idx);
    const nextOpp = pivots.find((x) => x.side !== p.side && x.idx > p.idx);
    const from = prevOpp ? prevOpp.idx + 1 : 0;
    const to = nextOpp ? nextOpp.idx - 1 : bars.length - 1;
    let extreme = wickEnd(bars[from], p.side);
    for (let k = from; k <= to; k++) {
      if (outward(p.side, wickEnd(bars[k], p.side)) > outward(p.side, extreme)) extreme = wickEnd(bars[k], p.side);
    }
    add('TRD-02', flag(p.price === extreme));
    const probe = probeFractal(bars, p.idx, p.side);
    add('TRD-03', flag(probe.leftBars === N && probe.rightBars === N && probe.beyond === 0), probe.rightBars);
  } else {
    add('TRD-02', U);
    add('TRD-03', U);
  }
  add('TRD-04', flag(pivots.length >= 2), pivots.length);
  if (p) {
    let beyond = false;
    for (let k = p.idx + 1; k <= Math.min(bars.length - 1, p.idx + N); k++) {
      if (closesBeyond(bars[k], p.price, p.side)) beyond = true;
    }
    add('TRD-05', flag(beyond));
    add('TRD-06', flag(p.drawn));
  } else {
    add('TRD-05', U);
    add('TRD-06', U);
  }
  // ohne gewählten Punkt gilt die jüngste Korrektur; ein gewählter Impuls-Punkt hat keine Korrekturlänge
  let corr: TrdCand | undefined;
  if (p?.isCorrection) corr = p;
  else if (!explicit) corr = [...m.cands].reverse().find((c) => c.isCorrection);
  const ratio = corr?.ratio ?? undefined;
  add('TRD-07', corr ? flag(corr.accepted) : U, ratio);
  add('TRD-08', !corr || corr.ratio === null ? U : flag(corr.ratio >= TRD_PARAMS.gapLow && corr.ratio < TRD_PARAMS.ownWave), ratio);
  add('TRD-09', corr ? flag(corr.ratio !== null) : U, m.refCorrection ?? undefined);

  // TRD-10: die Welle nach einer Korrektur ist mindestens so lang wie diese
  const impPos = pivots.map((x) => x.kind).lastIndexOf('impulse');
  const beforeImp = impPos > 0 ? pivots[impPos - 1] : undefined;
  add('TRD-10', beforeImp?.kind === 'correction' ? flag(pivots[impPos].len >= beforeImp.len) : U);

  // Impuls und Korrektur
  add('TRD-11', !last || last.kind === 'start' ? U : flag(last.kind === 'impulse'));
  const lastCorrPivot = [...pivots].reverse().find((x) => x.kind === 'correction');
  const lastStart = lastOf(m.impulseBars);
  add('TRD-12', !dir ? U : flag(lastStart !== undefined && lastStart > (lastCorrPivot?.idx ?? -1)));
  if (impPos < 1) {
    add('TRD-13', U);
  } else {
    const prices = [pivots[impPos - 1].price, pivots[impPos].price];
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    let inside = true;
    for (let k = pivots[impPos].idx + 1; k < bars.length; k++) {
      if (bars[k].close > hi || bars[k].close < lo) inside = false;
    }
    add('TRD-13', flag(inside));
  }

  // Trendwechsel
  const lastChange = lastOf(m.changes);
  add('TRD-15', lastChange ? flag(lastChange.to === 'up') : U);
  add('TRD-16', lastChange ? flag(lastChange.to === 'down') : U);
  const trying = m.unconfirmedBreaks > 0 || m.pendingRun > 0;
  let confirmed: CheckState = U;
  if (lastChange) confirmed = 'met';
  else if (trying) confirmed = 'unmet';
  add('TRD-17', confirmed, m.changes.length);
  const ref = dir ? [...pivots].reverse().find((x) => x.side === counterSide(dir)) : undefined;
  if (!dir || !ref) {
    add('TRD-18', U);
    add('TRD-19', U);
  } else {
    let wicks = 0;
    for (let k = ref.doneAt + 1; k < bars.length; k++) {
      const pierces = ref.side === 'support' ? bars[k].low < ref.price : bars[k].high > ref.price;
      if (pierces && !closesBeyond(bars[k], ref.price, ref.side)) wicks++;
    }
    add('TRD-18', flag(wicks > 0), wicks);
    const inner = m.cands.some(
      (c) =>
        c.isCorrection === true &&
        !c.accepted &&
        m.changes.every((ch) => ch.k <= c.doneAt) &&
        bars.slice(c.doneAt + 1).some((b) => closesBeyond(b, c.price, c.side)),
    );
    add('TRD-19', flag(inner));
  }
  if (!lastChange) {
    add('TRD-20', U);
  } else {
    const back = bars
      .slice(lastChange.k + 1)
      .some((b) => (lastChange.to === 'up' ? b.low <= lastChange.refPrice : b.high >= lastChange.refPrice));
    add('TRD-20', flag(back));
  }

  // gesunder Trend und Korrekturcharakter
  const corrPos = pivots.map((x) => x.kind).lastIndexOf('correction');
  if (!dir || corrPos < 2 || pivots[corrPos - 1].kind !== 'impulse') {
    add('TRD-21', U);
  } else {
    const [start, top, c] = [pivots[corrPos - 2], pivots[corrPos - 1], pivots[corrPos]];
    const es = extremeSide(dir);
    const impulseLen = Math.abs(top.price - start.price);
    let beyond = false;
    let reach = outward(es, top.price);
    for (let k = c.idx + 1; k < bars.length; k++) {
      if (closesBeyond(bars[k], top.price, es)) beyond = true;
      reach = Math.max(reach, outward(es, wickEnd(bars[k], es)));
    }
    const ok =
      c.len >= TRD_PARAMS.healthy.minCorrection * impulseLen &&
      beyond &&
      reach - outward(es, top.price) >= TRD_PARAMS.healthy.minExtension * impulseLen;
    add('TRD-21', flag(ok));
  }
  const growth = (lens: number[]) => lens.length >= 2 ? lens[lens.length - 1] / lens[lens.length - 2] : null;
  const regular = growth(corrLens);
  add('TRD-22', regular === null ? U : flag(regular >= TRD_PARAMS.regular.min && regular <= TRD_PARAMS.regular.max), regular ?? undefined);
  const shrinking = (lens: number[]) => {
    const tail = lens.slice(-TRD_PARAMS.shrinkCount);
    return tail.every((x, i) => i === 0 || x < tail[i - 1]);
  };
  add('TRD-23', corrLens.length < TRD_PARAMS.shrinkCount ? U : flag(shrinking(corrLens)));
  add('TRD-24', impLens.length < TRD_PARAMS.shrinkCount ? U : flag(shrinking(impLens)));

  // Zeiteinheiten
  add('TRD-25', U);
  const tradeSide = options.side;
  const c27: CheckState = !tradeSide || !higher?.dir ? U : flag(sideOf(higher.dir) === tradeSide);
  add('TRD-27', c27);
  if (!dir || !lower?.dir) {
    add('TRD-28', U);
  } else {
    // Schlusszeiten der Wechselkerzen, damit Kerzen verschiedener Zeiteinheiten vergleichbar sind
    const lowerChange = lastOf(lower.changes);
    const lowerAt = lowerChange ? lower.bars[lowerChange.k].time + TIMEFRAME_SEC[lower.tf] : -Infinity;
    const ownAt = lastChange ? bars[lastChange.k].time + TIMEFRAME_SEC[m.tf] : -Infinity;
    add('TRD-28', flag(lower.dir !== dir && ownAt <= lowerAt));
  }
  add('TRD-29', U);
  let sideways: CheckState = U;
  if (bars.length >= TRD_PARAMS.sidewaysBars) {
    const from = bars.length - TRD_PARAMS.sidewaysBars;
    sideways = flag(m.impulseBars.every((k) => k < from) && m.changes.every((c) => c.k < from));
  }
  add('TRD-30', sideways);
  add('TRD-31', !tradeSide || !dir ? U : flag(sideOf(dir) === tradeSide));
  if (!tradeSide || !dir || options.reasons === undefined) {
    add('TRD-32', U);
    add('TRD-33', U);
  } else {
    const counter = sideOf(dir) !== tradeSide;
    const total = options.reasons + (c27 === 'met' ? 1 : 0);
    add('TRD-32', counter ? flag(total >= TRD_PARAMS.reasons.counter) : 'met', total);
    add('TRD-33', counter ? 'met' : flag(total >= TRD_PARAMS.reasons.with), total);
  }

  // Linie
  add('TRD-34', !dir ? U : flag(lines.length > 0));
  const anchorsPos = dir ? pivots.map((x, i) => ({ x, i })).filter((e) => e.i >= m.originPos && e.x.side === counterSide(dir)) : [];
  if (anchorsPos.length < 2) {
    add('TRD-35', U);
  } else {
    const [a, b] = anchorsPos.slice(-2);
    add('TRD-35', flag(outward(b.x.side, b.x.price) < outward(a.x.side, a.x.price)));
  }
  add('TRD-36', line ? flag(line.replaced) : U);
  const lastCorr = lastOf(corrLens);
  let kept: CheckState = U;
  if (line && prevLine && lastCorr !== undefined && lastBar) {
    const diff = Math.abs(lineAt(line, lastBar.time) - lineAt(prevLine, lastBar.time));
    kept = flag(diff < TRD_PARAMS.lineKeep * lastCorr);
  }
  let redrawn: CheckState = U;
  if (kept !== U) redrawn = flag(kept === 'unmet');
  add('TRD-37', redrawn);
  add('TRD-38', kept);
  add('TRD-39', !line || regular === null ? U : flag(regular >= TRD_PARAMS.regular.min && regular <= TRD_PARAMS.regular.max));
  if (!line || !dir) {
    for (const id of ['TRD-40', 'TRD-41', 'TRD-42', 'TRD-43']) add(id, U);
  } else {
    const scan = scanLine(m, line);
    add('TRD-40', flag(scan.touches >= 1), scan.touches);
    add('TRD-41', flag(scan.touches >= 3), scan.touches);
    add('TRD-42', flag(!scan.violated));
    add('TRD-43', flag(scan.violated));
  }

  // Phasen und Abgleich
  const hi = [...pivots].reverse().find((x) => x.side === 'resistance');
  const lo = [...pivots].reverse().find((x) => x.side === 'support');
  if (!dir || !hi || !lo || !lastBar) {
    add('TRD-44', U);
  } else {
    const c = lastBar.close;
    const turned = dir === 'up' ? c < lo.price : c > hi.price;
    const going = dir === 'up' ? c > hi.price : c < lo.price;
    let phase = 1;
    if (turned) phase = 2;
    else if (going) phase = 0;
    add('TRD-44', flag(phase === 1), phase);
  }
  const wave = waveDeviations(m);
  add('TRD-45', wave.checked === 0 ? U : flag(wave.bad === 0), wave.bad);
  const es = dir ? extremeSide(dir) : null;
  const extremes = es ? pivots.filter((x, i) => i >= m.originPos && x.side === es) : [];
  if (extremes.length < 2 || !ref) {
    add('TRD-46', U);
  } else {
    const [a, b] = extremes.slice(-2);
    const held = !bars.slice(ref.idx + 1).some((x) => closesBeyond(x, ref.price, ref.side));
    add('TRD-46', flag(outward(b.side, b.price) < outward(a.side, a.price) && held));
  }
  if (!lastChange) {
    add('TRD-47', U);
  } else {
    const side = extremeSide(lastChange.to);
    const after = pivots.filter((x) => x.idx > lastChange.refBar && x.side === side);
    if (after.length < 2) add('TRD-47', U);
    else {
      const [a, b] = after.slice(-2);
      add('TRD-47', flag(outward(side, b.price) > outward(side, a.price)));
    }
  }
  if (!lower || corrPos < 1) {
    add('TRD-48', U);
  } else {
    const [t0, t1] = [bars[pivots[corrPos - 1].idx].time, bars[pivots[corrPos].idx].time];
    const count = lower.bars.filter((b) => b.time >= t0 && b.time <= t1).length;
    const { counts, notCounts } = TRD_PARAMS.lowerTfBars;
    let counted: CheckState = U;
    if (count >= counts) counted = 'met';
    else if (count <= notCounts) counted = 'unmet';
    add('TRD-48', counted, count);
  }

  const drawings = drawingsOf(models, m, line, regular, wave, corrPos);
  const withDrawings = checks.map((c) => ({
    ...c,
    drawings: [...new Set(drawings.filter((d) => d.rules.includes(c.id)).map((d) => d.id))],
  }));
  let verdict: Verdict = 'valid';
  if (!dir) verdict = 'forming';
  else if (sideways === 'met') verdict = 'invalid';
  const points: Candidate['points'] = {};
  pivots.slice(-4).forEach((x, i) => {
    points[`P${i + 1}`] = { time: bars[x.idx].time, price: x.price };
  });
  return {
    code: 'TRD',
    side: dir ? sideOf(dir) : 'buy',
    tf: m.tf,
    points,
    checks: withDrawings,
    drawings,
    verdict,
  };
}

function drawingsOf(
  models: Models,
  m: TrendModel,
  line: TrendLine | undefined,
  regular: number | null,
  wave: { checked: number; bad: number },
  corrPos: number,
): Drawing[] {
  const { bars, pivots, dir } = m;
  const out: Drawing[] = [];
  const at = (idx: number, price: number) => ({ time: bars[idx].time, price });
  if (!dir || pivots.length < 2) return out;
  const zigzag = pivots.map((x) => at(x.idx, x.price));
  const color = sideOf(dir);
  const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `TRD-${String(from + i).padStart(2, '0')}`);
  out.push({ id: 'Z-TRD-01', tool: 'zigzag', anchors: zigzag, rules: [...ids(1, 10), 'TRD-14'], side: color });
  for (const ch of m.changes) {
    out.push({ id: 'Z-TRD-02', tool: 'marker', anchors: [at(ch.k, bars[ch.k].close)], rules: ids(15, 20), side: sideOf(ch.to) });
  }
  pivots.slice(1).forEach((x) => {
    out.push({ id: 'Z-TRD-03', tool: 'label', anchors: [at(x.idx, x.price)], rules: ids(11, 13), side: color });
  });
  if (line) {
    out.push({
      id: 'Z-TRD-04',
      tool: 'trendline',
      anchors: [line.a, line.b],
      rules: [...ids(34, 38), ...ids(40, 43)],
      side: color,
    });
    if (regular !== null && regular >= TRD_PARAMS.regular.min && regular <= TRD_PARAMS.regular.max) {
      const es = extremeSide(dir);
      const top = pivots.slice(line.posA).filter((x) => x.side === es).sort((p, q) => outward(es, q.price) - outward(es, p.price))[0];
      if (top) {
        const shift = top.price - lineAt(line, bars[top.idx].time);
        out.push({
          id: 'Z-TRD-05',
          tool: 'trendline',
          anchors: [
            { time: line.a.time, price: line.a.price + shift },
            { time: line.b.time, price: line.b.price + shift },
          ],
          rules: ['TRD-39'],
          side: color,
        });
      }
    }
  }
  const lowerTfs = CONTEXT_TIMEFRAMES.filter((tf) => CONTEXT_TIMEFRAMES.indexOf(tf) > CONTEXT_TIMEFRAMES.indexOf(m.tf) && models.has(tf));
  if (lowerTfs.length > 0) {
    out.push({ id: 'Z-TRD-06', tool: 'zigzag', anchors: zigzag, rules: ids(25, 28), timeframes: lowerTfs, side: color });
  }
  if (wave.checked > 0) {
    out.push({
      id: 'Z-TRD-07',
      tool: 'wave',
      anchors: [at(0, 0), at(bars.length - 1, 0)],
      rules: ['TRD-45'],
    });
  }
  if (corrPos >= 1 && m.refCorrection !== null) {
    const from = pivots[corrPos - 1];
    const to = pivots[corrPos];
    const sign = to.price > from.price ? 1 : -1;
    out.push({
      id: 'Z-TRD-08',
      tool: 'zone',
      anchors: [at(from.idx, from.price), { time: bars[to.idx].time, price: from.price + sign * m.refCorrection }],
      rules: ['TRD-07', 'TRD-08', 'TRD-10'],
      side: color,
    });
  }
  return out;
}

/** Jüngster Wendepunkt-Kandidat: gezeichnet oder als zu kleine Korrektur verworfen; schwächere Fraktale derselben Seite zählen nicht */
const latestPoint = (m: TrendModel): TrdCand | null =>
  [...m.cands].reverse().find((c) => c.drawn || c.isCorrection === true) ?? null;

/** Trendzug und Prüfung je geladener Zeiteinheit (hoch → tief); Punkt-Bedingungen gelten für das jüngste Fraktal */
export function analyzeTrd(ctx: FormationContext, t: number, options: TrdOptions = {}): TrdAnalysis[] {
  const models = buildModels(ctx, t);
  return [...models.values()].map((m) => ({
    tf: m.tf,
    dir: m.dir,
    model: m,
    candidate: evaluate(models, m, options, latestPoint(m), false),
  }));
}

/** Prüft ein Fraktal als Wendepunkt; ist die Kerze nicht geschlossen oder nicht geladen, sind die Prüfungen nicht messbar */
export function checkTrdCandidate(
  ctx: FormationContext,
  t: number,
  input: TrdPointInput,
  options: TrdOptions = {},
): Candidate {
  const models = buildModels(ctx, t);
  const m = models.get(input.tf);
  const idx = m ? m.bars.findIndex((b) => b.time === input.time) : -1;
  if (!m || idx < 0) {
    const checks = TRD_CHECK_IDS.map((id) => mk(id, U));
    return { code: 'TRD', side: 'buy', tf: input.tf, points: {}, checks, drawings: [], verdict: 'forming' };
  }
  const { side } = input;
  const known = m.cands.find((c) => c.idx === idx && c.side === side);
  const synthetic: TrdCand = {
    idx,
    doneAt: idx + N,
    side,
    price: wickEnd(m.bars[idx], side),
    drawn: false,
    isCorrection: null,
    ratio: null,
    accepted: false,
  };
  return evaluate(models, m, options, known ?? synthetic, true);
}
