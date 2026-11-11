import { axiosInstance } from '@/lib/api';
import type { Deal, ZoneRegistryEntry } from '@/lib/analysis/tradePairing';
import type { LiveOrder } from '@/lib/backtest/startState';

/** Fehlender Teil des Deal-Archivs (market_sync.get_deals): busy = Konto startet/stoppt, error = MT5-Fehler */
export interface DealsMissing {
  from: number;
  to: number;
  reason: string;
  detail?: string;
}

/** GET /history/{id}/deals: Deals [from, to) in MT5-Zeit + Einstiege älterer Positionen + Zonen-Register. */
export interface DealsResponse {
  account_id: string;
  from: number;
  to: number;
  deals: Deal[];
  account: { currency: string | null; balance: number | null; margin_mode: number | null; updated_at: number } | null;
  zones: ZoneRegistryEntry[];
  missing: DealsMissing[];
}

export async function fetchDeals(
  accountId: string,
  query: { from: number; to: number },
  signal?: AbortSignal,
): Promise<DealsResponse> {
  const res = await axiosInstance.get<DealsResponse>(`/history/${encodeURIComponent(accountId)}/deals`, {
    params: query,
    signal,
  });
  return res.data;
}

/** GET /history/{id}/orders (BKT-24): Pending Orders, die irgendwann in [from, to) warteten; `to = from + 1` = Zustand bei `from`. */
export interface LiveOrdersResponse {
  account_id: string;
  from: number;
  to: number;
  orders: LiveOrder[];
  missing: DealsMissing[];
  /** So weit zurück (Sekunden) sucht der Worker nach vor `from` gesetzten Orders; ältere können fehlen */
  lookback_sec: number;
}

export async function fetchLiveOrders(
  accountId: string,
  query: { from: number; to: number },
  signal?: AbortSignal,
): Promise<LiveOrdersResponse> {
  const res = await axiosInstance.get<LiveOrdersResponse>(`/history/${encodeURIComponent(accountId)}/orders`, {
    params: query,
    signal,
  });
  return res.data;
}
