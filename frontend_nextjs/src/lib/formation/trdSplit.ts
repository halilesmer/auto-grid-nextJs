/**
 * Langer Schenkel (Halil 2026-11-26, 1125-A2.1 bis A2.4, 1126-A5, 1126-A12): Läuft der Schenkel der Regel `welle382` weit über den vorigen hinaus,
 * bleibt die Linie nicht an alten Punkten hängen. Sie sucht im Schenkel ein AB=CD und teilt ihn dort. Die inneren Punkte sind nur die Spitzen der
 * EWO-Wellen (zweiter Lauf mit der Regel `welle`, der selbst nicht teilt). Die Teilung ändert die Punkte des Zugs, damit auch Trendrichtung und Formationen.
 * Zwei Auslöser: C kommt (Fraktal der Gegenseite, das die Basisregel ablehnt) oder, als Rückfall, der Schenkel wird weiter verlängert.
 */
import { outward, type ZoneSide } from './frz';
import { wave } from './indicators';
import type { LegMeasure, TrendOptions } from './params';
import type { Pivot } from './trd';
import type { ZugEdit, ZugPoint } from './trdZug';

type P = ZugPoint;
type Rule = (zug: readonly Pivot[], f: P) => ZugEdit | null;

/** Tiefe der Gegenbewegung C im Schenkel AB (Anteil von AB) */
const DEPTH_MIN = 0.382;
const DEPTH_MAX = 0.728;
/** Wie weit der Kurs nach C schon weitergelaufen sein darf (Anteil von AB, Auslöser Verlängerung) */
const CD_MAX = 1.618;

const out = (side: ZoneSide, price: number): number => outward(side, price);
const beyond = (side: ZoneSide, a: P, b: P): boolean => out(side, a.price) > out(side, b.price);

/** Ein innerer Lauf über die EWO-Wellen: schreitet bis Kerze n − 1 und gibt seine Punkte frei */
export interface InnerRun {
  advanceTo(n: number): void;
  readonly pivots: readonly P[];
}

export interface SplitConfig {
  measure: LegMeasure;
  mult: number;
  atrMult: number;
  bars: number;
  atr: readonly number[];
  inner: () => InnerRun;
}

/** Hat der EWO zwischen `idx` und `doneAt` des Fraktals die Farbe seiner Seite? */
const sideColor = (ewo: readonly (number | null)[], f: P): boolean => {
  for (let i = f.idx; i <= f.doneAt; i++) {
    const v = ewo[i];
    if (v !== null && v !== undefined && (v > 0 ? 'resistance' : 'support') === f.side) return true;
  }
  return false;
};

export function legSplitRule(opt: TrendOptions, bars: Parameters<typeof wave>[0], base: Rule, cfg: SplitConfig): Rule {
  if (cfg.measure === 'off') return base;
  const ewo = wave(bars, opt.ewoFast, opt.ewoSlow, opt.ewoSource);
  let inner: InnerRun | null = null;
  const pool = (doneAt: number): readonly P[] => {
    inner ??= cfg.inner();
    inner.advanceTo(doneAt + 1);
    return inner.pivots;
  };
  const tooLong = (legLen: number, refLen: number | null, startIdx: number, endIdx: number): boolean => {
    if (cfg.measure === 'mult') return refLen !== null && legLen > cfg.mult * refLen;
    if (cfg.measure === 'atr') return legLen > cfg.atrMult * cfg.atr[endIdx];
    return endIdx - startIdx > cfg.bars;
  };
  const within = (list: readonly P[], side: ZoneSide, from: number, to: number): P[] => list.filter((x) => x.side === side && x.idx > from && x.idx < to);
  const most = (side: ZoneSide, list: readonly P[]): P | null => (list.length ? list.reduce((b, x) => (beyond(side, x, b) ? x : b)) : null);

  return (zug, f) => {
    const edit = base(zug, f);
    const n = zug.length;
    const last = zug[n - 1];
    const s = zug[n - 2];
    const p = zug[n - 3];
    if (!last || !s) return edit;
    const ref = p ? Math.abs(s.price - p.price) : null;

    // Auslöser 1: C kommt. Die Basisregel lehnt das Gegenfraktal ab, der Schenkel S → B (B = letzter Punkt) ist zu lang
    if (!edit && f.side !== last.side && f.idx > last.idx && sideColor(ewo, f)) {
      const legLen = Math.abs(last.price - s.price);
      if (tooLong(legLen, ref, s.idx, last.idx)) {
        const all = pool(f.doneAt);
        const As: P[] = [s, ...within(all, s.side, s.idx, last.idx).filter((x) => out(s.side, x.price) < out(s.side, s.price))];
        for (const A of As) {
          const L0 = A === s ? null : most(last.side, within(all, last.side, s.idx, A.idx));
          if (A !== s && (!L0 || !beyond(s.side, A, L0))) continue;
          if (within(all, s.side, A.idx, last.idx).some((x) => beyond(s.side, x, A))) continue;
          if (!beyond(s.side, A, f)) continue;
          const depth = Math.abs(f.price - last.price) / Math.abs(A.price - last.price);
          if (depth < DEPTH_MIN || depth > DEPTH_MAX) continue;
          return A === s ? { cut: 0, add: [f] } : { cut: 1, add: [L0 as P, A, last, f] };
        }
      }
    }

    // Auslöser 2 (Rückfall): die Basisregel verlängert den letzten Punkt in Schenkelrichtung und der Schenkel S → f ist zu lang
    if (edit && edit.cut === 1 && last.side === f.side) {
      const legLen = Math.abs(f.price - s.price);
      if (tooLong(legLen, ref, s.idx, f.idx)) {
        const all = pool(f.doneAt);
        const As: P[] = [s, ...within(all, s.side, s.idx, f.idx).filter((x) => out(s.side, x.price) < out(s.side, s.price))];
        for (const A of As) {
          const L0 = A === s ? null : most(f.side, within(all, f.side, s.idx, A.idx));
          if (A !== s && (!L0 || !beyond(s.side, A, L0))) continue;
          for (const B of within(all, f.side, A.idx, f.idx)) {
            if (within(all, s.side, A.idx, B.idx).some((x) => beyond(s.side, x, A))) continue;
            const C = most(s.side, within(all, s.side, B.idx, f.idx));
            if (!C || !beyond(s.side, A, C) || !beyond(s.side, C, B)) continue;
            if (most(f.side, within(all, f.side, A.idx, C.idx)) !== B) continue;
            if (!beyond(f.side, f, B)) continue;
            const ab = Math.abs(A.price - B.price);
            const depth = Math.abs(C.price - B.price) / ab;
            if (depth < DEPTH_MIN || depth > DEPTH_MAX || Math.abs(C.price - f.price) / ab > CD_MAX) continue;
            return A === s ? { cut: 1, add: [B, C, f] } : { cut: 1, add: [L0 as P, A, B, C, f] };
          }
        }
      }
    }
    return edit;
  };
}
