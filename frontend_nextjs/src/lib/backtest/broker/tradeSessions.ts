/**
 * Handelsseiten des Brokers (BKT-21): je Wochentag [von, bis) in Sekunden ab 00:00 der Brokerzeit, Index 0 = Sonntag.
 * Der Worker liest sie aus dem MQL5-Export (worker_python/ops/mt5/AutoGridTradeSessions.mq5); fehlen sie, ist der
 * Plan null und der Lauf kennt keine Schließzeiten.
 */
export type TradeSessions = [number, number][][];

const DAY_SEC = 86_400;

/** Gültigen Plan zurückgeben, sonst null: 7 Tage, je Tag sortierte, überlappungsfreie Seiten 0 ≤ von < bis ≤ 86 400 */
export function parseTradeSessions(raw: unknown): TradeSessions | null {
  if (!Array.isArray(raw) || raw.length !== 7) return null;
  const week: TradeSessions = [];
  for (const day of raw) {
    if (!Array.isArray(day)) return null;
    const sessions: [number, number][] = [];
    let previousEnd = 0;
    for (const item of day) {
      if (!Array.isArray(item) || item.length !== 2) return null;
      const [from, to] = item;
      if (typeof from !== 'number' || typeof to !== 'number' || !Number.isFinite(from) || !Number.isFinite(to)) return null;
      if (from < previousEnd || to <= from || to > DAY_SEC) return null;
      sessions.push([from, to]);
      previousEnd = to;
    }
    week.push(sessions);
  }
  return week;
}

/** Ist zur Brokerzeit `time` (Sekunden) die Handelsseite offen? Eine Seite gilt von (einschließlich) bis (ausschließlich) */
export function tradeOpenAt(sessions: TradeSessions, time: number): boolean {
  const day = Math.floor(time / DAY_SEC);
  const second = time - day * DAY_SEC;
  const weekday = (((day + 4) % 7) + 7) % 7; // Tag 0 (1970-01-01) war ein Donnerstag; 0 = Sonntag
  return sessions[weekday].some(([from, to]) => second >= from && second < to);
}
