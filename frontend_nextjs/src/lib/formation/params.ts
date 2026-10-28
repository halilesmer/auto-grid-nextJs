/**
 * Zahlen der Formationserkennung an einer Stelle. Schlüssel = Bedingungs-ID.
 * Wer eine Annahme ändern will, ändert sie hier und nirgends sonst.
 */
import type { Timeframe } from '@/lib/analysis/candles';

/** RSI-Einstellung (SIG-01): Periode, Schlusskurs, Linien */
export const RSI_PARAMS = { period: 7, overbought: 80, oversold: 20 } as const;

/** Wave = SMA(schnell) − SMA(langsam) des Medianpreises (High + Low) / 2 (SIG-10, Annahme) */
export const WAVE_PARAMS = { fast: 5, slow: 35 } as const;

/** Volumenstarke Kerze (SIG-34, Annahme): Spanne ≥ factor × mittlere Spanne der letzten `lookback` Kerzen */
export const WIDE_RANGE_PARAMS = { factor: 1.5, lookback: 20 } as const;

/** Hilfsmaß ohne Bedingungs-ID: Toleranz und Abstände */
export const ATR_PERIOD = 14;

/** Zeiteinheiten des Kontexts (FRZ-27), von hoch nach tief */
export const CONTEXT_TIMEFRAMES = ['D1', 'H4', 'H1', 'M15'] as const satisfies readonly Timeframe[];
export type ContextTimeframe = (typeof CONTEXT_TIMEFRAMES)[number];

/** Fraktal-Zone (FRZ). Mit „Annahme“ markierte Zahlen sind gewählt, nicht gemessen. */
export const FRZ_PARAMS = {
  /** FRZ-02/03: geschlossene Nachbarkerzen je Seite */
  neighbors: 2,
  /** FRZ-13 (Annahme): Zone zu dünn, wenn Höhe < Anteil der Spanne der rechten Nachbarkerze */
  thinRatio: 0.25,
  /** FRZ-14: dünne Zone wird auf diesen Anteil der Spanne der rechten Nachbarkerze erweitert */
  thinWiden: 0.5,
  /** FRZ-15: ohne Docht gilt dieser Anteil der Spanne der linken Nachbarkerze */
  wicklessDepth: 0.5,
  /** FRZ-16 (Annahme): Manipulationsdocht = Docht ≥ ratio × Körper, nur in dieser Zeiteinheit */
  manipulation: { ratio: 2, timeframe: 'H4' },
  /** FRZ-20: Zonen je Seite. M15 ist eine Annahme (keine Zahl im Regelwerk) */
  zonesPerSide: { D1: 2, H4: 2, H1: 1, M15: 1 },
  /** FRZ-21 (Annahme): „nahe am Kurs“ = Abstand ≤ dieses Vielfache der ATR(14) der höheren Zeiteinheit */
  nearAtr: 1,
  /** FRZ-22 (Annahme): zusammenlegen, wenn die Lücke ≤ Faktor × Höhe der kleineren Zone ist */
  mergeGap: 1,
  /** FRZ-31 (Annahme): Test = Kerze kommt bis auf Faktor × Zonenhöhe an die Zone */
  testReach: 1,
  /** FRZ-32: starke Zone ab so vielen gescheiterten Tests (oder Zonen ineinander, FRZ-29) */
  strongTests: 2,
  /** FRZ-34: sehr starke Zone ab so vielen Tests bzw. Zonen ineinander */
  veryStrongTests: 3,
  veryStrongNest: 3,
  /** FRZ-29: Zonen ineinander, ab denen die Zone stark ist */
  strongNest: 2,
  /** FRZ-39 (Annahme): frische Umkehrzone = höchstens so viele Rücktests, Bruch höchstens so viele Kerzen zurück */
  fresh: { maxRetests: 1, maxBars: 30 },
} as const;

