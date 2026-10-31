/**
 * Zug, auf dem die Formationen rechnen (Einstellung `formationZug`, Halil 2026-10-31). Der feine Zug nimmt fast jedes Fraktal
 * und filtert Korrekturen gegen die kleinste Korrektur seit dem Wechsel; daraus wählen die Formationen ihre Punkte.
 * Trendzug (`buildTrend`) ist gröber und trägt immer die Zeichnung und die TRD-Prüfung.
 */
import type { TimeframeView } from './context';
import { closesBeyond, outward, wickEnd } from './frz';
import { TRD_PARAMS, type ContextTimeframe, type FormationZug } from './params';
import {
  buildTrend,
  counterSide,
  emptyTrend,
  fractalsByDone,
  lastOf,
  legDir,
  noteImpulse,
  type TrdCand,
  type TrendDir,
  type TrendModel,
} from './trd';
import type { FormationBar } from './types';

type Bars = readonly FormationBar[];

function buildFineTrend(
  tf: ContextTimeframe,
  bars: Bars,
  wave: (number | null)[],
): TrendModel {
  const byDone = fractalsByDone(bars);
  const m = emptyTrend(tf, bars, wave);

  for (let k = 0; k < bars.length; k++) {
    // 1. Trendwechsel: Schlüsse jenseits des letzten Gegenpunkts (TRD-15 bis TRD-17)
    if (m.dir) {
      const ref = [...m.pivots].reverse().find((p) => p.side === counterSide(m.dir!));
      if (ref) {
        if (closesBeyond(bars[k], ref.price, counterSide(m.dir))) {
          m.pendingRun++;
          if (m.pendingRun >= TRD_PARAMS.fine.changeCloses) {
            const to: TrendDir = m.dir === 'up' ? 'down' : 'up';
            const refIdx = m.pivots.indexOf(ref);
            m.changes.push({ k, to, refPrice: ref.price, refIdx, refBar: ref.idx });
            m.dir = to;
            m.originPos = refIdx;
            m.pendingRun = 0;
            // die Züge seit der Bezugszone gehören zum neuen Trend: Impuls und Korrektur tauschen
            for (const p of m.pivots.slice(refIdx)) p.kind = legDir(p.side) === to ? 'impulse' : 'correction';
            refreshReference(m);
          }
        } else if (m.pendingRun > 0) {
          m.unconfirmedBreaks++;
          m.pendingRun = 0;
        }
      }
    }

    // 2. Fraktale, die mit Kerze k fertig werden (TRD-03)
    let batch = byDone.get(k) ?? [];
    // Außenkerze: Hoch- und Tief-Fraktal in einer Kerze; nur die Seite, die zum letzten Punkt wechselt, wird ein Wendepunkt
    if (batch.length === 2 && batch[0].idx === batch[1].idx) {
      const prev = lastOf(m.pivots);
      batch = prev ? batch.filter((c) => c.side !== prev.side) : batch.slice(0, 1);
    }
    for (const c of batch) {
      const price = wickEnd(bars[c.idx], c.side);
      const cand: TrdCand = {
        idx: c.idx,
        doneAt: k,
        side: c.side,
        price,
        drawn: false,
        isCorrection: null,
        ratio: null,
        accepted: false,
      };
      m.cands.push(cand);
      const last = lastOf(m.pivots);
      if (!last) {
        m.pivots.push({ idx: c.idx, doneAt: k, side: c.side, price, kind: 'start', len: 0 });
        cand.drawn = true;
        continue;
      }
      if (last.side === c.side) {
        // TRD-05, TRD-06: nur das äußerste Extrem einer Seite bleibt
        if (outward(c.side, price) > outward(c.side, last.price)) {
          const before = m.pivots[m.pivots.length - 2];
          const old = m.cands.find((x) => x.drawn && x.idx === last.idx && x.side === last.side);
          if (old) old.drawn = false;
          last.idx = c.idx;
          last.doneAt = k;
          last.price = price;
          last.len = before ? Math.abs(price - before.price) : 0;
          cand.drawn = true;
          cand.isCorrection = last.kind === 'correction';
          cand.accepted = true;
          if (last.kind === 'correction') {
            // Verhältnis zur Referenz ohne diesen Punkt, dann die Referenz neu
            const others = m.pivots.slice(m.originPos, -1).filter((p) => p.kind === 'correction').map((p) => p.len);
            cand.ratio = others.length === 0 ? null : last.len / Math.min(...others);
            refreshReference(m);
          }
        }
        continue;
      }
      const segDir = legDir(c.side);
      const len = Math.abs(price - last.price);
      if (!m.dir) {
        m.dir = segDir;
        m.originPos = 0;
        m.pivots.push({ idx: c.idx, doneAt: k, side: c.side, price, kind: 'impulse', len });
        cand.drawn = true;
        continue;
      }
      if (segDir === m.dir) {
        m.pivots.push({ idx: c.idx, doneAt: k, side: c.side, price, kind: 'impulse', len });
        cand.drawn = true;
        continue;
      }
      // ein zweites, schwächeres Fraktal derselben Seite hinter einer verworfenen Korrektur zählt nicht als eigene Korrektur
      const folded = m.cands.find((x) => x !== cand && x.isCorrection && !x.accepted && x.side === c.side && x.idx > last.idx);
      if (folded && outward(c.side, price) <= outward(c.side, folded.price)) continue;
      cand.isCorrection = true;
      cand.ratio = m.refCorrection === null ? null : len / m.refCorrection;
      if (cand.ratio === null || cand.ratio >= TRD_PARAMS.fine.ownWave) {
        cand.accepted = true;
        cand.drawn = true;
        m.pivots.push({ idx: c.idx, doneAt: k, side: c.side, price, kind: 'correction', len });
        refreshReference(m);
      }
    }

    noteImpulse(m, k);
  }
  return m;
}

/** Referenzkorrektur = kleinste gezeichnete Korrektur seit dem letzten Wechsel (TRD-09) */
function refreshReference(m: TrendModel): void {
  const lens = m.pivots.slice(m.originPos).filter((p) => p.kind === 'correction').map((p) => p.len);
  m.refCorrection = lens.length === 0 ? null : Math.min(...lens);
}

/** Trendzug der Formationen über die Kerzen bis einschließlich `upTo` */
export function formationTrend(view: TimeframeView, upTo: number = view.bars.length - 1): TrendModel {
  const bars = view.bars.slice(0, upTo + 1);
  const wave = view.wave.slice(0, upTo + 1);
  return view.zug === 'trend' ? buildTrend(view.tf, bars, wave) : buildFineTrend(view.tf, bars, wave);
}

/** Schlüsse jenseits der Bezugszone für den Trendwechsel im jeweiligen Zug (TRD-17) */
export const formationCloses = (zug: FormationZug): number =>
  zug === 'trend' ? TRD_PARAMS.changeCloses : TRD_PARAMS.fine.changeCloses;
