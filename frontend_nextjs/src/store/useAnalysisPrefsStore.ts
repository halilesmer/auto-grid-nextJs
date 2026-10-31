import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_TREND_SETTINGS, type TrendSettings } from '@/lib/formation/params';
import { sanitizeTrendSettings } from '@/lib/formation/trdPath';

/**
 * Anzeige-Schalter der Analyse-Seite (Zahnrad). Gerätebezogene Vorliebe: nur im localStorage dieses
 * Browsers, nie an den Worker. Zahnrad und Chart-Legende schalten dieselben Werte. Datenqualitäts-Hinweise,
 * Datenquelle und Modellgrenzen haben bewusst keinen Schalter (docs/analyse-regeln.md §7).
 */
export interface AnalysisPrefs {
  /** Zonenband: untere/obere Preisgrenze als Linien und Fläche im Chart */
  showZoneLines: boolean;
  /** Karte mit den Einstellungen der Zone über dem Chart */
  showZoneCard: boolean;
  /** Berechnete Grid-Stufen der Zone (Kauf/Verkauf) */
  showLevels: boolean;
  /** Offene Positionen der Zone mit TP/SL (laufender Bot); Schlüssel aus der Zeit, als er auch die Orders schaltete */
  showTrades: boolean;
  /** Pending-Orders der Zone (laufender Bot) */
  showOrders: boolean;
  /** Marktpausen als Trennlinien */
  showPauses: boolean;
  /** RSI(14) im eigenen Bereich unter den Kerzen */
  showRsi: boolean;
  /** Abgeschlossene Trades aus dem Archiv als Pfeile im Chart */
  showHistory: boolean;
  /** Fraktale (nur Fraktal-Zonen) */
  showFractals: boolean;
  /** Schraffur fehlender Daten im Chart; der Hinweis über dem Chart bleibt immer */
  showGaps: boolean;
}

interface AnalysisPrefsState extends AnalysisPrefs {
  /** Trendzug im Chart (ANA-21), nicht Teil der Vorschau des Einstellungsdialogs */
  showTrend: boolean;
  trend: TrendSettings;
  setShowTrend: (value: boolean) => void;
  setTrend: (patch: Partial<TrendSettings>) => void;
  resetTrend: () => void;
  previewBackup: AnalysisPrefs | null;
  beginPreview: () => void;
  finishPreview: (commit: boolean) => void;
  setPref: <K extends keyof AnalysisPrefs>(key: K, value: AnalysisPrefs[K]) => void;
}

export const ANALYSIS_PREFS_KEY = 'grid-robot-analysis-prefs';
const DEFAULTS: AnalysisPrefs = {
  showZoneLines: true,
  showZoneCard: true,
  showLevels: true,
  showTrades: true,
  showOrders: true,
  showPauses: true,
  showRsi: true,
  showHistory: true,
  showFractals: true,
  showGaps: true,
};

export const useAnalysisPrefsStore = create<AnalysisPrefsState>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,
      showTrend: false,
      trend: DEFAULT_TREND_SETTINGS,
      setShowTrend: value => set({ showTrend: value }),
      setTrend: patch => set({ trend: sanitizeTrendSettings({ ...get().trend, ...patch }) }),
      resetTrend: () => set({ trend: DEFAULT_TREND_SETTINGS }),
      previewBackup: null,
      beginPreview: () => {
        const state = get(), backup = { ...DEFAULTS };
        if (state.previewBackup) return;
        for (const key of Object.keys(DEFAULTS) as (keyof AnalysisPrefs)[]) backup[key] = state[key];
        set({ previewBackup: backup });
      },
      finishPreview: commit => {
        const backup = get().previewBackup;
        if (!backup) return;
        if (commit) set({ previewBackup: null });
        else set({ ...backup, previewBackup: null });
      },
      setPref: (key, value) => set({ [key]: value } as Pick<AnalysisPrefs, typeof key>),
    }),
    {
      name: ANALYSIS_PREFS_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => {
        const out = { ...DEFAULTS };
        for (const key of Object.keys(DEFAULTS) as (keyof AnalysisPrefs)[]) out[key] = (s.previewBackup ?? s)[key];
        return { ...out, showTrend: s.showTrend, trend: s.trend };
      },
      // Wie ThemeSync: erst nach der Hydration lesen (rehydrate() in app/chart/page.tsx), sonst SSR-Abweichung
      skipHydration: true,
      // Nur bekannte boolesche Felder übernehmen (alter/kaputter Speicherstand)
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Record<keyof AnalysisPrefs | 'showTrend' | 'trend', unknown>>;
        const next = { ...current };
        if (typeof p.showTrend === 'boolean') next.showTrend = p.showTrend;
        next.trend = sanitizeTrendSettings(p.trend);
        for (const key of Object.keys(DEFAULTS) as (keyof AnalysisPrefs)[]) {
          if (typeof p[key] === 'boolean') next[key] = p[key] as boolean;
        }
        return next;
      },
    },
  ),
);
