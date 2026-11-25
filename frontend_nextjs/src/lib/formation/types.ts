/**
 * Datenform der Formationserkennung. Typen und die Kennung `TRADE_RULES`, kein React, kein Netzwerk.
 * Eine Bedingung hat eine feste ID (z. B. `ABCD-04`); die Prüfung gibt je ID einen Zustand zurück.
 */
import type { Timeframe } from '@/lib/analysis/candles';
import type { TradeStatus } from './tradeStatus';

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
  label?: 'stop' | 'target' | 'bigTarget' | 'entry';
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
  /** AB=CD: TP1 am Einstieg (Fib ab `from` zu Level 1), Grundlage für CRV und SIG-29; `tp1` läuft mit dem äußersten Docht weiter */
  tp1AtEntry?: number;
  /** AB=CD: Strecke (Preis), um die der Docht Level 1 verfehlt hat, wenn D nur innerhalb der Toleranz erreicht ist */
  missed?: number;
  /** AB=CD (1114-A4.2): TP2 = 0.618 der Ziel-Fib, läuft wie `tp1` mit dem äußersten Docht; die Hälfte der Position schließt hier (mit großem Ziel ein Drittel) */
  tp2?: number;
  /** AB=CD: TP2 am Einstieg (Fib ab `from` zu Level 1), Grundlage der Ergebnisse in R */
  tp2AtEntry?: number;
  /** AB=CD: TP3 (0.786 der Ziel-Fib), nur bei Divergenz (Fib ab A); Zusatzziel ohne Anteil */
  tp3?: number;
  /**
   * AB=CD (1114-A4.3): großes AB=CD-Ziel bei harmonischem D = D + (A − X) (Kauf; Verkauf spiegelgleich: D − (X − A)). Läuft wie `tp1` mit dem äußersten Docht.
   * Mit diesem Ziel teilt sich die Position in Drittel; die Rechnung zählt es erst, wenn eine Kerze jenseits von `tpBigActivation` schloss.
   */
  tpBig?: number;
  /** AB=CD: großes Ziel am Einstieg (D = Level 1), Grundlage der Ergebnisse in R */
  tpBigAtEntry?: number;
  /** AB=CD: A; eine Kerze, die jenseits davon (in Gewinnrichtung) schließt, aktiviert das große Ziel */
  tpBigActivation?: number;
  /** AB=CD (1120-A14.2): das große Ziel ist am Einstieg festgelegt, aber das harmonische D (ABCD-16) ist heute nicht mehr erfüllt; nur Hinweis im Handelsblock */
  tpBigHarmonicBroken?: boolean;
  /** AB=CD: TP1 liegt in einer sehr starken Zone der Gegenseite (nur Hinweis, die Rechnung bleibt) */
  tp1StrongZone?: boolean;
  /** AB=CD (1114-A4.2 b): Stand des Handels nach dem Einstieg (offen, TP1, TP1 und TP2, Stop, Rest am Einstieg); nur wenn der Einstieg erreicht ist */
  status?: TradeStatus;
  /** Harmoniken und AB=CD: Index der Einfrierkerze (Einstieg) in den Kerzen des Kandidaten; fehlt vor dem Einstieg */
  entryIdx?: number;
  /**
   * AB=CD (1114-A4.5): Erken dönüş. D erreicht Level 1 nicht, dreht aber vorher in einer Zone mit einer Engulf-Kerze.
   * Dann gelten Einstieg (Engulf-Schluss), Stop (ferne Zonenkante) und `tp1` (nächste Gegenzone); Ziel 2 und der Abstand zu Level 1 stehen hier.
   * `tp2`, `tp3`, `status` und die Ergebnisse in R fehlen.
   */
  earlyReversal?: { target2: number | null; gap: number };
  /**
   * AB=CD (1114-A4.4): Wiedereinstieg. TP1 und TP2 des ersten Handels sind erreicht, der Kurs berührt die Engulf-Zone am D erneut, und keine Kerze hat jenseits davon geschlossen.
   * Einstieg = nahe Zonenkante, Stop = ferne Kante (Schlusswert), Not-SL wie beim ersten Handel, Ziel = nächste Gegenzone. Keine Aufteilung, kein Stand danach; der erste Handel (`status`) bleibt unverändert.
   */
  reentry?: { entry: number; stop: number; emergencyStop: number | null; target: number | null; /** Ziel 2 (letzte Tief-/Hochzone); null, wenn leer oder dieselbe Zone wie `target` */ target2: number | null };
  /** AB=CD (1114-A4.4): nur TP1 erreicht und der Kurs ist in die Engulf-Zone zurückgekehrt: kein Wiedereinstieg, nur ein Hinweis */
  reentryTp1Only?: true;
  /**
   * AB=CD: C-Bein. Bevor D (Level 1) erreicht ist, ein Handel von C zu Level 1, also gegen die Richtung des AB=CD-Handels (beim Verkauf-AB=CD ein Kauf).
   * Eigene Pflicht- und Verstärkungsliste (`rows`); die Zeilen stehen nicht in `candidate.checks` und ändern Urteil, `invalidBy`, Alarm und Favoriten nicht.
   * Die Werte stehen nur, wenn alle Pflichtzeilen erfüllt sind.
   */
  cLeg?: CLeg;
  /** SIG-29 (CRV bis TP1 über 1, sonst Umkehrkerze der tieferen ZE): ☑ bei CRV > 1; Wert = CRV; die Anzeige zeigt die Zeile nur bei CRV ≤ 1 */
  sig29?: Check;
}

/** Zeile der Liste des C-Beins; `value` ist eine Zahl (Tiefe) oder ein Schlüssel (`engulf`, `fractal`) oder die Zeiteinheit der Umkehrkerze */
export interface CLegRow {
  key: 'depth' | 'trend' | 'noDivergence' | 'zone' | 'candle' | 'lowerAbcd';
  kind: 'required' | 'bonus';
  state: CheckState;
  value?: number | string;
}

/** C-Bein (siehe `Trade.cLeg`); `side` ist die Richtung des C-Beins (gegen den AB=CD-Handel) */
export interface CLeg {
  side: Side;
  rows: CLegRow[];
  /** `zone`: Einstieg an der nahen Kante der Zone am C; `candle`: Schluss der Umkehrkerze; null: keine Werte */
  variant: 'zone' | 'candle' | null;
  entry: number | null;
  /** Schluss-Stop (ferne Kante der Zone, Kerzenspitze) */
  stop: number | null;
  emergencyStop: number | null;
  /** Level 1 des AB=CD */
  target: number | null;
  /** Nur bei Werten: Kerze des Einstiegs (Index in den Kerzen des Kandidaten; Zone: die C-Kerze, Umkehrkerze: die Kerze, in der sie öffnet), Kerzen bis zur letzten und deren Schluss */
  entryIdx?: number;
  barsSince?: number;
  lastClose?: number;
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
