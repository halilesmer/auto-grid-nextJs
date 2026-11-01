/**
 * Kontext mehrerer Zeiteinheiten (FRZ-27) für die Prüfung einer Formation.
 * Die Indikatoren werden je Zeiteinheit einmal über die ganze Reihe gerechnet. Sie sind kausal,
 * deshalb gibt `view(tf, t)` nur geschlossene Kerzen bis t frei: kein Blick in die Zukunft
 * (docs/analyse-regeln.md, BKT-09). So taugt dieselbe Erkennung später für Backtest und Alarm.
 */
import { TIMEFRAME_SEC, type MissingRange } from '@/lib/analysis/candles';
import { gapBetween } from '@/lib/analysis/fractals';
import { atrSeries, narrowRange, rsi, wave, wideRange, type Series } from './indicators';
import { CONTEXT_TIMEFRAMES, TRD_PARAMS, type ContextTimeframe, type FormationZug } from './params';
import type { FormationBar } from './types';

export interface TimeframeView {
  tf: ContextTimeframe;
  /** Zug, auf dem die Formationen rechnen */
  zug: FormationZug;
  bars: FormationBar[];
  rsi: Series;
  wave: Series;
  atr: Series;
  wide: (boolean | null)[];
  narrow: (boolean | null)[];
}

type GapRange = Pick<MissingRange, 'from' | 'to'>;

/** Kerzen einer Zeiteinheit, optional mit den fehlenden Datenbereichen (wie im Chart: sie trennen Fraktal-Nachbarn) */
export type TimeframeInput = readonly FormationBar[] | { bars: readonly FormationBar[]; missing: readonly GapRange[] };

export type ContextInput = Partial<Record<ContextTimeframe, TimeframeInput>>;

/** Kopie der Kerzen; wo ein fehlender Bereich zwischen zwei Kerzen liegt, trägt die spätere `gapBefore` */
function markGaps(bars: readonly FormationBar[], missing: readonly GapRange[]): FormationBar[] {
  if (missing.length === 0) return [...bars];
  return bars.map((b, i) => (i > 0 && gapBetween(missing, bars[i - 1].time, b.time) ? { ...b, gapBefore: true } : b));
}

export class FormationContext {
  readonly symbol: string;
  private readonly full = new Map<ContextTimeframe, TimeframeView>();

  constructor(symbol: string, input: ContextInput, options: { zug?: FormationZug } = {}) {
    this.symbol = symbol;
    const zug = options.zug ?? TRD_PARAMS.formationZug;
    for (const tf of CONTEXT_TIMEFRAMES) {
      const given = input[tf];
      if (!given) continue;
      const missing = 'bars' in given ? given.missing : [];
      const bars = 'bars' in given ? given.bars : given;
      for (let i = 0; i < bars.length; i++) {
        const b = bars[i];
        if (![b.time, b.open, b.high, b.low, b.close].every(Number.isFinite)) {
          throw new Error(`Kerzen ${tf}: keine endliche Zahl bei Index ${i}`);
        }
      }
      for (let i = 1; i < bars.length; i++) {
        if (!(bars[i].time > bars[i - 1].time)) {
          throw new Error(`Kerzen ${tf}: Zeit nicht streng steigend bei Index ${i}`);
        }
      }
      this.full.set(tf, {
        tf,
        zug,
        bars: markGaps(bars, missing),
        rsi: rsi(bars),
        wave: wave(bars),
        atr: atrSeries(bars),
        wide: wideRange(bars),
        narrow: narrowRange(bars),
      });
    }
  }

  /** Zeiteinheiten, für die Kerzen geladen sind (hoch → tief) */
  timeframes(): ContextTimeframe[] {
    return CONTEXT_TIMEFRAMES.filter((tf) => this.full.has(tf));
  }

  /** Anzahl Kerzen von `tf`, die zum Zeitpunkt t (MT5-Sekunden) geschlossen sind: time + Dauer ≤ t */
  closedCount(tf: ContextTimeframe, t: number): number {
    const view = this.full.get(tf);
    if (!view) return 0;
    const dur = TIMEFRAME_SEC[tf];
    let lo = 0;
    let hi = view.bars.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (view.bars[mid].time + dur <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Geschlossene Kerzen und Indikatoren von `tf` zum Zeitpunkt t; null, wenn `tf` nicht geladen ist */
  view(tf: ContextTimeframe, t: number): TimeframeView | null {
    const view = this.full.get(tf);
    if (!view) return null;
    const n = this.closedCount(tf, t);
    return {
      tf,
      zug: view.zug,
      bars: view.bars.slice(0, n),
      rsi: view.rsi.slice(0, n),
      wave: view.wave.slice(0, n),
      atr: view.atr.slice(0, n),
      wide: view.wide.slice(0, n),
      narrow: view.narrow.slice(0, n),
    };
  }
}
