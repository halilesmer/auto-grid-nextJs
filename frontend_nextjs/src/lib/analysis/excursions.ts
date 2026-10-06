/**
 * MFE/MAE echter Trades (ANA-12, docs/analyse-regeln.md §4): größter Zwischengewinn (MFE) und größter
 * Zwischenverlust (MAE) eines Trades aus M1-Kerzen. Gezählt werden nur Kerzen strikt zwischen Einstiegs-
 * und Ausstiegskerze plus Ein- und Ausstiegspreis; von den Randkerzen ist nicht bekannt, was vor dem
 * Einstieg bzw. nach dem Ausstieg lag. Der Wert ist deshalb eine Untergrenze („geschätzt“).
 * Kerzen sind Bid: BUY schließt zum Bid, SELL zum Ask = Bid + Spread der Kerze × point.
 * Fehlen Kerzen in der Spanne, ist der Wert nicht berechenbar, nie 0.
 */
import type { Bar, MissingRange } from './candles';
import type { Trade } from './tradePairing';

const M1 = 60;
/** Höchstens so viele M1-Kerzen je Symbol und Knopfdruck (zwei Antworten des Workers) */
export const MAX_EXCURSION_BARS = 100_000;

/** Geladene M1-Kerzen eines Symbols */
export interface M1Data {
  bars: Bar[];
  /** Spread je Kerze in Punkten, parallel zu `bars` (null = unbekannt) */
  spread: (number | null)[];
  missing: MissingRange[];
  /** Geladener Bereich [from, to), MT5-Sekunden */
  from: number;
  to: number;
  point: number | null;
}

/**
 * notLoaded, busy und noPoint können beim nächsten Knopfdruck anders ausgehen (Spanne nachgeladen, Konto
 * nicht mehr beschäftigt); die übrigen Gründe sind endgültig.
 */
export type ExcursionReason = 'noEntry' | 'tooLong' | 'notLoaded' | 'busy' | 'missing' | 'noSpread' | 'noPoint';

/** Ein Ergebnis, das ein erneuter Knopfdruck nicht ändern kann */
export function isFinal(r: Excursion): boolean {
  return r.ok || !(r.reason === 'notLoaded' || r.reason === 'busy' || r.reason === 'noPoint');
}

/** Fehlende Bereiche, die nur vorübergehend fehlen (Konto beschäftigt, MT5-Fehler) */
const TRANSIENT_GAPS = new Set(['busy', 'error']);

export type Excursion =
  | {
      ok: true;
      /** Preisabstände (≥ 0) */
      mfe: number;
      mae: number;
      /** in Punkten (Abstand ÷ point) */
      mfePts: number;
      maePts: number;
      /** in Kontowährung, aus dem Trade selbst (Gewinn ÷ Preisabstand); null bei Ausstieg = Einstieg */
      mfeMoney: number | null;
      maeMoney: number | null;
    }
  | { ok: false; reason: ExcursionReason };

/** Kerzen strikt zwischen Einstiegs- und Ausstiegskerze: [from, to), leer wenn to ≤ from */
export function interiorSpan(entryTime: number, exitTime: number): { from: number; to: number } {
  return { from: Math.floor(entryTime / M1) * M1 + M1, to: Math.floor(exitTime / M1) * M1 };
}

function firstIndexAtOrAfter(bars: Bar[], time: number): number {
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** MFE/MAE eines Trades. `m1`: geladene Kerzen seines Symbols (null = nicht geladen). */
export function excursion(trade: Trade, m1: M1Data | null): Excursion {
  if (trade.entryTime === null || trade.entryPrice === null) return { ok: false, reason: 'noEntry' };
  const span = interiorSpan(trade.entryTime, trade.exitTime);
  if ((span.to - span.from) / M1 > MAX_EXCURSION_BARS) return { ok: false, reason: 'tooLong' };
  if (!m1) return { ok: false, reason: 'notLoaded' };
  const point = m1.point;
  if (!point || !(point > 0)) return { ok: false, reason: 'noPoint' };

  const entry = trade.entryPrice;
  const exit = trade.exitPrice;
  // Extreme in Schließpreisen der Position (BUY: Bid, SELL: Ask); Ein- und Ausstiegspreis zählen immer
  let high = Math.max(entry, exit);
  let low = Math.min(entry, exit);
  if (span.to > span.from) {
    if (span.from < m1.from || span.to > m1.to) return { ok: false, reason: 'notLoaded' };
    const gaps = m1.missing.filter((m) => m.from < span.to && m.to > span.from);
    if (gaps.length > 0) {
      const onlyTransient = gaps.every((m) => TRANSIENT_GAPS.has(m.reason));
      return { ok: false, reason: onlyTransient ? 'busy' : 'missing' };
    }
    // Kerzen ohne `missing`-Eintrag, die fehlen, sind Marktpausen
    for (let i = firstIndexAtOrAfter(m1.bars, span.from); i < m1.bars.length && m1.bars[i].time < span.to; i++) {
      const bar = m1.bars[i];
      let add = 0;
      if (trade.side === 'sell') {
        const s = m1.spread[i];
        if (s === null || s === undefined || !Number.isFinite(s)) return { ok: false, reason: 'noSpread' };
        add = s * point;
      }
      high = Math.max(high, bar.high + add);
      low = Math.min(low, bar.low + add);
    }
  }

  const mfe = trade.side === 'buy' ? Math.max(0, high - entry) : Math.max(0, entry - low);
  const mae = trade.side === 'buy' ? Math.max(0, entry - low) : Math.max(0, high - entry);
  const move = Math.abs(exit - entry);
  const perPrice = move >= point / 2 ? Math.abs(trade.profit / move) : null;
  return {
    ok: true,
    mfe,
    mae,
    mfePts: mfe / point,
    maePts: mae / point,
    mfeMoney: perPrice !== null ? mfe * perPrice : null,
    maeMoney: perPrice !== null ? mae * perPrice : null,
  };
}

/**
 * Zu ladende M1-Spanne je Symbol: neueste Trades zuerst, bis die Spanne MAX_EXCURSION_BARS Minuten
 * überschreiten würde. Ältere Trades außerhalb der Spanne bleiben „nicht geladen“.
 * Trades ohne Einstieg, ohne Zwischenkerze oder selbst länger als die Obergrenze (tooLong) brauchen keine Kerzen.
 */
export function m1Spans(trades: Trade[], maxBars = MAX_EXCURSION_BARS): Map<string, { from: number; to: number; capped: boolean }> {
  const spans = new Map<string, { from: number; to: number; capped: boolean }>();
  const newestFirst = [...trades].sort((a, b) => b.exitTime - a.exitTime);
  for (const tr of newestFirst) {
    if (tr.entryTime === null) continue;
    const s = interiorSpan(tr.entryTime, tr.exitTime);
    if (s.to <= s.from || (s.to - s.from) / M1 > maxBars) continue;
    const cur = spans.get(tr.symbol);
    if (!cur) {
      spans.set(tr.symbol, { ...s, capped: false });
      continue;
    }
    if (cur.capped) continue;
    const from = Math.min(cur.from, s.from);
    const to = Math.max(cur.to, s.to);
    if ((to - from) / M1 <= maxBars) spans.set(tr.symbol, { from, to, capped: false });
    else cur.capped = true;
  }
  return spans;
}
