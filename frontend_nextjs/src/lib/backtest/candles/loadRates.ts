/**
 * Kerzen für den Backtest laden: GET /market/{id}/rates seitenweise (`next_from`), Preise in Float64Array.
 * Fehlende Bereiche (`missing`) bleiben sichtbar und werden nie aufgefüllt (docs/analyse-regeln.md §3).
 * Läuft im Web Worker; die HTTP-Anfrage selbst kommt als Funktion herein (`fetchJson`), damit der Test ohne Netz läuft.
 */
import type { MissingRange } from '@/lib/analysis/candles';
import { RunError } from '@/lib/backtest/runContext';

export const MAX_CANDLES = 1_000_000;
/** Der Worker rechnet Tick-Stücke in Etappen (`budget`) und lädt unfertige Historie nach (`syncing`): so oft dieselbe Seite neu holen */
export const TICK_RETRIES = 15;
const RETRY_REASONS = new Set(['budget', 'syncing']);

export type FetchJson = (path: string) => Promise<unknown>;

/** Ticks einer Minute (alt → neu): Zeit in ms ab Minutenanfang, Bid und Ask als Preise */
export interface ReplayMinute {
  ms: number[];
  bid: number[];
  ask: number[];
}

export interface LoadedRates {
  t: Float64Array;
  o: Float64Array;
  h: Float64Array;
  l: Float64Array;
  c: Float64Array;
  /** Spread je Kerze in Punkten; NaN = unbekannt (z. B. CSV-Import) */
  s: Float64Array;
  /** BKT-19 (nur mit `tickSpread`): zeitgewichteter und größter Tick-Spread je Minute in Punkten; NaN = keine Tick-Daten */
  sa?: Float64Array;
  sx?: Float64Array;
  /** BKT-20 (nur mit `tickReplay`): Ticks der Rollover-/Sprung-Minuten, Schlüssel = Minutenbeginn; ms ab Minutenanfang, Preise */
  replay?: Map<number, ReplayMinute>;
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
  /** BKT-19: Minuten-Spread aus Ticks mitladen (nur M1, nur MT5-Quelle) */
  tickSpread?: boolean;
  /** BKT-20: dazu die Ticks der Rollover-/Sprung-Minuten (braucht `tickSpread`) */
  tickReplay?: boolean;
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
  sa?: (number | null)[];
  sx?: (number | null)[];
  tick_missing?: { reason?: string }[];
  replay?: ReplayColumns;
  missing?: MissingRange[];
  next_from: number | null;
  live_from?: number | null;
  digits?: number | null;
  point?: number | null;
}

/** Antwort-Spalten der Replay-Minuten: `off[i]` = Start der Minute i in ms/b/a (Länge + 1, aufsteigend), Preise in ganzen Punkten */
interface ReplayColumns {
  t: number[];
  kind: string[];
  off: number[];
  ms: number[];
  b: number[];
  a: number[];
}

const isNumArray = (v: unknown): v is number[] => Array.isArray(v) && v.every((x) => typeof x === 'number');

function validReplay(r: unknown): r is ReplayColumns {
  const c = r as Partial<ReplayColumns> | null;
  if (!c || !isNumArray(c.t) || !isNumArray(c.off) || !isNumArray(c.ms) || !isNumArray(c.b) || !isNumArray(c.a)) return false;
  if (!Array.isArray(c.kind) || c.kind.length !== c.t.length || c.off.length !== c.t.length + 1) return false;
  const total = c.ms.length;
  if (c.b.length !== total || c.a.length !== total || c.off[0] !== 0 || c.off[c.off.length - 1] !== total) return false;
  for (let i = 1; i < c.off.length; i++) if (c.off[i] < c.off[i - 1]) return false;
  for (let i = 0; i < total; i++) if (!(c.ms[i] >= 0 && c.ms[i] < 60_000) || c.b[i] > c.a[i]) return false;
  return true;
}

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
  const tickCols = [page.sa, page.sx];
  if (tickCols.some((col) => col !== undefined && (!Array.isArray(col) || col.length !== n || col.some((x) => x !== null && typeof x !== 'number')))) {
    throw new RunError('run.badRatesResponse');
  }
  if (page.replay !== undefined && !validReplay(page.replay)) throw new RunError('run.badRatesResponse');
  if (page.next_from !== null && typeof page.next_from !== 'number') throw new RunError('run.badRatesResponse');
  if (page.missing !== undefined && !Array.isArray(page.missing)) throw new RunError('run.badRatesResponse');
  return page as Page;
}

