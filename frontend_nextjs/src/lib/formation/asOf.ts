/**
 * Suche zu einem Zeitpunkt in der Vergangenheit (FRM-38, Plan A13.6).
 * `?at=YYYY-MM-DDTHH:MM` ist Brokerzeit (MT5-Sekunden "wie UTC", serverTime.ts), auf 15 Minuten abgerundet.
 * Ohne `at`, bei ungültigem Wert oder ab dem Beginn der laufenden M15-Kerze gilt die Live-Suche (null).
 * Favoriten und Alarm bleiben live: nichts hier berührt den Alarm-Speicher.
 */
import { TIMEFRAME_SEC } from '@/lib/analysis/candles';
import { DAY_SEC, dayOf, dayStart, isDayString } from '@/lib/serverTime';

const M15_SEC = TIMEFRAME_SEC.M15;
const AT_RE = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;

/** `YYYY-MM-DDTHH:MM` → MT5-Sekunden, auf 15 Minuten abgerundet; null bei ungültigem Wert */
export function parseAt(value: string | null | undefined): number | null {
  const m = value ? AT_RE.exec(value) : null;
  if (!m || !isDayString(m[1])) return null;
  const sec = dayStart(m[1]) + Number(m[2]) * 3600 + Number(m[3]) * 60;
  return Math.floor(sec / M15_SEC) * M15_SEC;
}

/** MT5-Sekunden → `YYYY-MM-DDTHH:MM` (für die Adresse) */
export function formatAt(sec: number): string {
  const d = new Date(Math.floor(sec) * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dayOf(sec)}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/**
 * Wert der Adresse → Zeitpunkt der Suche in der Vergangenheit, sonst null (live).
 * `nowSec` = Brokerzeit jetzt; ab dem Beginn der laufenden M15-Kerze gibt es nichts Geschlossenes mehr "danach".
 * Ohne verlässliche Brokeruhr (`nowSec` null) ist keine Prüfung gegen "jetzt" möglich: der Wert gilt, wie er ist.
 */
export function resolveAsOf(value: string | null | undefined, nowSec: number | null): number | null {
  const at = parseAt(value);
  if (at === null) return null;
  if (nowSec !== null && at >= Math.floor(nowSec / M15_SEC) * M15_SEC) return null;
  return at;
}

/** Ende der Kerzen-Anfrage für die Suche zu `at`: `at` selbst (ratesWindow rundet je Zeiteinheit auf) */
export function pastRequestEnd(at: number): number {
  return at;
}

/** Ende des Brokertags von `at` (Obergrenze der D1-Ansicht für splitDaily) */
export function pastDayEnd(at: number): number {
  return dayStart(dayOf(at)) + DAY_SEC;
}

/** Eine Kerze der gewählten Zeiteinheit vor/zurück (dir −1/+1), auf deren Raster; Grundlage der Pfeile in P2 */
export function stepAsOf(at: number, tfSec: number, dir: -1 | 1): number {
  const aligned = Math.floor(at / tfSec) * tfSec;
  if (dir > 0) return aligned + tfSec;
  return aligned === at ? at - tfSec : aligned;
}
