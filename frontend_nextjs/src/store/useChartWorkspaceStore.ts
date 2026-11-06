'use client';

import { create } from 'zustand';
import { defaultToolbar, parseToolbar, parseToolbarLayout, type ToolbarLayout, type ToolbarPreferences } from '@/lib/chart-workspace/toolbar';
import { defaultDockLayout, migrateToolbarLayout, parseDockLayout, type DockLayout } from '@/lib/chart-workspace/dock';
import { mergeDrawings, parseDrawings, rebaseDrawings } from '@/lib/chart-workspace/linkedDrawings';
import { DEFAULT_APPEARANCE, parseAppearance, type Appearance } from '@/lib/chart-workspace/settings';
import { INDICATOR_KINDS, newIndicator, type Indicator } from '@/lib/chart-workspace/indicators';
import { parsePaneOrder, parseSystemPanes, type SystemPaneStates } from '@/lib/chart-workspace/paneOrder';

/** Sichtbarer Zeitbereich als Kerzenzeit in Sekunden; fehlt er, zeigt der Chart alle Kerzen */
export interface VisibleTime { from: number; to: number }
export interface ChartAlarm { id: string; indicatorId: string; direction: 'above' | 'below'; value: number; armed: boolean }
export interface ChartDocument { drawings: string; indicators: Indicator[]; images: Record<string, string>; overlays: Record<string, boolean>; alarms: ChartAlarm[]; appearance?: Appearance; visibleTime?: VisibleTime;
  /** Bereiche von oben nach unten (System-Bereiche `rsi` und `wave` und die `paneId` der Nutzer-Oszillatoren); fehlt er, gilt die Standardreihenfolge (UI-11) */
  paneOrder?: string[];
  /** Ausgeblendet (Auge) und eingeklappt je System-Bereich */
  systemPanes?: SystemPaneStates }