/** Fibonacci (FIB). Level in Notation Start = 1, Ende = 0; Ausdehnungen als Anteil des Impulses jenseits des Endes (−0.272 = 0.272). */
export const FIB_PARAMS = {
  /** FIB-10: Level der Korrekturzone */
  retrace: [0.382, 0.5, 0.618],
  /** FIB-09 (Z-FIB-04, Z-FIB-05): voller Satz inklusive 0.236, 0.786, 0.886 */
  levels: [0.236, 0.382, 0.5, 0.618, 0.786, 0.886],
  /** FIB-18: Ausdehnungen (−0.272, −0.414, −0.618) */
  extensions: [0.272, 0.414, 0.618],
  /** FIB-13: Schale = Wende ab diesem Level, ohne 0.382 zu berühren */
  bowl: 0.236,
  /** FIB-16 (Annahme): Wende vor diesem Level gilt als stark */
  strongTurn: 0.5,
  /** FIB-17 (Annahme): Wenden ab diesem Level gehören nicht zur Korrekturzone */
  farLevel: 0.786,
  /** FIB-28: größtes Level des Satzes; tiefer ist „alle Level überschritten“ */
  lastLevel: 0.886,
  /** FIB-15: aufeinanderfolgende Schlüsse jenseits des Starts beenden die Messung */
  endCloses: 2,
  /** FIB-25 (Annahme): „zusammenfallen“ = Abstand Level–Zonenkante ≤ dieser Anteil der Zonenhöhe */
  nearZone: 0.5,
} as const;

/** Signale (SIG). Mit „Annahme“ markierte Zahlen sind gewählt, nicht gemessen. */
export const SIG_PARAMS = {
  /** SIG-35 (Annahme): volumenarm = Spanne ≤ factor × Mittel der letzten `lookback` Kerzen, „viele“ = `run` Kerzen in Folge */
  narrow: { factor: 0.5, lookback: 20, run: 3 },
  /** SIG-44 (Annahme): Gegendocht der Testere-Kerze höchstens dieser Anteil ihrer Spanne */
  sawWick: 0.1,
  /** SIG-46: Kerzen je Zusammenfassung (M15 → H1, H1 → H4) */
  mergeBars: 4,
} as const;

/** Trend (TRD). Mit „Annahme“ markierte Zahlen sind gewählt, nicht gemessen. */
export const TRD_PARAMS = {
  /** TRD-07: eigene Welle ab diesem Anteil der Referenzkorrektur */
  ownWave: 0.75,
  /** TRD-08 (Annahme): Zwischenbereich beginnt bei diesem Anteil */
  gapLow: 0.5,
  /** TRD-17 (Annahme): aufeinanderfolgende Schlüsse jenseits der Bezugszone für den Wechsel */
  changeCloses: 2,
  /** TRD-22 (Annahme): „ähnlich“ = Anteil der vorigen Korrektur von … bis … */
  regular: { min: 0.75, max: 1.333 },
  /** TRD-23, TRD-24 (Annahme): so viele Korrekturen bzw. Impulse in Folge, jede kürzer als die vorige */
  shrinkCount: 2,
  /** TRD-30 (Annahme): Kerzen ohne neuen Impuls und ohne Wechsel */
  sidewaysBars: 50,
  /** TRD-38 (Annahme): „fast gleich“ = Abweichung am rechten Rand unter diesem Anteil der letzten Korrekturlänge */
  lineKeep: 0.1,
  /** TRD-21: Mindestkorrektur und Mindestausdehnung als Anteil des Impulses (Zahlen aus FIB_PARAMS) */
  healthy: { minCorrection: FIB_PARAMS.retrace[0], minExtension: FIB_PARAMS.extensions[0] },
  /** TRD-32, TRD-33: Mindestzahl Gründe gegen bzw. mit dem Trend */
  reasons: { counter: 3, with: 2 },
  /** TRD-48: Kerzen der tieferen Zeiteinheit, ab denen die Struktur auch in der höheren zählt, bzw. nicht mehr */
  lowerTfBars: { counts: 8, notCounts: 3 },
} as const;

