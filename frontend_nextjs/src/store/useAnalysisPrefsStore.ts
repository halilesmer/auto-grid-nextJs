import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Anzeige-Schalter der Analyse-Seite (Zahnrad). Gerätebezogene Vorliebe: nur im localStorage dieses
 * Browsers, nie an den Worker. Datenqualitäts-Warnungen, Datenquelle und Modellgrenzen haben bewusst
 * keinen Schalter (docs/analyse-regeln.md §7).
 */
export interface AnalysisPrefs {
  /** Zonenband: untere/obere Preisgrenze als Linien und Fläche im Chart */
  showZoneLines: boolean;
  /** Karte mit den Einstellungen der Zone über dem Chart */
  showZoneCard: boolean;
  /** Berechnete Grid-Stufen der Zone (Kauf/Verkauf) */
  showLevels: boolean;
  /** Offene Positionen und Pending-Orders der Zone (laufender Bot) */
  showTrades: boolean;
  /** Marktpausen als Trennlinien */
  showPauses: boolean;
  /** RSI(14) im eigenen Bereich unter den Kerzen */
  showRsi: boolean;
}

interface AnalysisPrefsState extends AnalysisPrefs {
  setPref: <K extends keyof AnalysisPrefs>(key: K, value: AnalysisPrefs[K]) => void;
}

export const ANALYSIS_PREFS_KEY = 'grid-robot-analysis-prefs';
const DEFAULTS: AnalysisPrefs = {
  showZoneLines: true,
  showZoneCard: true,
  showLevels: true,
  showTrades: true,
  showPauses: true,
  showRsi: true,
};

export const useAnalysisPrefsStore = create<AnalysisPrefsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setPref: (key, value) => set({ [key]: value } as Pick<AnalysisPrefs, typeof key>),
    }),
    {
      name: ANALYSIS_PREFS_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ showZoneLines, showZoneCard, showLevels, showTrades, showPauses, showRsi }): AnalysisPrefs => ({
        showZoneLines,
        showZoneCard,
        showLevels,
        showTrades,
        showPauses,
        showRsi,
      }),
      // Wie ThemeSync: erst nach der Hydration lesen (rehydrate() in app/chart/page.tsx), sonst SSR-Abweichung
      skipHydration: true,
      // Nur bekannte boolesche Felder übernehmen (alter/kaputter Speicherstand)
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Record<keyof AnalysisPrefs, unknown>>;
        const next = { ...current };
        for (const key of Object.keys(DEFAULTS) as (keyof AnalysisPrefs)[]) {
          if (typeof p[key] === 'boolean') next[key] = p[key] as boolean;
        }
        return next;
      },
    },
  ),
);
