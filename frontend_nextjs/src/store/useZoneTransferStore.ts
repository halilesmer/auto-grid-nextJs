import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { presetZone, type PresetZone } from '@/lib/backtest/presets';

export interface ZoneTransfer {
  accountId: string;
  targetId: string | null;
  zone: PresetZone;
  baseUrl: string;
  owner: string;
  at: number;
}

interface TransferState {
  pending: ZoneTransfer | null;
  applied: { accountId: string; zoneId: string } | null;
  complete: (applied: { accountId: string; zoneId: string }) => void;
  stage: (transfer: Omit<ZoneTransfer, 'at'>) => void;
  clear: () => void;
}

/** Einmalige Übergabe im selben Browser-Tab, ohne Credentials oder Laufdaten. */
export const useZoneTransferStore = create<TransferState>()(persist((set) => ({
  pending: null,
  applied: null,
  complete: (applied) => set({ pending: null, applied }),
  stage: (transfer) => set({ applied: null, pending: { ...transfer, zone: presetZone(transfer.zone), at: Date.now() } }),
  clear: () => set({ pending: null }),
}), {
  name: 'grid-robot-zone-transfer',
  storage: createJSONStorage(() => sessionStorage),
  skipHydration: true,
  partialize: (state) => ({ pending: state.pending }),
  merge: (stored, current) => {
    const candidate = (stored as { pending?: unknown } | undefined)?.pending;
    if (!candidate || typeof candidate !== 'object') return current;
    const value = candidate as Record<string, unknown>;
    if (typeof value.accountId !== 'string' || !/^\d+$/.test(value.accountId)
      || (value.targetId !== null && typeof value.targetId !== 'string')
      || typeof value.baseUrl !== 'string' || typeof value.owner !== 'string'
      || typeof value.at !== 'number' || !Number.isFinite(value.at)) return current;
    try {
      return { ...current, pending: { accountId: value.accountId, targetId: value.targetId,
        baseUrl: value.baseUrl, owner: value.owner, at: value.at, zone: presetZone(value.zone) } };
    } catch {
      // Ungültiger Sitzungsspeicher darf keinen Dashboard-Entwurf verändern.
      return current;
    }
  },
}));
