/**
 * Kerzen-Fixtures der Formationstests: Symbol, Zeiteinheit, Zeit + OHLC, ohne Herkunftsangabe.
 * Das Script scripts/formation-fixture.mjs schreibt sie; die Tests lesen sie ohne VPS.
 */
import { isTimeframe, type Timeframe } from '@/lib/analysis/candles';
import type { FormationBar } from './types';

export interface FormationFixture {
  symbol: string;
  timeframe: Timeframe;
  bars: FormationBar[];
}

/** Prüft die Form einer Fixture-Datei (Systemgrenze: Datei); wirft bei jedem Fehler mit dem Index */
export function parseFixture(raw: unknown): FormationFixture {
  if (typeof raw !== 'object' || raw === null) throw new Error('Fixture: Objekt erwartet');
  const { symbol, timeframe, bars } = raw as Record<string, unknown>;
  if (typeof symbol !== 'string' || symbol === '') throw new Error('Fixture: symbol fehlt');
  if (typeof timeframe !== 'string' || !isTimeframe(timeframe)) throw new Error('Fixture: timeframe ungültig');
  if (!Array.isArray(bars)) throw new Error('Fixture: bars fehlt');
  const out: FormationBar[] = bars.map((b, i) => {
    const { time, open, high, low, close } = (b ?? {}) as Record<string, unknown>;
    const nums = [time, open, high, low, close];
    if (!nums.every((v) => typeof v === 'number' && Number.isFinite(v))) {
      throw new Error(`Fixture: Kerze ${i} hat keine endliche Zahl`);
    }
    const [tm, o, h, l, c] = nums as number[];
    if (h < Math.max(o, c) || l > Math.min(o, c) || h < l) throw new Error(`Fixture: Kerze ${i} hat ungültiges OHLC`);
    return { time: tm, open: o, high: h, low: l, close: c };
  });
  for (let i = 1; i < out.length; i++) {
    if (!(out[i].time > out[i - 1].time)) throw new Error(`Fixture: Zeit nicht streng steigend bei Kerze ${i}`);
  }
  return { symbol, timeframe, bars: out };
}