/** AB=CD (ABCD). Mit „Annahme“ markierte Zahlen sind gewählt, nicht gemessen. Ausdehnungen als Anteil von AB. */
export const ABCD_PARAMS = {
  /** ABCD-04: Mindestkorrektur B → C (Zahl aus FIB_PARAMS) */
  minCorrection: FIB_PARAMS.retrace[0],
  /** ABCD-06: Mindest-Extension der Fib A → B (Zahl aus FIB_PARAMS); Level 1 muss mindestens dort liegen */
  minExtension: FIB_PARAMS.extensions[0],
  /** ABCD-06: größte Korrekturtiefe, bei der Level 1 noch die Mindest-Extension erreicht (1 − 0.272) */
  maxCorrection: 1 - FIB_PARAMS.extensions[0],
  /** Auswahl der Punkte (Annahme): C wird unter den letzten so vielen Wendepunkten gesucht */
  lookbackPivots: 6,
  /** ABCD-08 (Annahme): D gilt als erreicht, wenn der Kurs höchstens diesen Anteil von AB vor Level 1 endet */
  tolerance: 0.05,
  /** ABCD-11 (Annahme): „nahe“ = Abstand höchstens dieses Vielfache der ATR(14) der Formations-Zeiteinheit */
  nearAtr: 0.5,
  /** ABCD-18 (Annahme): RSI(7) kurz vor dem Extrem */
  rsiNear: { sell: 75, buy: 25 },
  /** ABCD-23 (Annahme): so viele volumenstarke Kerzen in Richtung C → D schließen aus */
  wideBars: 2,
  /** ABCD-25: Zeiteinheiten, in denen AB=CD nicht gilt */
  excludedTimeframes: ['M1', 'M5'] as readonly string[],
  /** ABCD-15: Retracement-Level der größeren Gegenbewegung, das als zweites Level zählt */
  confluenceLevel: 0.618,
  /** Z-ABCD-05: Ziele und 1:1-Stop der Ziel-Fib (Level in Notation Start = 1, Ende = 0) */
  targets: { tp1: 0.382, tp2: 0.618, stop: 0.382, divergence: 0.786 },
} as const;

/** Doppeltop / Doppelboden (CDT). Mit „Annahme“ markierte Zahlen sind gewählt, nicht gemessen. */
export const CDT_PARAMS = {
  /** CDT-04: Mindesttiefe der Korrektur H1 → N als Anteil der Fib Impulsbeginn → H1 (Zahl aus FIB_PARAMS) */
  minCorrection: FIB_PARAMS.retrace[0],
  /** CDT-15: ein Schluss jenseits von H1 verletzt nur mit einer volumenstarken Kerze oder dieser Ausdehnung der Fib Impulsbeginn → H1 (FIB-21) */
  violationExtension: FIB_PARAMS.extensions[0],
  /** Auswahl der Punkte (Annahme): N wird unter den letzten so vielen Wendepunkten gesucht, H1 ist der Wendepunkt davor */
  lookbackPivots: 6,
  /** CDT-08 (Annahme): mittlere Spanne der letzten `bars` Kerzen vor H2 höchstens `ratio` × die vor H1 */
  approach: { bars: 5, ratio: 0.8 },
  /** CDT-10: „nahe“ = Abstand zur Zone höchstens dieses Vielfache der ATR(14) (wie ABCD-11) */
  nearAtr: ABCD_PARAMS.nearAtr,
  /** CDT-11: Zeiteinheiten der Formation */
  timeframes: ['H1', 'H4', 'D1'] as readonly string[],
} as const;

