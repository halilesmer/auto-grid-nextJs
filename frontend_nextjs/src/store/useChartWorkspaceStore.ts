'use client';

import { create } from 'zustand';
import { DEFAULT_APPEARANCE, parseAppearance, type Appearance } from '@/lib/chart-workspace/settings';
import { INDICATOR_KINDS, newIndicator, type Indicator } from '@/lib/chart-workspace/indicators';

export interface ChartDocument { drawings: string; indicators: Indicator[]; images: Record<string, string>; overlays: Record<string, boolean> }
const EMPTY: ChartDocument = { drawings: '[]', indicators: [], images: {}, overlays: {} };
export const WORKSPACE_STORAGE_KEY = 'grid-robot-chart-workspaces-v1';
export const emptyChartDocument = (): ChartDocument => ({ ...EMPTY, indicators: [], images: {}, overlays: {} });
interface State {
  appearance: Appearance;
  preview: Appearance | null;
  overlayPreview: { key: string; original: Record<string, boolean> } | null;
  beginOverlayPreview: (key: string) => void;
  finishOverlayPreview: (commit: boolean) => void;
  documents: Record<string, ChartDocument>;
  templates: Record<string, Appearance>;
  favorites: string[];
  hydrated: boolean;
  storageError: boolean;
  hydrate: () => void;
  setAppearance: (a: Appearance) => void;
  setPreview: (a: Appearance | null) => void;
  setDocument: (key: string, document: ChartDocument) => void;
  saveTemplate: (name: string, a: Appearance) => void;
  setFavorites: (values: string[]) => void;
}
function parseIndicators(input: unknown): Indicator[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 20).flatMap(v => {
    if (!v || typeof v !== 'object' || !INDICATOR_KINDS.includes(v.kind) || typeof v.id !== 'string') return [];
    const defaults = newIndicator(v.kind);
    const out = { ...defaults, id: v.id };
    for (const k of Object.keys(defaults) as (keyof Indicator)[]) {
      const value = v[k];
      if (typeof defaults[k] === 'boolean' && typeof value === 'boolean') Object.assign(out, { [k]: value });
      if (typeof defaults[k] === 'number' && typeof value === 'number' && Number.isFinite(value)) Object.assign(out, { [k]: Math.max(0, Math.min(86400, value)) });
    }
    out.period = Math.max(1, Math.min(5000, Math.round(out.period))); out.slow = Math.max(1, Math.min(5000, Math.round(out.slow)));
    out.signal = Math.max(1, Math.min(5000, Math.round(out.signal))); out.smoothingPeriod = Math.max(1, Math.min(5000, Math.round(out.smoothingPeriod)));
    out.width = [1, 2, 3, 4].includes(out.width) ? out.width : 1;
    out.source = ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'].includes(v.source) ? v.source : 'close';
    out.smoothing = ['none', 'SMA', 'EMA', 'RMA', 'WMA', 'BB'].includes(v.smoothing) ? v.smoothing : defaults.smoothing;
    for (const k of ['color', 'negative', 'maColor'] as const) if (typeof v[k] === 'string' && /^#[\da-f]{6}$/i.test(v[k])) out[k] = v[k];
    out.upper = Math.min(100, out.upper); out.lower = Math.min(out.upper, out.lower); out.middle = Math.max(out.lower, Math.min(out.upper, out.middle));
    return [out];
  });
}
export const useChartWorkspaceStore = create<State>((set, get) => {
  const persist = () => {
    const s = get();
    if (!s.hydrated) return;
    try {
      const documents = Object.fromEntries(Object.entries(s.documents).map(([key, d]) => {
        for (const [id, data] of Object.entries(d.images)) if (localStorage.getItem(`${WORKSPACE_STORAGE_KEY}-image-${id}`) !== data) localStorage.setItem(`${WORKSPACE_STORAGE_KEY}-image-${id}`, data);
        return [key, { ...d, overlays: s.overlayPreview?.key === key ? s.overlayPreview.original : d.overlays, images: Object.fromEntries(Object.keys(d.images).map(id => [id, true])) }];
      }));
      localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ version: 1, appearance: s.appearance, documents, templates: s.templates, favorites: s.favorites }));
      // Delete orphan image bytes only after the replacement metadata is safely written.
      const prefix = `${WORKSPACE_STORAGE_KEY}-image-`, usedImages = new Set(Object.values(s.documents).flatMap(d => Object.keys(d.images)));
      for (let i = localStorage.length - 1; i >= 0; i--) { const key = localStorage.key(i); if (key?.startsWith(prefix) && !usedImages.has(key.slice(prefix.length))) localStorage.removeItem(key); }
      set({ storageError: false });
    }
    catch { set({ storageError: true }); } // Quota/private mode: keep the current session and show a visible warning.
  };
  return {
    appearance: { ...DEFAULT_APPEARANCE }, preview: null, overlayPreview: null, documents: {}, templates: {}, favorites: ['trend-line', 'horizontal-line', 'fib-retracement'], hydrated: false, storageError: false,
    hydrate: () => {
      if (get().hydrated) return;
      try {
        const raw = JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY) || 'null');
        const documents: Record<string, ChartDocument> = {}, templates: Record<string, Appearance> = {};
        if (raw?.version === 1) {
          for (const [key, unknownDoc] of Object.entries(raw.documents ?? {})) {
            const d = unknownDoc as Partial<ChartDocument>;
            if (!d || typeof d !== 'object') continue;
            const images: Record<string, string> = {};
            for (const [name, ref] of Object.entries(d.images ?? {})) {
              const value = typeof ref === 'string' ? ref : localStorage.getItem(`${WORKSPACE_STORAGE_KEY}-image-${name}`);
              if (typeof value === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(value) && value.length < 2_800_000) images[name] = value;
            }
            const overlays = Object.fromEntries(Object.entries(d.overlays ?? {}).filter(([, v]) => typeof v === 'boolean'));
            documents[key] = { drawings: typeof d.drawings === 'string' ? d.drawings : '[]', indicators: parseIndicators(d.indicators), images, overlays };
          }
          for (const [key, value] of Object.entries(raw.templates ?? {})) templates[key] = parseAppearance(value);
        }
        set({ hydrated: true, appearance: parseAppearance(raw?.appearance), documents, templates, favorites: Array.isArray(raw?.favorites) ? raw.favorites.filter((x: unknown) => typeof x === 'string') : get().favorites });
      } catch { set({ hydrated: true, storageError: true }); }
    },
    beginOverlayPreview: key => set({ overlayPreview: { key, original: { ...get().documents[key]?.overlays } } }),
    finishOverlayPreview: commit => {
      const snapshot = get().overlayPreview;
      if (!snapshot) return;
      set(state => ({ overlayPreview: null, documents: !commit && state.documents[snapshot.key] ? { ...state.documents, [snapshot.key]: { ...state.documents[snapshot.key], overlays: snapshot.original } } : state.documents }));
      persist();
    },
    setAppearance: appearance => { set({ appearance: parseAppearance(appearance), preview: null }); persist(); },
    setPreview: preview => set({ preview }),
    setDocument: (key, document) => { set(s => ({ documents: { ...s.documents, [key]: document } })); persist(); },
    saveTemplate: (name, appearance) => { if (!name.trim()) return; set(s => ({ templates: { ...s.templates, [name.trim()]: parseAppearance(appearance) } })); persist(); },
    setFavorites: favorites => { set({ favorites }); persist(); },
  };
});
