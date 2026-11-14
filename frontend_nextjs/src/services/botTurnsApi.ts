import { axiosInstance } from '@/lib/api';
import type { TelemetryTurns } from '@/lib/backtest/turnSchedule';

/** GET /bot/{id}/turns (ENG-35): Tur-Telemetrie [from, to) in UTC-Millisekunden, höchstens 2 Tage */
export async function fetchBotTurns(accountId: string, query: { from: number; to: number }, signal?: AbortSignal): Promise<TelemetryTurns> {
  const res = await axiosInstance.get<TelemetryTurns>(`/bot/${encodeURIComponent(accountId)}/turns`, { params: query, signal });
  return res.data;
}