/** XABCD-Formationen (GAR, BAT). Mit „Annahme“ markierte Zahlen sind gewählt, nicht gemessen. */
export const HARMONIC_PARAMS = {
  /** Auswahl der Punkte (Annahme): C wird unter den letzten so vielen Wendepunkten gesucht, X, A, B sind die drei davor */
  lookbackPivots: ABCD_PARAMS.lookbackPivots,
  /** Berührung der Pflicht-Level: bis so viele Pips davor gilt als Berührung */
  touchPips: 1,
  /** Größe eines Pips je Symbolart (Annahme für Gold, Silber und die übrigen Symbole) */
  pip: { default: 0.0001, jpy: 0.01, gold: 0.1, silver: 0.01, other: 0.01 },
  /** GAR-09, BAT-09 (Annahme): Abstand AB=CD-D ↔ Harmonik-D höchstens dieses Vielfache der ATR(14) */
  nearAtr: 1,
  /** GAR-10, BAT-11 (Annahme): „nahe“ an einer Zone = Abstand höchstens dieses Vielfache der ATR(14) (wie ABCD-11) */
  zoneAtr: ABCD_PARAMS.nearAtr,
  /** GAR-11, BAT-10 (Annahme): Dauer X → D in Kerzen und Höhe X → A als Vielfaches der ATR(14) */
  space: { bars: 30, atr: 4 },
  /** GAR-12, BAT-12: Zeiteinheiten ab H4 */
  highTimeframes: ['H4', 'D1'] as readonly string[],
  /** GAR-20, BAT-16: Zeiteinheiten, in denen die Harmonik nicht gilt */
  excludedTimeframes: ['M15'] as readonly string[],
  /** GAR-18, BAT-17: Zeiteinheit des Schlusses jenseits von X */
  closeTimeframe: 'H4',
  /** GAR-19 (Annahme): „lange im Extrem“ = so viele H4-Schlüsse in Folge */
  longRun: 6,
  /** BAT-02 (Annahme): Anteil volumenstarker Kerzen von X → A */
  wideShare: 0.5,
  /** Z-GAR-06, Z-BAT-06: Ziele und 1:1-Stop der Ziel-Fib A → D (Zahlen aus ABCD_PARAMS) */
  targets: ABCD_PARAMS.targets,
} as const;

/** Gartley (GAR). Level als Anteil der Strecke, Notation Start = 1, Ende = 0. */
export const GAR_PARAMS = {
  /** GAR-03: B berührt dieses Level der Fib X → A (Zahl aus FIB_PARAMS) */
  bLevel: FIB_PARAMS.retrace[2],
  /** GAR-04: C berührt dieses Level der Fib A → B */
  cLevel: FIB_PARAMS.retrace[2],
  /** GAR-05: Ausdehnung der Fib A → B, an der D fertig ist (Zahl aus FIB_PARAMS) */
  dExtension: FIB_PARAMS.extensions[0],
  /** GAR-06: sauberste Form, wenn C dieses Level der Fib A → B nicht berührt (Zahl aus FIB_PARAMS) */
  cClean: FIB_PARAMS.farLevel,
  /** GAR-07: D liegt an diesem Level der Fib X → A; Abstand höchstens dieser Anteil von X → A (Annahme) */
  dAtX: { level: FIB_PARAMS.farLevel, tolerance: 0.05 },
  /** GAR-15: B berührt dieses Level der Fib X → A (Ausschluss, keine Toleranz) */
  bExclude: FIB_PARAMS.farLevel,
  /** GAR-16: C berührt dieses Level der Fib A → B (Ausschluss, keine Toleranz; Zahl aus FIB_PARAMS) */
  cExclude: FIB_PARAMS.lastLevel,
} as const;

/** Bat (BAT). Level als Anteil der Strecke, Notation Start = 1, Ende = 0. */
export const BAT_PARAMS = {
  /** BAT-05: B berührt dieses Level der Fib X → A (Zahl aus FIB_PARAMS) */
  bLevel: FIB_PARAMS.retrace[1],
  /** BAT-06: C berührt mindestens dieses Level der Fib A → B (Zahl aus FIB_PARAMS) */
  cMin: FIB_PARAMS.retrace[0],
  /** BAT-07: D berührt dieses Level der Fib X → A (Zahl aus FIB_PARAMS) */
  dLevel: FIB_PARAMS.lastLevel,
  /** BAT-14: B berührt dieses Level der Fib X → A (Ausschluss, keine Toleranz; dann Gartley) */
  bExclude: FIB_PARAMS.retrace[2],
} as const;

