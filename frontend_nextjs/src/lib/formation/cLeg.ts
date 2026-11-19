/**
 * C-Bein (2026-11-16): AB=CD, deren D (Level 1) noch nicht erreicht ist. Von C zu Level 1 läuft ein Handel gegen die Richtung des AB=CD-Handels
 * (A → B Richtung; beim Verkauf-AB=CD ein Kauf). Reine Rechnung ohne Abhängigkeiten von der Anzeige. Die Zeilen stehen in `Trade.cLeg.rows`,
 * nicht in `candidate.checks`: Urteil, Punkte, `invalidBy`, Alarm und Favoriten ändern sich nicht. Nur der Handelsblock zeigt es.
 *
 * Sichtbar: kein D-Level erreicht, kein Erken dönüş, und seit C hat keine Kerze jenseits des Stops geschlossen (sonst verbraucht, wie beim Wiedereinstieg).
 * Pflicht: Korrektur von 0,382 bis 0,728 (`ABCD_PARAMS.minCorrection` bis `maxCorrection`, wie ABCD-04/06; tiefer ist der Kandidat ungültig); Handel in Richtung des höheren Trends (A → B); keine Wave-Divergenz an den B-Hochs (Verkauf-AB=CD; Kauf gespiegelt).
 * Verstärkung: Zone am C (Engulf-Zone oder sehr starke Fraktalzone der C-Bein-Seite, vor der C-Kerze entstanden, vom C berührt); Umkehrkerze in der tieferen
 * Zeiteinheit ist Pflicht, wenn es keine Zone gibt, sonst Verstärkung; „AB=CD in der tieferen Zeiteinheit“ ist Verstärkung (`lowerAbcdAt`, nur Form).
 * Werte nur, wenn alle Pflichtzeilen erfüllt sind: mit Zone Einstieg = nahe Kante, Stop = ferne Kante; sonst mit Umkehrkerze Einstieg = Schluss,
 * Stop = Spitze der Kerze; Ziel = Level 1. Der Not-SL kommt vom Aufrufer (ATR). Keine Aufteilung, kein Stand danach.
 */
import { ABCD_PARAMS, type ContextTimeframe } from './params';
import { dReached, shapeOf, type AbcdShape } from './abcd';
import { TIMEFRAME_SEC } from '@/lib/analysis/candles';
import { outward, wickEnd, type Rect, type ZoneSide } from './frz';
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
  /** Öffnungszeit der Umkehrkerze (tiefere Zeiteinheit) */
  time?: number;
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
  return { state: r.state, ...(r.close === undefined ? {} : { close: r.close }), ...(r.tip === undefined ? {} : { tip: r.tip }), ...(r.tf ? { tf: r.tf } : {}), ...(r.time === undefined ? {} : { time: r.time }) };
}

/** AB=CD in der tieferen Zeiteinheit (Zustand, bei ☑ die Zeiteinheit) */
export interface LowerAbcd {
  state: CheckState;
  tf?: string;
}

/**
 * AB=CD in der tieferen Zeiteinheit (nur Form; 2026-11-19 neu gefasst): Die B → C-Korrektur des großen AB=CD ist in der nächsttieferen geladenen
 * Zeiteinheit ein fertiges kleines AB=CD (a, b, c, d; a am großen B, d am großen C). Das kleine d ist der äußerste Docht der tieferen Zeiteinheit
 * innerhalb der großen C-Kerze (Verkauf-AB=CD: tiefstes Tief; Kauf: höchstes Hoch), nicht ein Wendepunkt der tieferen Trendlinie. a, b, c sind die
 * letzten drei Trend-Wendepunkte der tieferen Zeiteinheit vor d (Annahme: nur Wendepunkte vor dem Ende der C-Kerze; Zwischenpunkte innerhalb der großen
 * C-Kerze, etwa Reaktion und ein weniger äußerer Tiefpunkt, sind Rauschen und zählen nicht; Punkte auf der Seite von d am Ende sind vom äußersten Docht überholt). Alle vier Bedingungen müssen gelten:
 * 1. a öffnet am B oder danach; 2. Korrekturtiefe von c wie ABCD-04/06 (`ABCD_PARAMS.minCorrection` bis `maxCorrection`, gleiche `shapeOf`-Rechnung);
 * 3. d erreicht Level 1 des kleinen AB=CD mit der Toleranz von ABCD-08 (`dReached`); 4. d liegt in der C-Kerze (per Bau).
 * Nicht messbar: keine tiefere Zeiteinheit, keine Wendepunkte dort oder Daten beginnen nach der B-Kerze. Keine Zone, kein RSI, keine Divergenz.
 */
