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
  /** Veto-Zeile (A40.2): ein Ausschluss, der das Urteil nicht ändert; Handelsblock, Checkliste und Kandidatenliste zeigen ihn. Die Zeile kommt erst nach `settle` in die Liste, Urteil und `invalidBy` sehen sie nie */
  veto?: true;
}

/**
 * Anzeige des Handels (A40.3), keine Order. `null` = nicht messbar; `reason` nennt dann eine Regel-ID als Grund (z. B. `LIB-04`) oder `noRule` (das Regelbuch nennt den Wert nicht).
 * Einstieg und Ziel sind Preise; der Stop ist der Schluss-Stop, der Not-SL liegt eine ATR(14) dahinter (HDL-41).
 */
export interface Trade {
  entry: number | null;
  stop: number | null;
  emergencyStop: number | null;
  tp1: number | null;
  reason: { entry?: string; stop?: string; tp1?: string };
  /** SIG-29 (CRV bis TP1 über 1, sonst Umkehrkerze der tieferen ZE): ☑ bei CRV > 1; Wert = CRV; die Anzeige zeigt die Zeile nur bei CRV ≤ 1 */
  sig29?: Check;
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
  /** Lage des gehaltenen Endpunkts (Bruchkerze), nur zum Zeichnen; Alarm und Suche lesen `points`, nicht dieses Feld */
  heldPoint?: Anchor;
  /** Einstieg, Stop und TP1 zur Anzeige (A40.3); fehlt bei Formationen ohne Handelswerte */
  trade?: Trade;
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