const EMPTY: ChartDocument = { drawings: '[]', indicators: [], images: {}, overlays: {}, alarms: [] };
export const WORKSPACE_STORAGE_KEY = 'grid-robot-chart-workspaces-v1';
export const emptyChartDocument = (): ChartDocument => ({ ...EMPTY, indicators: [], images: {}, overlays: {}, alarms: [] });
interface State {
  links: Record<string, string>;
  toolbar: Record<string, ToolbarPreferences>;
  setToolbar: (key: string, patch: Partial<ToolbarPreferences>) => void;
  /** Araç gruplarının yeri (UI-16): tarayıcı başına, her grafikte aynı; boş nesne = oto yerleşim. */
  toolbarLayout: ToolbarLayout;
  setToolbarLayout: (layout: ToolbarLayout) => void;
  /** Serbest paket yerleşimi (UI-17, 1106-A1): tarayıcı başına, her grafikte aynı. UI yalnız bunu okur; `toolbarLayout` yalnız eski kayıttan geçiş için kalır. */
  dockLayout: DockLayout;
  setDockLayout: (layout: DockLayout) => void;
  /** Yerleşimi sıfırla: `dockLayout` varsayılana döner, eski `toolbarLayout` da temizlenir. */
  resetDockLayout: () => void;
  setLinked: (key: string, sharedKey: string | null) => void;
  receiveStorage: () => void;
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
    const out = { ...defaults, id: v.id, paneId: v.id };
    for (const k of Object.keys(defaults) as (keyof Indicator)[]) {
      const value = v[k];
      if (typeof defaults[k] === 'boolean' && typeof value === 'boolean') Object.assign(out, { [k]: value });
      if (k === 'paneId' && typeof value === 'string' && value && value.length <= 80) Object.assign(out, { paneId: value });
      if (k === 'scaleSide' && (value === 'auto' || value === 'left' || value === 'right')) Object.assign(out, { scaleSide: value });
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
  let lastDocuments: Record<string, ChartDocument> = {};
  let lastToolbar: Record<string, ToolbarPreferences> = {};
  let lastLinks: Record<string, string> = {};
  let lastLayout: ToolbarLayout = {};
  let lastDock: DockLayout = defaultDockLayout();
  let pendingWrites = 0, receivePending = false;
  const readDocument = (d: ChartDocument): ChartDocument => ({ ...d, images: Object.fromEntries(Object.entries(d.images ?? {}).flatMap(([name, ref]) => {
    const bytes = typeof ref === 'string' ? ref : localStorage.getItem(`${WORKSPACE_STORAGE_KEY}-image-${name}`);
    return typeof bytes === 'string' ? [[name, bytes]] : [];
  })) });
  const write = () => {
    const s = get();
    if (!s.hydrated) return;
    try {
      const remote = JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY) || '{}');
      const combined: Record<string, ChartDocument> = Object.fromEntries(Object.entries(remote.documents ?? {}).map(([key, value]) => [key, readDocument(value as ChartDocument)]));
      for (const [key, doc] of Object.entries(s.documents)) {
        if (doc === lastDocuments[key] && combined[key]) continue;
        const latest = combined[key];
        combined[key] = key.startsWith('@linked:') && latest ? { ...doc, drawings: rebaseDrawings(lastDocuments[key]?.drawings ?? '[]', doc.drawings, latest.drawings), images: { ...latest.images, ...doc.images } } : doc;
      }
      const toolbar = { ...remote.toolbar }, links = { ...remote.links };
      const remoteLayout = parseToolbarLayout(remote.toolbarLayout);
      // Bu sekme yerleşimi değiştirmediyse diskteki geçerlidir; içerik aynıysa nesne kimliği korunur (gereksiz çizim yok)
      const toolbarLayout = s.toolbarLayout !== lastLayout || JSON.stringify(remoteLayout) === JSON.stringify(s.toolbarLayout) ? s.toolbarLayout : remoteLayout;
      const remoteDock = remote.dockLayout ? parseDockLayout(remote.dockLayout) : null;
      const dockLayout = s.dockLayout !== lastDock || !remoteDock || JSON.stringify(remoteDock) === JSON.stringify(s.dockLayout) ? s.dockLayout : remoteDock;
      for (const [key, value] of Object.entries(s.toolbar)) if (value !== lastToolbar[key]) toolbar[key] = value;
      for (const key of new Set([...Object.keys(lastLinks), ...Object.keys(s.links)])) {
        if (s.links[key] === lastLinks[key]) continue;
        if (s.links[key]) links[key] = s.links[key]; else delete links[key];
      }
      const documents = Object.fromEntries(Object.entries(combined).map(([key, d]) => {
        for (const [id, data] of Object.entries(d.images)) if (localStorage.getItem(`${WORKSPACE_STORAGE_KEY}-image-${id}`) !== data) localStorage.setItem(`${WORKSPACE_STORAGE_KEY}-image-${id}`, data);
        return [key, { ...d, overlays: s.overlayPreview?.key === key ? s.overlayPreview.original : d.overlays, images: Object.fromEntries(Object.keys(d.images).map(id => [id, true])) }];
      }));
      localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ version: 1, appearance: s.appearance, documents, templates: s.templates, favorites: s.favorites, links, toolbar, toolbarLayout, dockLayout }));
      // Delete orphan image bytes only after the replacement metadata is safely written.
      const prefix = `${WORKSPACE_STORAGE_KEY}-image-`, usedImages = new Set(Object.values(combined).flatMap(d => Object.keys(d.images)));
      for (let i = localStorage.length - 1; i >= 0; i--) { const key = localStorage.key(i); if (key?.startsWith(prefix) && !usedImages.has(key.slice(prefix.length))) localStorage.removeItem(key); }
      lastDocuments = combined; lastToolbar = s.toolbar; lastLinks = s.links; lastLayout = toolbarLayout; lastDock = dockLayout;
      set({ documents: combined, toolbarLayout, dockLayout, storageError: false });
    }
    catch { set({ storageError: true }); } // Quota/private mode: keep the current session and show a visible warning.
  };
  const persist = () => {
    // The browser lock serializes read/merge/write across tabs; no remote service is involved.
    if (typeof navigator !== 'undefined' && navigator.locks) {
      pendingWrites++;
      void navigator.locks.request('chart-workspace-storage', write).catch(() => set({ storageError: true })).finally(() => {
        pendingWrites--;
        if (!pendingWrites && receivePending) { receivePending = false; get().receiveStorage(); }
      });
    } else write();
  };
  return {
    links: {}, toolbar: {}, toolbarLayout: {}, dockLayout: defaultDockLayout(), appearance: { ...DEFAULT_APPEARANCE }, preview: null, overlayPreview: null, documents: {}, templates: {}, favorites: ['trend-line', 'horizontal-line', 'fib-retracement'], hydrated: false, storageError: false,
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
            // Alte Dokumente speichern `viewport` als Indexbereich; er passt zu keiner Zeit und wird nicht übernommen
            const saved = d.visibleTime && typeof d.visibleTime === 'object' ? d.visibleTime as Partial<VisibleTime> : null;
            const visibleTime = saved && typeof saved.from === 'number' && Number.isFinite(saved.from) && typeof saved.to === 'number' && Number.isFinite(saved.to) && saved.from < saved.to ? { from: saved.from, to: saved.to } : undefined;
            const alarms = Array.isArray(d.alarms) ? d.alarms.flatMap(item => item && typeof item === 'object' && typeof item.id === 'string' && typeof item.indicatorId === 'string' && (item.direction === 'above' || item.direction === 'below') && typeof item.value === 'number' && Number.isFinite(item.value) ? [{ id: item.id, indicatorId: item.indicatorId, direction: item.direction, value: item.value, armed: item.armed !== false }] : []).slice(0, 50) : [];
            const paneOrder = parsePaneOrder(d.paneOrder), systemPanes = parseSystemPanes(d.systemPanes);
            documents[key] = { drawings: typeof d.drawings === 'string' ? d.drawings : '[]', indicators: parseIndicators(d.indicators), images, overlays, alarms, ...(d.appearance === undefined ? {} : { appearance: parseAppearance(d.appearance) }), ...(visibleTime ? { visibleTime } : {}), ...(paneOrder ? { paneOrder } : {}), ...(systemPanes ? { systemPanes } : {}) };
          }
          for (const [key, value] of Object.entries(raw.templates ?? {})) templates[key] = parseAppearance(value);
        }
        lastDocuments = documents;
        set({ links: Object.fromEntries(Object.entries(raw?.links ?? {}).flatMap(([k, v]) => typeof v === 'string' && v.startsWith('@linked:') ? [[k, v]] : [])), toolbar: Object.fromEntries(Object.entries(raw?.toolbar ?? {}).map(([k, v]) => [k, parseToolbar(v)])), toolbarLayout: parseToolbarLayout(raw?.toolbarLayout), dockLayout: raw?.dockLayout ? parseDockLayout(raw.dockLayout) : migrateToolbarLayout(parseToolbarLayout(raw?.toolbarLayout)), hydrated: true, appearance: parseAppearance(raw?.appearance), documents, templates, favorites: Array.isArray(raw?.favorites) ? raw.favorites.filter((x: unknown) => typeof x === 'string') : get().favorites });
        lastToolbar = get().toolbar; lastLinks = get().links; lastLayout = get().toolbarLayout; lastDock = get().dockLayout;
      } catch { set({ hydrated: true, storageError: true }); }
    },
    receiveStorage: () => { if (pendingWrites) { receivePending = true; return; } set({ hydrated: false }); get().hydrate(); },
    setToolbarLayout: toolbarLayout => { set({ toolbarLayout }); persist(); },
    setDockLayout: dockLayout => { set({ dockLayout }); persist(); },
    resetDockLayout: () => { set({ dockLayout: defaultDockLayout(), toolbarLayout: {} }); persist(); },
    setToolbar: (key, patch) => { set(s => ({ toolbar: { ...s.toolbar, [key]: { ...(s.toolbar[key] ?? defaultToolbar()), ...patch } } })); persist(); },
    setLinked: (key, sharedKey) => {
      if (!sharedKey) { set(s => { const links = { ...s.links }; delete links[key]; return { links }; }); persist(); return; }
      const own = get().documents[key] ?? emptyChartDocument();
      const shared = get().documents[sharedKey] ?? emptyChartDocument();
      const images = { ...own.images }, ownDrawings = parseDrawings(own.drawings);
      for (const [name, bytes] of Object.entries(own.images)) {
        if (!shared.images[name] || shared.images[name] === bytes) continue;
        const alias = crypto.randomUUID(); images[alias] = bytes; delete images[name];
        for (const drawing of ownDrawings) if (drawing.image?.name === name) drawing.image = { ...drawing.image, name: alias };
      }
      const drawings = mergeDrawings(shared.drawings, JSON.stringify(ownDrawings));
      set(s => ({ links: { ...s.links, [key]: sharedKey }, documents: { ...s.documents, [sharedKey]: { ...shared, drawings, images: { ...shared.images, ...images } } } })); persist();
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
    setDocument: (key, document) => {
      set(s => ({ documents: { ...s.documents, [key]: document } })); persist();
    },
    saveTemplate: (name, appearance) => { if (!name.trim()) return; set(s => ({ templates: { ...s.templates, [name.trim()]: parseAppearance(appearance) } })); persist(); },
    setFavorites: favorites => { set({ favorites }); persist(); },
  };
});
