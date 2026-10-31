import { create } from 'zustand';
import type { FormedHit } from '@/lib/formation/scan';

/** Warum die Zahlen eines Produkts unvollständig sein können: Kerzen fehlen (missing) oder der Abruf/die Rechnung schlug fehl (error) */
export type ScanGap = 'missing' | 'error';

interface FavoritesScanState {
  /** Konto, zu dem die Ergebnisse gehören; null = keins */
  accountId: string | null;
  /** Gebildete Treffer je Produkt (Brokername) */
  results: Record<string, FormedHit[]>;
  /** Produkte, deren Zahlen unvollständig sein können */
  gaps: Record<string, ScanGap>;
  /** M15-Takt (MT5-Sekunden), in dem ein Produkt zuletzt gesucht wurde */
  doneAt: Record<string, number>;
  /** Läuft ein Durchgang: erledigte und alle Produkte */
  progress: { done: number; total: number } | null;
  /** Rechenzeit des letzten Durchgangs in Millisekunden */
  scanMs: number | null;
  reset: (accountId: string | null) => void;
  /** Ergebnisse von Produkten, die keine Favoriten mehr sind, fallen weg */
  prune: (symbols: readonly string[]) => void;
  put: (accountId: string, symbol: string, formed: FormedHit[], at: number, gap: ScanGap | null) => void;
  setProgress: (accountId: string, progress: { done: number; total: number } | null) => void;
  addMs: (accountId: string, ms: number, restart?: boolean) => void;
  applySnapshot: (accountId: string, snapshot: Pick<FavoritesScanState, 'results' | 'gaps' | 'doneAt'>) => void;
}

const empty = { results: {}, gaps: {}, doneAt: {}, progress: null, scanMs: null };

// Aktionen für ein anderes Konto als das aktuelle werden verworfen: ein abgebrochener Durchgang darf nichts mehr schreiben
export const useFavoritesScanStore = create<FavoritesScanState>((set, get) => ({
  accountId: null,
  ...empty,
  reset: (accountId) => set({ accountId, ...empty }),
  prune: (symbols) => {
    const keep = new Set(symbols);
    const only = <T,>(map: Record<string, T>) => Object.fromEntries(Object.entries(map).filter(([s]) => keep.has(s)));
    const s = get();
    set({ results: only(s.results), gaps: only(s.gaps), doneAt: only(s.doneAt) });
  },
  put: (accountId, symbol, formed, at, gap) =>
    set((s) => {
      if (s.accountId !== accountId) return s;
      const gaps = { ...s.gaps };
      if (gap) gaps[symbol] = gap;
      else delete gaps[symbol];
      return { results: { ...s.results, [symbol]: formed }, gaps, doneAt: { ...s.doneAt, [symbol]: at } };
    }),
  setProgress: (accountId, progress) => set((s) => (s.accountId === accountId ? { progress } : s)),
  addMs: (accountId, ms, restart = false) => set((s) => (s.accountId === accountId ? { scanMs: (restart ? 0 : (s.scanMs ?? 0)) + ms } : s)),
  applySnapshot: (accountId, snapshot) => set((s) => (s.accountId === accountId ? snapshot : s)),
}));
