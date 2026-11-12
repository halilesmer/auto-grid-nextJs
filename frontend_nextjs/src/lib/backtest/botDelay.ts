/**
 * BKT-26: Zeit zwischen Füllung und TP/SL-Änderung des Bots (live gemessen, n = 463: Median 0,70 s,
 * p25 0,17, p75 1,29, p95 1,90). Eine Stelle für alle Verzögerungen des Bots; die Tepki-Verzögerung (Klasse B,
 * BOT_REACT_DELAY_S unten) ersetzt die Verzögerung im Broker: ist sie an, bleibt A2 aus (gemessen: mit beiden identisch).
 */

/** Median je Symbol (Sekunden) */
export const SYMBOL_SLTP_DELAY_S: Readonly<Record<string, number>> = {
  XAUUSD: 0.76,
  USOUSD: 0.62,
  USDJPY: 0.41,
  EURCHF: 0.22,
};

/** Globaler Median für Symbole ohne eigene Messung */
export const DEFAULT_SLTP_DELAY_S = 0.7;

/** Verzögerung in Sekunden; Name auf die ersten sechs Buchstaben gekürzt (Broker-Suffixe wie „.r“ fallen weg) */
export function sltpDelaySeconds(symbolName: string, table: Readonly<Record<string, number>> = SYMBOL_SLTP_DELAY_S): number {
  const letters = symbolName.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
  return table[letters] ?? DEFAULT_SLTP_DELAY_S;
}

/**
 * BKT-26 (B): Zeit zwischen Tetik (Füllung oder Schließung) und dem nächsten Lauf des Bots.
 * Live reagiert der Bot nach einem SL-Close erst nach einigen Sekunden; der Backtest platzierte im selben Moment neu.
 * Ein Wert aus einem Ereignisfenster (P7): in P8 prüfen. Wert 0 schaltet die Verzögerung ab.
 */
export const BOT_REACT_DELAY_S = 2;
