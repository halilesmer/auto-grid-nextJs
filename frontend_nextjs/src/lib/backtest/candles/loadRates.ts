/**
 * Kerzen für den Backtest laden: GET /market/{id}/rates seitenweise (`next_from`), Preise in Float64Array.
 * Fehlende Bereiche (`missing`) bleiben sichtbar und werden nie aufgefüllt (docs/analyse-regeln.md §3).
 * Läuft im Web Worker; die HTTP-Anfrage selbst kommt als Funktion herein (`fetchJson`), damit der Test ohne Netz läuft.
 */
import type { MissingRange } from '@/lib/analysis/candles';
import { RunError } from '@/lib/backtest/runContext';

export const MAX_CANDLES = 1_000_000;

export type FetchJson = (path: string) => Promise<unknown>;

export interface LoadedRates {
  t: Float64Array;
  o: Float64Array;
  h: Float64Array;
  l: Float64Array;
  c: Float64Array;
  /** Spread je Kerze in Punkten; NaN = unbekannt (z. B. CSV-Import) */
  s: Float64Array;
  missing: MissingRange[];
  digits: number | null;
  point: number | null;
  /** Beginn der laufenden (unfertigen) Kerze, die der Worker an die letzte Seite hängt; sie ist aus den Spalten entfernt */
  liveFrom: number | null;
}

export interface LoadRatesParams {
  fetchJson: FetchJson;
  accountId: string;
  symbol: string;
  timeframe: string;
  /** Bereich [from, to), MT5-Sekunden */
  from: number;
  to: number;
  /** `csv:<import_id>` für einen CSV-Import, sonst der MT5-Server des Kontos */
  source?: string;
  maxCandles?: number;
  /** Anteil des Zeitraums, der geladen ist (0…1) */
  onProgress?: (fraction: number) => void;
}

interface Page {
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  s?: (number | null)[];
  missing?: MissingRange[];
  next_from: number | null;
  live_from?: number | null;
  digits?: number | null;
  point?: number | null;
}

const isNumArray = (v: unknown): v is number[] => Array.isArray(v) && v.every((x) => typeof x === 'number');

/** Antwort des Workers prüfen (Systemgrenze): alle Spalten gleich lang, Zahlen */
function parsePage(raw: unknown): Page {
  const page = raw as Partial<Page> | null;
  if (!page || !isNumArray(page.t) || !isNumArray(page.o) || !isNumArray(page.h) || !isNumArray(page.l) || !isNumArray(page.c)) {
    throw new RunError('run.badRatesResponse');
  }
  const n = page.t.length;
  if ([page.o, page.h, page.l, page.c].some((col) => col.length !== n) || (page.s && page.s.length !== n)) {
    throw new RunError('run.badRatesResponse');
  }
  if (page.next_from !== null && typeof page.next_from !== 'number') throw new RunError('run.badRatesResponse');
  if (page.missing !== undefined && !Array.isArray(page.missing)) throw new RunError('run.badRatesResponse');
  return page as Page;
}

export async function loadRates(p: LoadRatesParams): Promise<LoadedRates> {
  if (!Number.isFinite(p.from) || !Number.isFinite(p.to) || p.from >= p.to) throw new RunError('run.badRange', { from: p.from, to: p.to });
  const limit = p.maxCandles ?? MAX_CANDLES;
  const pages: Page[] = [];
  const missing: MissingRange[] = [];
  let count = 0;
  let cursor = p.from;
  let lastTime = -Infinity;
  let digits: number | null = null;
  let point: number | null = null;
  let liveFrom: number | null = null;

  while (cursor < p.to) {
    const query = new URLSearchParams({ symbol: p.symbol, timeframe: p.timeframe, from: String(cursor), to: String(p.to) });
    if (p.source) query.set('source', p.source);
    const page = parsePage(await p.fetchJson(`/market/${encodeURIComponent(p.accountId)}/rates?${query}`));
    // Die laufende Kerze ist unfertig: sie zählt nicht (docs/analyse-regeln.md §3), sonst wäre der Lauf nicht wiederholbar
    if (typeof page.live_from === 'number') {
      liveFrom = page.live_from;
      const cut = page.t.indexOf(page.live_from);
      if (cut >= 0) for (const col of [page.t, page.o, page.h, page.l, page.c, page.s ?? []]) col.length = Math.min(col.length, cut);
    }
    // Der Worker richtet `from` nach unten auf das Raster aus: Kerzen davor gehören nicht zum Zeitraum
    const lead = page.t.findIndex((time) => time >= p.from);
    const skip = lead < 0 ? page.t.length : lead;
    if (skip > 0) for (const col of [page.t, page.o, page.h, page.l, page.c, page.s ?? []]) col.splice(0, skip);
    for (const time of page.t) {
      if (!(time > lastTime)) throw new RunError('run.ratesNotAscending', { time });
      lastTime = time;
    }
    count += page.t.length;
    if (count > limit) throw new RunError('run.tooManyCandles', { limit });
    pages.push(page);
    missing.push(...(page.missing ?? []));
    digits = page.digits ?? digits;
    point = page.point ?? point;
    if (page.next_from === null) break;
    if (page.next_from <= cursor) throw new RunError('run.badRatesResponse');
    cursor = page.next_from;
    p.onProgress?.(Math.min(1, (cursor - p.from) / (p.to - p.from)));
  }

  const out: LoadedRates = {
    t: new Float64Array(count),
    o: new Float64Array(count),
    h: new Float64Array(count),
    l: new Float64Array(count),
    c: new Float64Array(count),
    s: new Float64Array(count).fill(NaN),
    missing,
    digits,
    point,
    liveFrom,
  };
  let at = 0;
  for (const page of pages) {
    out.t.set(page.t, at);
    out.o.set(page.o, at);
    out.h.set(page.h, at);
    out.l.set(page.l, at);
    out.c.set(page.c, at);
    page.s?.forEach((v, i) => {
      if (typeof v === 'number') out.s[at + i] = v;
    });
    at += page.t.length;
  }
  p.onProgress?.(1);
  return out;
}
