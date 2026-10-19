import { create } from 'zustand';
import type { CollectedRun } from '@/lib/backtest/liveCompare';

/**
 * BKT-14: übernommene Backtest-Läufe für den Live-Vergleich, je Zone (Magic) einer. Sie überleben das Entfernen der
 * Setups, damit mehr als sechs Zonen in zwei Durchgängen in einen Bericht kommen. Ein Kontowechsel leert sie.
 */
interface LiveCompareState {
  accountId: string | null;
  runs: Record<number, CollectedRun>;
  collect: (accountId: string, runs: CollectedRun[]) => void;
  remove: (magic: number) => void;
  clearUnless: (accountId: string | null) => void;
}

export const useLiveCompareStore = create<LiveCompareState>()((set, get) => ({
  accountId: null,
  runs: {},
  collect: (accountId, runs) => set((s) => ({
    accountId,
    runs: { ...(s.accountId === accountId ? s.runs : {}), ...Object.fromEntries(runs.map((run) => [run.magic, run])) },
  })),
  remove: (magic) => set((s) => {
    const runs = { ...s.runs };
    delete runs[magic];
    return { runs };
  }),
  clearUnless: (accountId) => { if (get().accountId !== accountId) set({ accountId, runs: {} }); },
}));
