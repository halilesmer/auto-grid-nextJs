import { create } from 'zustand';
import type { ZoneSettings } from '@/store/types';

/**
 * Übergabe Zone → Backtest (BKT-06, docs/journal/2026-10-06-backtest-module-plan.md): der Test-Knopf einer Zone
 * legt eine Kopie der Zone (auch mit ungespeicherten Änderungen) hier ab, die Seite /backtest liest sie beim
 * Öffnen einmal und leert den Speicher. Nur im Arbeitsspeicher: ein Neuladen oder ein Link in einem neuen Tab
 * nimmt die gespeicherte Zone (die ungespeicherten Änderungen gehen beim Neuladen ohnehin verloren). Der Backtest
 * speichert nie eine Zone zurück.
 */
export interface BacktestHandoff {
  accountId: string;
  zoneId: string;
  /** Kopie zum Zeitpunkt des Klicks */
  zone: ZoneSettings;
  /** Die Zone hatte beim Klick ungespeicherte Änderungen */
  unsaved: boolean;
  /** Zeitpunkt des Klicks (ms); eine ältere Übergabe, die liegen blieb, gilt nicht mehr */
  at: number;
}

/** So lange gilt eine Übergabe: der Wechsel zur Seite folgt dem Klick sofort */
export const HANDOFF_MAX_AGE_MS = 60_000;

interface HandoffState {
  handoff: BacktestHandoff | null;
  setHandoff: (handoff: BacktestHandoff) => void;
  clearHandoff: () => void;
}

export const useBacktestHandoffStore = create<HandoffState>()((set) => ({
  handoff: null,
  setHandoff: (handoff) => set({ handoff: { ...handoff, zone: structuredClone(handoff.zone) } }),
  clearHandoff: () => set({ handoff: null }),
}));