/** 2618 (Doppeltop/-boden, dann Rücklauf an 0.618). Level als Anteil des Impulses, Notation Start = 1, Ende = 0. */
export const F2618_PARAMS = {
  /** 2618-05: Level, das die Korrektur berühren muss (keine Toleranz, FIB-09; Zahl aus FIB_PARAMS) */
  entryLevel: FIB_PARAMS.retrace[2],
  /** Z-2618-02: obere Grenze der Einstiegszone (Zahl aus FIB_PARAMS) */
  zoneLevel: FIB_PARAMS.retrace[1],
  /** Z-2618-03: Ziel 2 an der Ausdehnung −0.272 (Zahl aus FIB_PARAMS) */
  targetExtension: FIB_PARAMS.extensions[0],
  /** 2618-07: Level der größeren Bewegung (Zahlen aus FIB_PARAMS) */
  confluenceLevels: FIB_PARAMS.retrace,
  /** 2618-07 (Annahme): „liegt an“ = Abstand höchstens dieses Vielfache der ATR(14) (wie CDT-10) */
  nearAtr: CDT_PARAMS.nearAtr,
  /** 2618-08: Zeiteinheiten mit Verstärkung */
  timeframes: ['H4'] as readonly string[],
  /** Auswahl der Punkte: höchstens so viele Impulsenden I je Paar (das Paar H1/N wählt `CDT_PARAMS.lookbackPivots`) */
  maxEnds: 6,
} as const;

/** Libra (LIB). Level als Anteil der Fib P2 → P3, Notation Start = 1, Ende = 0. Mit „Annahme“ markierte Zahlen sind gewählt, nicht gemessen. */
export const LIB_PARAMS = {
  /** LIB-12, Z-LIB-02: Einstiegslevel (Zahl aus FIB_PARAMS.levels) */
  entryLevel: FIB_PARAMS.levels[4],
  /** Z-LIB-03: Mindestkorrektur und Ziel 2 (Zahlen aus FIB_PARAMS) */
  minCorrection: FIB_PARAMS.retrace[0],
  targetExtension: FIB_PARAMS.extensions[0],
  /** LIB-08, LIB-09: „nahe“ = Abstand höchstens dieses Vielfache der ATR(14) (ABCD-11) */
  nearAtr: ABCD_PARAMS.nearAtr,
  /** LIB-11: Mindest-CRV bis TP1 */
  minCrv: 2,
  /** Einstiegswahl (Annahme): am gewählten Einstieg muss das CRV bis TP1 mindestens so groß sein */
  floorCrv: 1,
  /** LIB-06: Zeiteinheiten mit Verstärkung */
  timeframes: ['H4', 'D1'] as readonly string[],
  /** LIB-07 (nur Nebenquelle): Zeiteinheiten, die die H4-Trendrichtung brauchen */
  needsHigherTrend: ['M15'] as readonly string[],
  /** LIB-16: Zeiteinheiten unter H1 */
  belowH1: ['M15'] as readonly string[],
  /** LIB-14 (Annahme): Berührung später als so viele Kerzen nach P3 schließt aus */
  maxBarsToTouch: 30,
  /** LIB-15 (Annahme): mehr als so viele Fraktale zwischen P3 und Berührung schließen aus */
  maxFractals: 2,
  /** LIB-10: Ziele der Harmonik (Zahlen aus ABCD_PARAMS.targets) */
  harmonicTargets: [ABCD_PARAMS.targets.tp1, ABCD_PARAMS.targets.tp2],
  /** Auswahl der Punkte (Annahme): P2 unter den letzten so vielen Fraktalen, je P2 so viele frühere Fraktale als P1 */
  maxPeaks: 5,
  maxP2: 3,
  maxP1: 2,
  /** Auswahl der Punkte: höchstens so viele P3-Kandidaten je Paar */
  maxEnds: 6,
} as const;

