/**
 * C-Bein (2026-11-16): AB=CD, deren D (Level 1) noch nicht erreicht ist. Von C zu Level 1 läuft ein Handel gegen die Richtung des AB=CD-Handels
 * (A → B Richtung; beim Verkauf-AB=CD ein Kauf). Reine Rechnung ohne Abhängigkeiten von der Anzeige. Die Zeilen stehen in `Trade.cLeg.rows`,
 * nicht in `candidate.checks`: Urteil, Punkte, `invalidBy`, Alarm und Favoriten ändern sich nicht. Nur der Handelsblock zeigt es.
 *
 * Sichtbar: kein D-Level erreicht, kein Erken dönüş, und seit C hat keine Kerze jenseits des Stops geschlossen (sonst verbraucht, wie beim Wiedereinstieg).
 * Pflicht: Korrektur mindestens 0,382; Handel in Richtung des höheren Trends (A → B); keine Wave-Divergenz an den B-Hochs (Verkauf-AB=CD; Kauf gespiegelt).
 * Verstärkung: Zone am C (Engulf-Zone oder sehr starke Fraktalzone der C-Bein-Seite, vor der C-Kerze entstanden, vom C berührt); Umkehrkerze in der tieferen
 * Zeiteinheit ist Pflicht, wenn es keine Zone gibt, sonst Verstärkung; „AB=CD in der tieferen Zeiteinheit“ ist Verstärkung und noch nicht messbar.
 * Werte nur, wenn alle Pflichtzeilen erfüllt sind: mit Zone Einstieg = nahe Kante, Stop = ferne Kante; sonst mit Umkehrkerze Einstieg = Schluss,
 * Stop = Spitze der Kerze; Ziel = Level 1. Der Not-SL kommt vom Aufrufer (ATR). Keine Aufteilung, kein Stand danach.
 */
import { ABCD_PARAMS, type ContextTimeframe } from './params';
import type { AbcdShape } from './abcd';
import type { Rect, ZoneSide } from './frz';
import { neighborTf, touches, type Env } from './reasons';
import { reversalCandleAt } from './reversal';
import { divergenceOf, zoneSideOf, type EngulfZone } from './sig';
import { emergencyStopOf } from './trade';
import type { TrendModel } from './trd';
import type { CheckState, CLeg, CLegRow, FormationBar, Side } from './types';

export interface CLegFractalZone {
  side: ZoneSide;
  rect: Rect;
  strength: 0 | 1 | 2;
  /** Öffnungszeiten der Fraktalkerzen; eine Zone, die erst bei oder nach der C-Kerze fertig wird, zählt nicht */
  fractalTimes: readonly number[];
}

/** Umkehrkerze der tieferen Zeiteinheit am C (Zustand, bei ☑ Schluss, Spitze und Zeiteinheit) */
export interface LowerCandle {
  state: CheckState;
  close?: number;
  tip?: number;
  tf?: string;
}

/**
 * Tepelerde uyumsuzluk yok: Wave-Divergenz zwischen B und dem vorigen Wendepunkt derselben Seite (Annahme: der vorige Wendepunkt von B auf B's Seite).
 * ☑ = keine Divergenz; ohne vorigen Punkt oder ohne Wave-Wert nicht messbar.
 */
export function noPeakDivergence(trend: TrendModel, s: AbcdShape): CheckState {
  const prev = [...trend.pivots].reverse().find((p) => p.side === s.es && p.idx < s.b.idx);
  if (!prev) return 'unmeasurable';
  const div = divergenceOf(trend, s.es, prev.idx, s.b.idx);
  if (!div || div.a.wave === null || div.b.wave === null) return 'unmeasurable';
  return div.tie ? 'unmet' : 'met';
}

/** Umkehrkerze in C-Bein-Richtung in der nächsttieferen geladenen Zeiteinheit ab der C-Kerze (wie `lowerReversal` im Harmonik-Code) */
export function lowerCandleAt(env: Env, tf: ContextTimeframe, s: AbcdShape): LowerCandle {
  const lower = neighborTf(env, tf, 1);
  const view = lower ? env.views.get(lower) : undefined;
  const base = env.views.get(tf);
  if (!lower || !view || !base) return { state: 'unmeasurable' };
  const from = base.bars[s.c.idx].time;
  if (view.bars.length === 0 || view.bars[0].time > from) return { state: 'unmeasurable' };
  const side: Side = s.side === 'sell' ? 'buy' : 'sell';
  const r = reversalCandleAt(env, tf, side, s.c, [lower]);
  return { state: r.state, ...(r.close === undefined ? {} : { close: r.close }), ...(r.tip === undefined ? {} : { tip: r.tip }), ...(r.tf ? { tf: r.tf } : {}) };
}

