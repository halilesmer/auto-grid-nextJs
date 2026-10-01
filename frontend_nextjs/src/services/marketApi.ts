import { axiosInstance } from '@/lib/api';

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
