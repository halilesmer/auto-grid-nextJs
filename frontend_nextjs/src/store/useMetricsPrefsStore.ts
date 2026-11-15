import { create } from 'zustand';

export const METRICS_LEGACY_KEY = 'grid-robot-metrics-pinned';

/** Alter Browser-Wert (vor USR-15); null = keiner */
export function readLegacyPinned(): boolean | null {
  try {
    const raw = localStorage.getItem(METRICS_LEGACY_KEY);
    return raw === null ? null : raw !== 'false';
  } catch {
    return null;
  }
}

/** „Kennzahlen angeheftet“ des Benutzers (worker `metrics_pinned`, USR-15). Standard: angeheftet. */
export const useMetricsPrefsStore = create<{ pinned: boolean }>()(() => ({
  pinned: typeof window === 'undefined' ? true : (readLegacyPinned() ?? true),
}));