export function cLegOf(o: {
  bars: readonly FormationBar[];
  s: AbcdShape;
  /** D (Level 1, mit Toleranz) erreicht: dann zeigt der Block das D-Handel */
  reached: boolean;
  /** Erken dönüş liegt vor */
  early: boolean;
  /** ABCD-14: höherer Trend läuft in Richtung des AB=CD-Handels; null = nicht messbar */
  withTrend: boolean | null;
  /** ☑ = keine Divergenz an den B-Hochs (`noPeakDivergence`) */
  noDivergence: CheckState;
  engulfZones: readonly EngulfZone[];
  zones: readonly CLegFractalZone[];
  candle: LowerCandle;
  atr: number | null;
}): CLeg | null {
  const { bars, s } = o;
  const cBar = bars[s.c.idx];
  if (o.reached || o.early || !cBar || s.depth === null || s.len === 0) return null;
  const side: Side = s.side === 'sell' ? 'buy' : 'sell';
  const up = side === 'buy';
  // „günstig“ = in Richtung des C-Beins
  const gain = (p: number) => (up ? p : -p);
  const far = (r: Rect) => (up ? r.bottom : r.top);
  const near = (r: Rect) => (up ? r.top : r.bottom);
  const consumed = (from: number, stop: number) => bars.slice(from).some((b) => gain(b.close) < gain(stop));

  // Zonen am C: vor der C-Kerze entstanden und von ihr berührt; Engulf-Zonen und sehr starke Fraktalzonen (Annahme: Stärke 2)
  type Cand = { rect: Rect; kind: 'engulf' | 'fractal'; from: number };
  const cands: Cand[] = [
    ...o.engulfZones.filter((z) => z.side === side && z.idx < s.c.idx && touches(z.rect, cBar)).map((z): Cand => ({ rect: z.rect, kind: 'engulf', from: z.idx + 1 })),
    ...o.zones
      .filter((z) => z.side === zoneSideOf(side) && z.strength === 2 && z.fractalTimes.every((ft) => ft < cBar.time) && touches(z.rect, cBar))
      .map((z): Cand => ({ rect: z.rect, kind: 'fractal', from: s.c.idx + 1 })),
  ].sort((p, q) => gain(far(q.rect)) - gain(far(p.rect)));
  const live = cands.filter((z) => !consumed(z.from, far(z.rect)));
  // Alle Zonen am C verbraucht: der Kurs ist durch die Zone geschlossen, das C-Bein ist erledigt
  if (cands.length > 0 && live.length === 0) return null;
  const zone = live[0] ?? null;

  const candle = o.candle;
  const candleUsable = !zone && candle.state === 'met' && candle.close !== undefined && candle.tip !== undefined;
  if (candleUsable && consumed(s.c.idx + 1, candle.tip!)) return null;

  // ABCD-14 misst „höherer Trend in Richtung des AB=CD-Handels“; das C-Bein braucht das Gegenteil (Trend A → B)
  let trendState: CheckState = 'unmeasurable';
  if (o.withTrend !== null) trendState = o.withTrend ? 'unmet' : 'met';
  const rows: CLegRow[] = [
    { key: 'depth', kind: 'required', state: s.depth >= ABCD_PARAMS.minCorrection ? 'met' : 'unmet', value: s.depth },
    { key: 'trend', kind: 'required', state: trendState },
    { key: 'noDivergence', kind: 'required', state: o.noDivergence },
    { key: 'zone', kind: 'bonus', state: zone ? 'met' : 'unmet', ...(zone ? { value: zone.kind } : {}) },
    { key: 'candle', kind: zone ? 'bonus' : 'required', state: candle.state, ...(candle.state === 'met' && candle.tf ? { value: candle.tf } : {}) },
    { key: 'lowerAbcd', kind: 'bonus', state: 'unmeasurable' },
  ];
  const ok = rows.every((r) => r.kind !== 'required' || r.state === 'met');
  const none: CLeg = { side, rows, variant: null, entry: null, stop: null, emergencyStop: null, target: null };
  if (!ok) return none;
  if (zone) {
    const stop = far(zone.rect);
    return { side, rows, variant: 'zone', entry: near(zone.rect), stop, emergencyStop: emergencyStopOf(stop, side, o.atr), target: s.level1 };
  }
  if (candleUsable) {
    const stop = candle.tip!;
    return { side, rows, variant: 'candle', entry: candle.close!, stop, emergencyStop: emergencyStopOf(stop, side, o.atr), target: s.level1 };
  }
  return none;
}