/** Kopf-Schulter (OBO). Mit „Annahme“ markierte Zahlen sind gewählt, nicht gemessen. */
export const OBO_PARAMS = {
  /** OBO-06 (Annahme): Schultern ähnlich groß = Verhältnis der Bewegungen innerhalb dieser Grenzen */
  shoulderRatio: { min: 0.8, max: 1.25 },
  /** OBO-07 (Annahme): rechte Schulter dauert so viele Male die Kerzen der Bewegung Kopf → N2 */
  consolidation: 1.5,
  /** OBO-10: „zusammenfallen“ = Abstand höchstens dieses Vielfache der ATR(14) (ABCD-11) */
  nearAtr: ABCD_PARAMS.nearAtr,
  /** OBO-09: Zeiteinheiten mit Verstärkung */
  timeframes: ['H4', 'D1'] as readonly string[],
  /** OBO-14: Zeiteinheiten unter H1 */
  belowH1: ['M15'] as readonly string[],
  /** Auswahl der Punkte (Annahme): Kopf unter den letzten so vielen Fraktalen, je Kopf so viele linke Schultern, so viele rechte Schultern */
  maxPeaks: 6,
  maxHeads: 3,
  maxLeft: 2,
  maxRight: 2,
} as const;

/** Trendfortsetzung (TDF: Flagge, steigendes Dreieck, Schale, Konsolidierung). Mit „Annahme“ markierte Zahlen sind gewählt, nicht gemessen. */
export const TDF_PARAMS = {
  /** TDF-07 (Annahme): die Pause läuft nicht tiefer als dieses Level der Fib auf den Impuls (Zahl aus FIB_PARAMS); tiefer gehört zur Harmonik (FIB-17) */
  maxDepth: FIB_PARAMS.retrace[2],
  /** TDF-12 (Annahme): die Kopie der oberen Linie liegt höchstens dieses Vielfache der ATR(14) vom zweiten Tief (Zahl aus ABCD-11) */
  parallelAtr: ABCD_PARAMS.nearAtr,
  /** TDF-14: das Ende der Flagge liegt zwischen diesen Leveln der Fib auf den Mast (Zahlen aus FIB_PARAMS) */
  flagDepth: { min: FIB_PARAMS.retrace[0], max: FIB_PARAMS.retrace[1] },
  /** TDF-18 (Annahme): „ungefähr gleicher Charakter“ = Tiefe der Korrektur nach H1 als Anteil der vorigen Korrektur (Zahlen aus OBO-06) */
  similar: OBO_PARAMS.shoulderRatio,
  /** TDF-21: die Schale dreht an diesem Level, ohne das zweite zu berühren (Zahlen aus FIB_PARAMS) */
  bowl: { reach: FIB_PARAMS.bowl, spare: FIB_PARAMS.retrace[0] },
  /** TDF-23: der Henkel bleibt über diesem Level der Fib vom Impulsende zum Tief der Schale (Zahl aus FIB_PARAMS) */
  handleLevel: FIB_PARAMS.retrace[1],
  /** TDF-24, TDF-28, TDF-29: Mindestzahl Berührungen oben und unten */
  touches: { top: 2, bottom: 2 },
  /** TDF-08: Zeiteinheiten unter H1 (wie LIB-16) */
  belowH1: LIB_PARAMS.belowH1,
  /** Z-TDF-07: Level der umgekehrten Fib (Zwischenziel, Strukturziel) */
  inversion: [1.618, 2],
  /** Auswahl der Punkte (Annahme): H1 unter den letzten so vielen Fraktalen, so viele Wellen (Tiefs, Hochs) nach H1 */
  maxImpulses: 5,
  maxWaves: 2,
} as const;
