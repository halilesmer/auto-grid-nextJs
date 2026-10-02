import { axiosInstance } from '@/lib/api';
import type { Deal, ZoneRegistryEntry } from '@/lib/analysis/tradePairing';

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
