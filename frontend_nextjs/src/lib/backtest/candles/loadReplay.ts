/**
 * BKT-23: Ticks einzelner Minuten laden: GET /market/{id}/replay?symbol=&start=&m= (Minutenabstände). Der Worker liefert
 * die Spalten wie `replay` bei /rates (Preise in ganzen Punkten); hier werden sie zu `ReplayMinute` mit Preisen.
 * Fehler jeder Art (alter Worker ohne die Adresse = 404, Netz, ungültige Antwort) machen den Abruf „nicht verfügbar“:
 * der Lauf rechnet dann mit dem Kerzenweg weiter, nie mit halben Daten.
 */
import { validReplay, type FetchJson, type ReplayColumns, type ReplayMinute } from '@/lib/backtest/candles/loadRates';

/** Minuten je Anfrage (der Worker erlaubt 2000; die Adresse bleibt so deutlich unter dem Längenlimit) */
export const REPLAY_CHUNK_MINUTES = 1000;
/** Größte Spanne einer Anfrage in Sekunden (Grenze des Workers: 3 Tage) */
export const REPLAY_CHUNK_SPAN_SECONDS = 3 * 86_400;
/** Der Worker rechnet in Etappen (`budget`): so oft dieselbe Anfrage erneut stellen, bevor der Rest als fehlend gilt */
export const REPLAY_RETRIES = 8;
const RETRY_REASONS = new Set(['budget', 'syncing']);

interface MissingRange {
  from: number;
  to: number;
  reason?: string;
}

export interface LoadedReplay {
  minutes: Map<number, ReplayMinute>;
  /** Die Adresse ist nicht erreichbar oder die Antwort ungültig: der Rest der Minuten fehlt */
  unavailable: boolean;
}

/** Aufsteigende Minuten in Anfragen teilen (Anzahl und Spanne begrenzt) */
export function chunkMinutes(sorted: readonly number[]): number[][] {
  const chunks: number[][] = [];
  for (const minute of sorted) {
    const last = chunks[chunks.length - 1];
    if (last && last.length < REPLAY_CHUNK_MINUTES && minute - last[0] <= REPLAY_CHUNK_SPAN_SECONDS) last.push(minute);
    else chunks.push([minute]);
  }
  return chunks;
}

export function replayPath(accountId: string, symbol: string, chunk: readonly number[]): string {
  const diffs = chunk.map((minute, i) => (i === 0 ? 0 : (minute - chunk[i - 1]) / 60));
  return `/market/${encodeURIComponent(accountId)}/replay?symbol=${encodeURIComponent(symbol)}&start=${chunk[0]}&m=${diffs.join(',')}`;
}

/**
 * Lädt die Ticks der Minuten (aufsteigend, volle Minuten) in Anfragen. `stop(ticksSoFar)` darf nach jeder Anfrage das
 * Weiterladen beenden (Tick-Grenze); die nicht geladenen Minuten stehen in `skipped`. Minuten ohne Tick fehlen in `minutes`.
 */
export async function loadReplayMinutes(p: {
  fetchJson: FetchJson;
  accountId: string;
  symbol: string;
  minutes: readonly number[];
  point: number;
  digits: number;
  stop?: (ticks: number) => boolean;
}): Promise<LoadedReplay & { skipped: number[] }> {
  const out: LoadedReplay & { skipped: number[] } = { minutes: new Map(), unavailable: false, skipped: [] };
  const factor = 10 ** p.digits;
  const price = (points: number) => Math.round(points * p.point * factor) / factor;
  const chunks = chunkMinutes(p.minutes);
  let ticks = 0;
  for (let c = 0; c < chunks.length; c++) {
    if (p.stop?.(ticks)) {
      out.skipped.push(...chunks.slice(c).flat());
      break;
    }
    try {
      const path = replayPath(p.accountId, p.symbol, chunks[c]);
      type Answer = Partial<ReplayColumns> & { missing?: MissingRange[] };
      let raw = (await p.fetchJson(path)) as Answer | null;
      for (let retry = 0; retry < REPLAY_RETRIES - 1 && raw?.missing?.some((m) => RETRY_REASONS.has(m.reason ?? '')); retry++) {
        raw = (await p.fetchJson(path)) as Answer | null;
      }
      if (!validReplay(raw)) throw new Error('bad replay response');
      const gaps = ((raw as Answer).missing ?? []).filter((m: MissingRange) => typeof m?.from === 'number' && typeof m?.to === 'number');
      const inGap = (minute: number) => gaps.some((m) => minute >= m.from && minute < m.to);
      const wanted = new Set(chunks[c]);
      raw.t.forEach((time, i) => {
        if (!wanted.has(time) || inGap(time)) return;
        const range = [raw.off[i], raw.off[i + 1]] as const;
        if (range[1] === range[0]) return;
        out.minutes.set(time, { ms: raw.ms.slice(...range), bid: raw.b.slice(...range).map(price), ask: raw.a.slice(...range).map(price) });
        ticks += range[1] - range[0];
      });
      // Minuten in einem fehlenden Bereich (Konto beschäftigt, Fehler, Budget) sind nicht „ohne Tick“: sie gelten als nicht abgespielt
      for (const minute of chunks[c]) if (inGap(minute)) out.skipped.push(minute);
    } catch {
      out.unavailable = true;
      break;
    }
  }
  return out;
}