export function lowerAbcdAt(env: Env, tf: ContextTimeframe, s: AbcdShape): LowerAbcd {
  const lower = neighborTf(env, tf, 1);
  const view = lower ? env.views.get(lower) : undefined;
  const trend = lower ? env.trends.get(lower) : undefined;
  const base = env.views.get(tf);
  if (!lower || !view || !trend || !base || trend.pivots.length === 0) return { state: 'unmeasurable' };
  const bTime = base.bars[s.b.idx].time;
  const cTime = base.bars[s.c.idx].time;
  if (view.bars.length === 0 || view.bars[0].time > bTime) return { state: 'unmeasurable' };
  const cEnd = cTime + TIMEFRAME_SEC[tf];
  // d: äußerster Docht auf der Seite von C innerhalb der C-Kerze (bei Gleichstand der früheste)
  let d: { idx: number; price: number } | null = null;
  trend.bars.forEach((bar, idx) => {
    if (bar.time < cTime || bar.time >= cEnd) return;
    const price = wickEnd(bar, s.cs);
    if (d === null || outward(s.cs, price) > outward(s.cs, d.price)) d = { idx, price };
  });
  if (d === null) return { state: 'unmet' };
  const dPt: { idx: number; price: number } = d;
  // Wendepunkte vor dem Ende der C-Kerze und vor d. Was innerhalb der großen C-Kerze liegt, ist Zickzack der tieferen Zeiteinheit im Rauschen
  // einer einzigen großen Kerze (Gedanke wie TRD-06): endet die Folge vor der C-Kerze auf der Seite von c, zählen die Punkte in der Kerze nicht;
  // endet sie auf der Seite von d, zählt in der Kerze nur der erste Punkt auf der Seite von c (das c selbst), die übrigen nicht.
  const upto = trend.pivots.filter((p) => p.idx < dPt.idx && trend.bars[p.idx].time < cEnd);
  const outside = upto.filter((p) => trend.bars[p.idx].time < cTime);
  const inside = upto.filter((p) => trend.bars[p.idx].time >= cTime);
  const before = [...outside];
  if (before.length > 0 && before[before.length - 1].side === s.cs) {
    const firstC = inside.find((p) => p.side === s.es);
    if (firstC) before.push(firstC);
  }
  // Wendepunkte auf der Seite von d am Ende sind vom äußersten Docht überholt
  while (before.length > 0 && before[before.length - 1].side === s.cs) before.pop();
  if (before.length < 3) return { state: 'unmet' };
  const [a, b, c] = before.slice(-3);
  if (trend.bars[a.idx].time < bTime) return { state: 'unmet' };
  if (a.side !== s.es || b.side !== s.cs || c.side !== s.es) return { state: 'unmet' };
  const small = shapeOf(trend.bars, { a: { idx: a.idx, price: a.price }, b: { idx: b.idx, price: b.price }, c: { idx: c.idx, price: c.price } }, dPt);
  if (small.depth === null || small.depth < ABCD_PARAMS.minCorrection || small.depth > ABCD_PARAMS.maxCorrection) return { state: 'unmet' };
  return dReached(small) ? { state: 'met', tf: lower } : { state: 'unmet' };
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
  /** AB=CD in der tieferen Zeiteinheit (`lowerAbcdAt`); ohne Angabe nicht messbar */
  lowerAbcd?: LowerAbcd;
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
  const lower: LowerAbcd = o.lowerAbcd ?? { state: 'unmeasurable' };
  const candleUsable = !zone && candle.state === 'met' && candle.close !== undefined && candle.tip !== undefined;
  if (candleUsable && consumed(s.c.idx + 1, candle.tip!)) return null;

  // ABCD-14 misst „höherer Trend in Richtung des AB=CD-Handels“; das C-Bein braucht das Gegenteil (Trend A → B)
  let trendState: CheckState = 'unmeasurable';
  if (o.withTrend !== null) trendState = o.withTrend ? 'unmet' : 'met';
  const rows: CLegRow[] = [
    { key: 'depth', kind: 'required', state: s.depth >= ABCD_PARAMS.minCorrection && s.depth <= ABCD_PARAMS.maxCorrection ? 'met' : 'unmet', value: s.depth },
    { key: 'trend', kind: 'required', state: trendState },
    { key: 'noDivergence', kind: 'required', state: o.noDivergence },
    { key: 'zone', kind: 'bonus', state: zone ? 'met' : 'unmet', ...(zone ? { value: zone.kind } : {}) },
    { key: 'candle', kind: zone ? 'bonus' : 'required', state: candle.state, ...(candle.state === 'met' && candle.tf ? { value: candle.tf } : {}) },
    { key: 'lowerAbcd', kind: 'bonus', state: lower.state, ...(lower.state === 'met' && lower.tf ? { value: lower.tf } : {}) },
  ];
  const ok = rows.every((r) => r.kind !== 'required' || r.state === 'met');
  const none: CLeg = { side, rows, variant: null, entry: null, stop: null, emergencyStop: null, target: null };
  // Anzeige „vor N Kerzen“: Index der Kerze (Zeiteinheit des Kandidaten), in der der Einstieg liegt, und der Schluss der letzten Kerze; keine Rechnung ändert sich
  const lastIdx = bars.length - 1;
  const age = (idx: number) => ({ entryIdx: idx, barsSince: Math.max(0, lastIdx - idx), lastClose: bars[lastIdx].close });
  const candleIdx = () => {
    let k = s.c.idx;
    while (k + 1 <= lastIdx && candle.time !== undefined && bars[k + 1].time <= candle.time) k++;
    return k;
  };
  if (!ok) return none;
  if (zone) {
    const stop = far(zone.rect);
    return { side, rows, variant: 'zone', entry: near(zone.rect), stop, emergencyStop: emergencyStopOf(stop, side, o.atr), target: s.level1, ...age(s.c.idx) };
  }
  if (candleUsable) {
    const stop = candle.tip!;
    return { side, rows, variant: 'candle', entry: candle.close!, stop, emergencyStop: emergencyStopOf(stop, side, o.atr), target: s.level1, ...age(candleIdx()) };
  }
  return none;
}
