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
  /** TRD-21: Mindestkorrektur und Mindestausdehnung als Anteil des Impulses (kommt mit FIB aus dessen Tabelle) */
  healthy: { minCorrection: 0.382, minExtension: 0.272 },
  /** TRD-32, TRD-33: Mindestzahl Gründe gegen bzw. mit dem Trend */
  reasons: { counter: 3, with: 2 },
  /** TRD-48: Kerzen der tieferen Zeiteinheit, ab denen die Struktur auch in der höheren zählt, bzw. nicht mehr */
  lowerTfBars: { counts: 8, notCounts: 3 },
} as const;
