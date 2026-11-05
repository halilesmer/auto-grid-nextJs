/**
 * Trendzug der Formationen (Halil 2026-11-05): Formationen rechnen nur auf dem Zug des Nutzers (`buildTrend` mit seinen
 * Einstellungen), derselben Linie, die der Chart zeichnet. Es gibt keinen eigenen feinen Zug mehr.
 */
import type { TimeframeView } from './context';
import type { TrendOptions } from './params';
import { buildTrend, type TrendDir, type TrendModel } from './trd';

/** Trendzug der Formationen über die Kerzen bis einschließlich `upTo` */
export function formationTrend(view: TimeframeView, upTo: number = view.bars.length - 1): TrendModel {
  const bars = view.bars.slice(0, upTo + 1);
  const wave = view.wave.slice(0, upTo + 1);
  // W1 hat kein eigenes Trendmodell-Etikett: `tf` wirkt nur in der Zonengeometrie (Manipulation nur H4); das W1-Modell wird nur auf Richtung und Divergenz gelesen
  const tf = view.tf === 'W1' ? 'D1' : view.tf;
  return buildTrend(tf, bars, wave, view.trend);
}

/** Bereich von `withTrendDirMemo`: die Trendrichtung je Kerzenansicht (nach Objekt) und letzter Kerze */
let dirMemo: WeakMap<TimeframeView, Map<number, TrendDir | null>> | null = null;

/**
 * Führt `fn` so aus, dass `formationTrendDir` je Kerzenansicht und letzter Kerze nur einmal rechnet (FRM-18).
 * Die Ansicht muss unverändert bleiben; der Bereich gilt nur für synchrones `fn`. Ein innerer Bereich nutzt den äußeren weiter.
 */
export function withTrendDirMemo<T>(fn: () => T): T {
  if (dirMemo) return fn();
  dirMemo = new WeakMap();
  try {
    return fn();
  } finally {
    dirMemo = null;
  }
}

/** Richtung von `formationTrend(view, upTo)`; im Bereich von `withTrendDirMemo` je Ansicht und Kerze nur einmal gerechnet */
export function formationTrendDir(view: TimeframeView, upTo: number): TrendDir | null {
  if (!dirMemo) return formationTrend(view, upTo).dir;
  let byIdx = dirMemo.get(view);
  if (!byIdx) dirMemo.set(view, (byIdx = new Map()));
  if (byIdx.has(upTo)) return byIdx.get(upTo) ?? null;
  const dir = formationTrend(view, upTo).dir;
  byIdx.set(upTo, dir);
  return dir;
}

/** Schlüsse jenseits der Bezugszone für den Trendwechsel (TRD-17) laut Einstellung des Nutzers */
export const formationCloses = (trend: TrendOptions): number => trend.changeCloses;