function keepReplay(r: ReplayColumns, keep: boolean[]): ReplayColumns {
  const out: ReplayColumns = { t: [], kind: [], off: [0], ms: [], b: [], a: [] };
  r.t.forEach((time, i) => {
    if (!keep[i]) return;
    out.t.push(time);
    out.kind.push(r.kind[i]);
    for (let k = r.off[i]; k < r.off[i + 1]; k++) {
      out.ms.push(r.ms[k]);
      out.b.push(r.b[k]);
      out.a.push(r.a[k]);
    }
    out.off.push(out.ms.length);
  });
  return out;
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
    if (p.tickSpread) query.set('tick_spread', '1');
    if (p.tickSpread && p.tickReplay) query.set('tick_replay', '1');
    let page = parsePage(await p.fetchJson(`/market/${encodeURIComponent(p.accountId)}/rates?${query}`));
    // Noch nicht fertig berechnete oder noch ladende Tick-Stücke: dieselbe Seite erneut holen (der Worker macht weiter)
    for (let retry = 0; p.tickSpread && retry < TICK_RETRIES - 1 && page.tick_missing?.some((m) => RETRY_REASONS.has(m.reason ?? '')); retry++) {
      page = parsePage(await p.fetchJson(`/market/${encodeURIComponent(p.accountId)}/rates?${query}`));
    }
    // Die laufende Kerze ist unfertig: sie zählt nicht (docs/analyse-regeln.md §3), sonst wäre der Lauf nicht wiederholbar
    if (typeof page.live_from === 'number') {
      liveFrom = page.live_from;
      const cut = page.t.indexOf(page.live_from);
      if (cut >= 0) for (const col of [page.t, page.o, page.h, page.l, page.c, page.s ?? [], page.sa ?? [], page.sx ?? []]) col.length = Math.min(col.length, cut);
    }
    // Der Worker richtet `from` nach unten auf das Raster aus: Kerzen davor gehören nicht zum Zeitraum
    const lead = page.t.findIndex((time) => time >= p.from);
    const skip = lead < 0 ? page.t.length : lead;
    if (skip > 0) for (const col of [page.t, page.o, page.h, page.l, page.c, page.s ?? [], page.sa ?? [], page.sx ?? []]) col.splice(0, skip);
    if (page.replay) {
      const first = page.t[0] ?? Infinity;
      const last = page.t[page.t.length - 1] ?? -Infinity;
      const keep = page.replay.t.map((time) => time >= first && time <= last);
      page.replay = keepReplay(page.replay, keep);
    }
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
  if (p.tickSpread && p.tickReplay) out.replay = new Map();
  if (p.tickSpread) {
    out.sa = new Float64Array(count).fill(NaN);
    out.sx = new Float64Array(count).fill(NaN);
  }
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
    for (const [column, target] of [[page.sa, out.sa], [page.sx, out.sx]] as const) {
      column?.forEach((v, i) => {
        if (target && typeof v === 'number') target[at + i] = v;
      });
    }
    at += page.t.length;
  }
  if (out.replay) {
    const factor = digits === null ? null : 10 ** digits;
    for (const page of pages) {
      const r = page.replay;
      if (!r || r.t.length === 0) continue;
      const step = page.point ?? point;
      if (step === null || step === undefined || factor === null) throw new RunError('run.badRatesResponse');
      const price = (points: number) => Math.round(points * step * factor) / factor;
      r.t.forEach((time, i) => {
        const range = [r.off[i], r.off[i + 1]] as const;
        out.replay?.set(time, { ms: r.ms.slice(...range), bid: r.b.slice(...range).map(price), ask: r.a.slice(...range).map(price) });
      });
    }
  }
  p.onProgress?.(1);
  return out;
}
