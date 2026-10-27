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
