/**
 * Datenform der Formationserkennung. Typen und die Kennung `TRADE_RULES`, kein React, kein Netzwerk.
 * Eine Bedingung hat eine feste ID (z. B. `ABCD-04`); die Prüfung gibt je ID einen Zustand zurück.
 */
import type { Timeframe } from '@/lib/analysis/candles';

/** Pflicht, Verstärkung oder Ausschluss */
export type RuleKind = 'required' | 'bonus' | 'exclusion';
/** Nur Anzeige: ändert die Bewertung nicht. `secondary` = nur Nebenquelle, `assumption` = Annahme */
export type RuleStatus = 'confirmed' | 'secondary' | 'assumption';
/** `unmeasurable`: die Kerzen reichen nicht (grau, weder erfüllt noch nicht erfüllt) */
export type CheckState = 'met' | 'unmet' | 'unmeasurable';
export type Verdict = 'valid' | 'invalid' | 'forming';
export type Side = 'buy' | 'sell';

export interface Anchor {
  time: number;
  price: number;
}

export type DrawingTool =
  | 'zigzag'
  | 'fib'
  | 'fibExt'
  | 'zone'
  | 'hline'
  | 'trendline'
  | 'label'
  | 'marker'
  | 'rsi'
  | 'wave';

/** Chart-Element: wird auch bei nicht erfüllter Bedingung geliefert */
export interface Drawing {
  id: string;
  tool: DrawingTool;
  anchors: Anchor[];
  levels?: number[];
  /** IDs der Bedingungen, die diese Zeichnung zeigt */
  rules: string[];
  /** Zeiteinheiten, in denen die Zeichnung sichtbar ist (FRZ-28); fehlt das Feld, gilt jede */
  timeframes?: Timeframe[];
  /** Trendrichtung der Zeichnung (TRD-14): buy = Aufwärtstrend (grün), sell = Abwärtstrend (rot) */
  side?: Side;
  /** Beschriftung eines Labels mit einem Anker; fehlt das Feld, heißt es „Level 1“ (mit zwei Ankern: Stop und Ziel) */
  label?: 'stop' | 'target';
}

/**
 * `rules` einer Zeichnung, die nur zum Handel gehört (Einstieg, Stop, Ziel, erreichtes Ziel) und keine Bedingung zeigt.
 * Immer diese eine leere Liste statt `[]`: der Abdeckungstest erkennt sie an der Identität, die Anzeige bleibt wie bei `[]`.
 */
export const TRADE_RULES: string[] = [];

export interface Check {
  id: string;
  kind: RuleKind;
  status: RuleStatus;
  state: CheckState;
  /** gemessener Wert, wenn die Bedingung eine Zahl vergleicht */
  value?: number;
  drawings: string[];
  /** Nur Anzeige: die Bedingung gehört zu einer anderen Variante der Formation. Der Zustand bleibt gemessen, die Zeile zählt nicht mit */
  inactive?: true;
}

export interface Candidate {
  code: string;
  side: Side;
  tf: Timeframe;
  points: Record<string, Anchor>;
  checks: Check[];
  drawings: Drawing[];
  verdict: Verdict;
  /** Regeln, die das Urteil `invalid` auslösen; der Prüfer setzt sie neben dem Urteil. Wartende, ersetzte und entschuldigte Regeln fehlen, bei anderem Urteil ist die Liste leer */
  invalidBy?: string[];
  /** Der Endpunkt ist gemessen (Bruch liegt vor), aber `settle` hält das Urteil auf `forming`; der Endpunkt steht deshalb nicht in `points` */
  pointHeld?: boolean;
}

/** Eine Kerze der Formation: nur geschlossene Kerzen, Zeit = Kerzenbeginn (MT5-Sekunden) */
export interface FormationBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Zwischen dieser und der vorigen Kerze fehlt ein Datenbereich (MissingRange): Fraktal-Nachbarn zählen nicht darüber hinweg */
  gapBefore?: boolean;
}
