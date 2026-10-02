import { axiosInstance } from '@/lib/api';
import type { MissingRange, Timeframe } from '@/lib/analysis/candles';

/**
 * GET /market/{id}/clock: Abstand der Brokeruhr zu UTC (worker_python/src/api/market.py).
 * Nur `reliable` liefert einen Abstand; ohne sichere Messung (Markt zu) sind die Werte null.
 */
export type BrokerClock =
  | {
      account_id: string;
      reliable: true;
      offset_sec: number;
      offset_hours: number;
      raw_sec: number;
      source_symbol: string;
      measured_at: number;
      server_now: number;
      cached: boolean;
    }
  | { account_id: string; reliable: false; offset_sec: null; offset_hours: null; server_now: null; cached: boolean };

export async function fetchBrokerClock(accountId: string): Promise<BrokerClock> {
  const res = await axiosInstance.get<BrokerClock>(`/market/${encodeURIComponent(accountId)}/clock`);
  return res.data;
}

/** GET /market/{id}/rates: Kerzen [from, to) in MT5-Zeit, spaltenweise (market_sync.get_rates). */
export interface RatesResponse {
  account_id: string;
  source: string;
  symbol: string;
  timeframe: string;
  from: number;
  to: number;
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: (number | null)[];
  s: (number | null)[];
  /** Zeit der laufenden (nie gespeicherten) Kerze, falls sie in der Antwort ist */
  live_from: number | null;
  digits: number | null;
  point: number | null;
  /** Weitere Kerzen ab hier (höchstens 50.000 je Antwort); null = vollständig */
  next_from: number | null;
  missing: MissingRange[];
  db_full: boolean;
  server_now: number | null;
  offset_sec: number | null;
}

export interface RatesQuery {
  symbol: string;
  timeframe: Timeframe;
  from: number;
  to: number;
}

export async function fetchRates(accountId: string, query: RatesQuery, signal?: AbortSignal): Promise<RatesResponse> {
  const res = await axiosInstance.get<RatesResponse>(`/market/${encodeURIComponent(accountId)}/rates`, {
    params: query,
    signal,
  });
  return res.data;
}
