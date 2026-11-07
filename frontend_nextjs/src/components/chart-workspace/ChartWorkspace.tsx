'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cacheImage, decodeImage, DrawingManager, OVERLAY_SPECS, setImageReader, type Drawing, type DrawingKind, type MagnetMode, type TableCellRef } from 'lightweight-charts-drawing';
import { CrosshairMode, type UTCTimestamp } from 'lightweight-charts';
import { ChartSpline, Maximize2, Minimize2, Redo2, Scan, Settings2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { InputField } from '@/components/ui/InputField';
import { Modal } from '@/components/ui/modal';
import { toast } from '@/components/ui/animated-toast';
import { useFormat, useT, type MessageKey } from '@/i18n';
import { CHART_TIMEFRAME_SEC, type Bar, type MissingRange } from '@/lib/analysis/candles';
import { alarmsAfterRemove, INDICATOR_KINDS, indicatorFormula, isOscillator, isSystemRsi, newIndicator, SYSTEM_RSI_ID, systemRsiIndicator, type Indicator, type Value } from '@/lib/chart-workspace/indicators';
import { useChartWorkspaceStore, emptyChartDocument, type ChartDocument } from '@/store/useChartWorkspaceStore';
import { useThemeStore } from '@/store';
import { useAnalysisPrefsStore } from '@/store/useAnalysisPrefsStore';
import { ReplayDrawingVisibility } from '@/lib/chart-workspace/replayDrawings';
import { withAlpha } from '@/lib/chartTheme';
import type { Appearance, Section } from '@/lib/chart-workspace/settings';
import { OPEN_SETTINGS_EVENT } from '@/lib/chart-workspace/settingsRequest';
import { useShallow } from 'zustand/react/shallow';
import { applyAppearance, appearanceColors, IndicatorRenderer, type ChartBinding, type SystemPaneInput, type SystemPaneModel, type SystemSeriesRefs } from './runtime';
import { isSystemPane, orderPanes, presentPanes, SYSTEM_PANE_IDS, type SystemPaneId } from '@/lib/chart-workspace/paneOrder';
import { applySystemLayer } from './systemLayers';
import { Choice, ColorField, fieldClass, Numeric, SettingsDialog, Toggle } from './SettingsDialog';
import { IndicatorDialog } from './IndicatorDialog';
import { IndicatorLegend, indicatorNames, type OscillatorActions } from './IndicatorLegend';
import ConfirmModal from '@/components/ConfirmModal';
import { DrawingToolbar } from './DrawingToolbar';
import { ChartGestureLayer, type ZoomSnapshot } from './ChartGestureLayer';
import { DockSurface } from './dock/DockSurface';
import { DrawingPriorityContext } from './drawingPriority';
import { defaultToolbar, toolGroup, type ChartGesture } from '@/lib/chart-workspace/toolbar';
import { linkedDrawingKey, type DrawingIdentity } from '@/lib/chart-workspace/linkedDrawings';

const removalLabels = {
  selected: { title: 'cw.rail.removeSelected', message: 'cw.rail.confirmSelected', hint: 'cw.rail.removeSelected.hint' },
  drawings: { title: 'cw.rail.removeDrawings', message: 'cw.rail.confirmDrawings', hint: 'cw.rail.removeDrawings.hint' },
  indicators: { title: 'cw.rail.removeIndicators', message: 'cw.rail.confirmIndicators', hint: 'cw.rail.removeIndicators.hint' },
} as const;
const TIMEFRAME_LABEL = Object.fromEntries(Object.entries(CHART_TIMEFRAME_SEC).map(([name, seconds]) => [seconds, name]));
function zoomHint(n: number): MessageKey { if (!n) return 'cw.fit.hint'; return n > 0 ? 'cw.zoomIn.hint' : 'cw.zoomOut.hint'; }
function zoomLabel(n: number, fit: string) { if (!n) return fit; return n > 0 ? '+' : '−'; }
const toolKey = (kind: DrawingKind) => `cw.tool.${kind}` as MessageKey;
export interface WorkspaceContext { key: string; symbol: string; view: 'analysis' | 'backtest' | 'formation' | 'free'; systemRsi?: boolean; systemWave?: boolean; syncIdentity?: DrawingIdentity }
interface Props {
  context: WorkspaceContext;
  binding: ChartBinding | null;
  interactionReady?: boolean;
  bars: readonly Bar[];
  missing: readonly MissingRange[];
  timeframeSec: number;
  digits: number | null;
  until: number;
  countdownNow?: number | null;
  children: ReactNode;
  overlays?: ReactNode;
  /** Schalter, die rechts neben den Indikatoren in der Kopfleiste stehen (z. B. Trendzug) */
  toolbarActions?: ReactNode;
  viewActions?: ReactNode;
  /** System oscillators of the switched-on layers (RSI(7), Wave 5/35) with ready-made points. They live in the same pane model as the user oscillators. */
  systemPanes?: readonly SystemPaneInput[];
  /** Receives the series of the system panes while they are drawn (for the drawing layer above the chart) */
  systemSeries?: SystemSeriesRefs;
  /** Preserve the old RSI preference without modifying the formation detector. */
  showRsi?: boolean;
  className?: string;
  /**
   * Werkzeugleiste und Zeichenleiste schweben über dem Chart (Modus Formation von /chart). Die Leiste sitzt oben in der Kopfleiste der Seite,
   * sobald der Container `formation-main` breit genug ist (Schwelle in FormationToolbar.tsx), sonst schwebt sie unten.
   * Oben ist sie 1 px + 37 px hoch, in px wie die 38 px hohe Kopfleiste, damit sie bei größerer Browser-Schrift nicht in die Formationszeile ragt.
   * Rechts endet die schwebende Leiste 5rem vom Rand (die Seitenleiste vom Modus Formation von /chart schiebt den Chart, sie überdeckt ihn ab lg nicht).
   * Stapelung im Modus Formation von /chart: oben z-60 über der Kopfleiste (z-50), unten z-53 über den Chart-Overlays und der Infokarte (z-52, unter lg).
   */
  overlayLayout?: boolean;
  /** Vollbild zeigt die ganze Chartseite (`data-chart-page`, mit Kopfleiste) statt nur den Chart; nur mit overlayLayout sinnvoll */
  fullscreenOfPage?: boolean;
}

export function ChartWorkspace({ context, binding, interactionReady = true, bars, missing, timeframeSec, digits, until, countdownNow, children, overlays, toolbarActions, viewActions, systemPanes, systemSeries, showRsi = true, className = '', overlayLayout = false, fullscreenOfPage = false }: Props) {
  const t = useT(), fmt = useFormat();
  // Auf /chart (Formation) (overlayLayout) sind die Werkzeuge Pillen wie die Zeitrahmen-Knöpfe der Kopfleiste; „Ansicht zurücksetzen“ und „Indikatoren“ nur als Symbol
  const iconSize = overlayLayout ? 'icon-xs' : 'icon-sm';
  const root = useRef<HTMLDivElement>(null), manager = useRef<DrawingManager | null>(null), renderer = useRef<IndicatorRenderer | null>(null);
  // Für Teile im Inneren (Trendmenü): ein aktives Werkzeug und eine Zeichnung unter der Maus haben Vorrang vor Linienmenüs
  const drawingPriority = useCallback(() => ({ toolActive: manager.current?.tool() != null, drawingHovered: manager.current?.hoveredId() != null }), []);
  const drawingBars = useMemo(() => bars.map(b => ({ ...b, time: b.time as UTCTimestamp })), [bars]);
  const live = useRef({ drawingBars, until, timeframeSec });
  const replay = useRef(new ReplayDrawingVisibility());
  const documentRef = useRef<ChartDocument>(emptyChartDocument());
  const undo = useRef<string[]>([]), redo = useRef<string[]>([]), current = useRef('[]');
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Alt çubuk (DockSurface): yalnız grupları varken; yoksa grafik altta yer ayırmaz
  const [toolbarCard, setToolbarCard] = useState<HTMLDivElement | null>(null);
  const [gesture, setGesture] = useState<ChartGesture>(null);
  const zoomActive = useRef(false);
  const [zoomSnapshot, setZoomSnapshot] = useState<ZoomSnapshot | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{ target: 'selected' | 'drawings' | 'indicators'; ids: string[] } | null>(null);
  const originalLocks = useRef(new Map<string, boolean | undefined>());
  const [activeObject, setActiveObject] = useState<string | null>(null);
  const [drawingSnapshot, setDrawingSnapshot] = useState<Drawing[]>([]);
  const [historySize, setHistorySize] = useState({ undo: 0, redo: 0 });
  const [revision, setRevision] = useState(0), [selected, setSelected] = useState<string[]>([]), [tool, setTool] = useState<DrawingKind | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false), [settingsSection, setSettingsSection] = useState<Section>('symbol'), [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null), [editor, setEditor] = useState<{ drawing: Drawing; cell?: TableCellRef; text: string } | null>(null);
  const [sample, setSample] = useState<{ scope: string; values: { config: Indicator; value: Value }[] }>({ scope: '', values: [] });
  const lastValues = sample.values;
  const [elapsed, setElapsed] = useState(0);
  const [settingsFocus, setSettingsFocus] = useState<string | null>(null);
  const [indicatorInfo, setIndicatorInfo] = useState<{ indicator: Indicator; formula: boolean } | null>(null);
  const [alarmTarget, setAlarmTarget] = useState<Indicator | null>(null);
  const [alarmValue, setAlarmValue] = useState('');
  const [alarmDirection, setAlarmDirection] = useState<'above' | 'below'>('above');
  // Maximizing is temporary: it applies to one chart and timeframe and is never saved.
  const [maximized, setMaximized] = useState<{ scope: string; paneId: string } | null>(null);
  const previousSample = useRef<{ scope: string; values: Record<string, Value> }>({ scope: '', values: {} });
  const imageInput = useRef<HTMLInputElement>(null);
  const state = useChartWorkspaceStore(), theme = useThemeStore(s => s.resolvedTheme);
  const perProduct = context.view === 'analysis' || context.view === 'free';
  const toolbarDefaults = useMemo(() => defaultToolbar(), []);
  const preferences = state.toolbar[context.key] ?? toolbarDefaults;
  const drawingKey = state.links[context.key] ?? context.key;
  const locked = preferences.locked;
  const defaults = useMemo(() => {
    // Das System-Wave zeigt schon EWO: kein zweites Histogramm als Nutzer-Indikator
    const others = context.systemWave ? [] : [newIndicator('EWO')];
    others.forEach(v => { v.id = `initial-${v.kind}`; });
    // Charts with the system RSI own one RSI with a fixed id; other charts (backtest) keep the old RSI(14) default
    const rsi = context.systemRsi ? systemRsiIndicator() : newIndicator('RSI');
    if (!context.systemRsi) rsi.id = 'initial-RSI';
    return { ...emptyChartDocument(), indicators: context.systemRsi && context.systemWave ? [rsi] : [rsi, ...others] };
  }, [context.systemRsi, context.systemWave]);
  const stored = state.documents[context.key] ?? defaults;
  // A saved document without the system RSI (older version) gets it at the start; it cannot be deleted, only switched off as a layer
  const ownDocument = useMemo(() => context.systemRsi && !stored.indicators.some(isSystemRsi) ? { ...stored, indicators: [systemRsiIndicator(), ...stored.indicators] } : stored, [context.systemRsi, stored]);
  const appearance = useChartWorkspaceStore(useShallow(s => s.preview ?? (perProduct ? s.documents[context.key]?.appearance ?? s.appearance : s.appearance)));
  const magnet = appearance.magnet as MagnetMode, keepDrawing = appearance.keepDrawing;
  const sharedDocument = state.documents[drawingKey];
  const doc = useMemo(() => drawingKey === context.key || !sharedDocument ? ownDocument : { ...ownDocument, drawings: sharedDocument.drawings, images: sharedDocument.images }, [drawingKey, context.key, sharedDocument, ownDocument]);
  const effectiveIndicators = useMemo(() => preferences.indicatorsHidden ? [] : doc.indicators.filter(v => (v.id !== 'initial-RSI' || showRsi) && (!isSystemRsi(v) || (doc.overlays.rsi ?? true))), [doc.indicators, doc.overlays, showRsi, preferences.indicatorsHidden]);
  // Panes of the document: the system RSI counts only while its layer is on
  const paneIndicators = useMemo(() => doc.indicators.filter(v => !isSystemRsi(v) || (doc.overlays.rsi ?? true)), [doc.indicators, doc.overlays]);
  const systemModels = useMemo<SystemPaneModel[]>(() => (systemPanes ?? []).map(pane => ({ ...pane, hidden: !!doc.systemPanes?.[pane.id]?.hidden, collapsed: !!doc.systemPanes?.[pane.id]?.collapsed })), [systemPanes, doc.systemPanes]);
  const systemKey = systemModels.map(pane => pane.id).join('|');
  // Pane order from top to bottom (all panes, also hidden ones): the saved order, new panes at the end; the default is RSI(7), Wave, then the user panes
  const paneOrder = useMemo(() => orderPanes(doc.paneOrder, presentPanes(paneIndicators, systemKey ? systemKey.split('|') as SystemPaneId[] : [])), [doc.paneOrder, paneIndicators, systemKey]);
  const chartScope = `${context.key}|${timeframeSec}`;
  const maximizedPaneId = maximized?.scope === chartScope ? maximized.paneId : null;
  // Backtest and formation charts show history, so their values never cross a level live.
  const alarmsAvailable = context.view === 'analysis' || context.view === 'free';
  const names = useMemo(() => indicatorNames(paneIndicators), [paneIndicators]);

  useEffect(() => {
    // The library may paint before our preload finishes. Its default reader rejects
    // uncached images and deletes their drawings, so register the local asset source first.
    setImageReader(async name => {
      const data = Object.values(useChartWorkspaceStore.getState().documents).find(d => d.images[name])?.images[name];
      if (!data || !/^data:image\/(png|jpeg|webp);base64,/.test(data)) throw new Error('Local chart image missing');
      return (await fetch(data)).blob();
    });
    useChartWorkspaceStore.getState().hydrate();
    const receive = (event: StorageEvent) => { if (event.key === 'grid-robot-chart-workspaces-v1') useChartWorkspaceStore.getState().receiveStorage(); };
    window.addEventListener('storage', receive);
    return () => window.removeEventListener('storage', receive);
  }, []);
  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(root.current && document.fullscreenElement?.contains(root.current)));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  useEffect(() => {
    zoomActive.current = false;
    const frame = requestAnimationFrame(() => { setZoomSnapshot(null); setGesture(null); });
    return () => cancelAnimationFrame(frame);
  }, [binding, context.key]);
  // Unter 71 rem Containerbreite liegt die Werkzeugleiste als Karte unten auf dem Chart. Die Fläche des Chart endet dann
  // darüber (--workspace-card, siehe ChartCore): Höhe, Randabstand und eine Lücke, gemessen, damit es bei jeder Schriftgröße passt.
  // Ab 71 rem sitzt die Karte oben in der Kopfleiste: keine Reserve.
  useLayoutEffect(() => {
    const card = toolbarCard, host = root.current;
    if (!overlayLayout || !host) return;
    // Auch auf der Seite (`formation-main`): die schwebende Karte der Chartseite sitzt darüber (FloatingCard)
    const page = host.closest<HTMLElement>('[data-testid="formation-main"]');
    const measure = () => {
      // Ohne untere Leiste (alle Gruppen oben oder frei, UI-16) keine Reserve
      const atBottom = card ? card.offsetTop > host.clientHeight / 2 : false;
      const reserve = card && atBottom ? `${card.offsetHeight + parseFloat(getComputedStyle(card).bottom) + 8}px` : '0px';
      host.style.setProperty('--workspace-card', reserve);
      page?.style.setProperty('--workspace-card', reserve);
    };
    measure();
    // Die Karte ändert ihre Größe beim Umbruch, der Container beim Wechsel der Breite (Seitenleiste auf oder zu)
    const observer = new ResizeObserver(measure);
    if (card) observer.observe(card);
    observer.observe(host);
    return () => { observer.disconnect(); host.style.removeProperty('--workspace-card'); page?.style.removeProperty('--workspace-card'); };
  }, [overlayLayout, toolbarCard]);
  useEffect(() => { live.current = { drawingBars, until, timeframeSec }; documentRef.current = doc; });
  const saveDocument = useCallback((next: ChartDocument) => {
    documentRef.current = next;
    const store = useChartWorkspaceStore.getState();
    if (drawingKey === context.key) store.setDocument(context.key, next);
    else {
      const own = store.documents[context.key] ?? defaults;
      if (own.indicators !== next.indicators || own.overlays !== next.overlays || own.paneOrder !== next.paneOrder || own.systemPanes !== next.systemPanes) store.setDocument(context.key, { ...own, indicators: next.indicators, overlays: next.overlays, paneOrder: next.paneOrder, systemPanes: next.systemPanes });
      store.setDocument(drawingKey, { ...emptyChartDocument(), drawings: next.drawings, images: next.images });
    }
  }, [context.key, drawingKey, defaults]);
  const saveAppearance = useCallback((next: Appearance) => {
    const store = useChartWorkspaceStore.getState();
    if (perProduct) {
      const own = store.documents[context.key] ?? defaults;
      documentRef.current = { ...documentRef.current, appearance: next };
      store.setDocument(context.key, { ...own, appearance: next });
    } else store.setAppearance(next);
  }, [context.key, perProduct, defaults]);
  const rollbackOverlays = useCallback(() => {
    useChartWorkspaceStore.getState().finishOverlayPreview(false);
    useAnalysisPrefsStore.getState().finishPreview(false);
  }, []);
  const openSettings = useCallback((section: Section = 'symbol') => {
    const workspace = useChartWorkspaceStore.getState();
    useAnalysisPrefsStore.getState().beginPreview();
    workspace.beginOverlayPreview(context.key);
    workspace.setPreview({ ...appearance });
    setSettingsSection(section);
    setSettingsOpen(true);
  }, [context.key, appearance]);
  // Andere Teile der Seite (Linienmenü der Formation) öffnen die Einstellungen in einem Abschnitt
  useEffect(() => {
    const onRequest = (e: Event) => { if (!settingsOpen) openSettings((e as CustomEvent<Section>).detail); };
    window.addEventListener(OPEN_SETTINGS_EVENT, onRequest);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, onRequest);
  }, [openSettings, settingsOpen]);
  useEffect(() => {
    if (!settingsOpen) return;
    return () => {
      // Browser navigation also cancels a live preview. Apply/cancel clear it before closing.
      const workspace = useChartWorkspaceStore.getState();
      if (workspace.preview) { workspace.setPreview(null); rollbackOverlays(); }
    };
  }, [settingsOpen, rollbackOverlays]);
  const checkpoint = useCallback(() => {
    const m = manager.current; if (!m) return;
    const snapshot = replay.current.snapshot(m).map(d => originalLocks.current.has(d.id) ? { ...d, locked: originalLocks.current.get(d.id) } : d);
    const json = JSON.stringify(snapshot);
    replay.current.sync(m, live.current.until);
    if (json !== current.current) { undo.current = [...undo.current.slice(-99), current.current]; redo.current = []; current.current = json; const used = new Set(snapshot.flatMap(d => d.image ? [d.image.name] : []));
      for (const name of Object.keys(documentRef.current.images)) if ([...undo.current, ...redo.current].some(entry => entry.includes(name))) used.add(name);
      saveDocument({ ...documentRef.current, drawings: json, images: Object.fromEntries(Object.entries(documentRef.current.images).filter(([name]) => used.has(name))) }); }
    setDrawingSnapshot(snapshot);
    setHistorySize({ undo: undo.current.length, redo: redo.current.length });
    setRevision(n => n + 1);
  }, [saveDocument]);
  const history = (back: boolean) => {
    if (useChartWorkspaceStore.getState().toolbar[context.key]?.locked) return;
    const from = back ? undo.current : redo.current, to = back ? redo.current : undo.current, json = from.pop();
    if (json === undefined || !manager.current) return;
    to.push(current.current); current.current = json; replay.current.clear(); originalLocks.current.clear(); manager.current.importJSON(json);
    saveDocument({ ...documentRef.current, drawings: json }); checkpoint();
  };

  useEffect(() => {
    if (!binding || binding.isDisposed() || !state.hydrated) return;
    const m = new DrawingManager(binding.chart, binding.candles, { bars: () => live.current.drawingBars, magnet: 'weak', timeInfo: () => ({ timeZone: 'UTC', intraday: live.current.timeframeSec < 86400 }) });
    manager.current = m;
    const storeState = useChartWorkspaceStore.getState();
    const existing = storeState.documents[context.key] ?? defaults;
    const privateDoc = perProduct && existing.appearance === undefined ? { ...existing, appearance: storeState.appearance } : existing;
    const shared = storeState.documents[drawingKey];
    const stored = shared && drawingKey !== context.key ? { ...privateDoc, drawings: shared.drawings, images: shared.images } : privateDoc;
    documentRef.current = stored;
    if (!storeState.documents[context.key] || privateDoc !== existing) storeState.setDocument(context.key, privateDoc);
    replay.current.clear(); originalLocks.current.clear();
    try { m.importJSON(stored.drawings); }
    catch { queueMicrotask(() => setError('cw.drawingError')); }
    // Restore image bytes before drawing; no remote image URLs are accepted.
    for (const [name, url] of Object.entries(stored.images)) void decodeImage(url).then(img => { if (!disposed) { cacheImage(name, img); m.redraw(); } }).catch(() => { if (!disposed) setError('cw.imageError'); });
    current.current = m.exportJSON(); replay.current.sync(m, live.current.until); undo.current = []; redo.current = [];
    const off = [m.on('selection', ids => { setSelected([...ids]); if (ids[0]) setActiveObject(ids[0]); }), m.on('tool', setTool), m.on('visibility', visible => { const store = useChartWorkspaceStore.getState(); const a = perProduct ? store.documents[context.key]?.appearance ?? store.appearance : store.appearance; if (a.hideDrawings !== visible) saveAppearance({ ...a, hideDrawings: visible }); }), m.on('gestureEnd', checkpoint), m.on('remove', () => queueMicrotask(() => { if (manager.current === m) checkpoint(); })), m.on('textEdit', drawing => { if (!useChartWorkspaceStore.getState().toolbar[context.key]?.locked) setEditor({ drawing, text: drawing.text ?? '' }); }), m.on('tableEdit', (drawing, cell) => { if (!useChartWorkspaceStore.getState().toolbar[context.key]?.locked) setEditor({ drawing, cell, text: drawing.style.tableCells?.[cell[0]]?.[cell[1]] ?? '' }); })];
    const deactivate = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) { m.setTool(null); m.select([]); } };
    const focusOut = (e: FocusEvent) => { if (e.relatedTarget && !root.current?.contains(e.relatedTarget as Node)) { m.setTool(null); m.select([]); } };
    const inputFocus = (e: FocusEvent) => { if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) { m.setTool(null); m.select([]); } };
    document.addEventListener('pointerdown', deactivate, true);
    const el = root.current; el?.addEventListener('focusout', focusOut); el?.addEventListener('focusin', inputFocus);
    const r = new IndicatorRenderer(binding, systemSeries); renderer.current = r;
    const frame = requestAnimationFrame(() => { setTool(m.tool()); setSelected([...m.selection()]); checkpoint(); });
    let disposed = false;
    const dispose = () => { if (disposed) return; disposed = true; cancelAnimationFrame(frame); off.forEach(f => f()); document.removeEventListener('pointerdown', deactivate, true); el?.removeEventListener('focusout', focusOut); el?.removeEventListener('focusin', inputFocus); r.destroy(); renderer.current = null; m.destroy(); manager.current = null; };
    const unregister = binding.onDispose(dispose);
    return () => { unregister(); dispose(); };
  }, [binding, context.key, drawingKey, state.hydrated, defaults, checkpoint, perProduct, saveAppearance, systemSeries]);

  useEffect(() => {
    const m = manager.current;
    if (!m || doc.drawings === current.current) return;
    replay.current.clear(); originalLocks.current.clear();
    try { m.importJSON(doc.drawings); current.current = doc.drawings; undo.current = []; redo.current = []; checkpoint(); }
    catch { queueMicrotask(() => setError('cw.drawingError')); }
  }, [doc.drawings, checkpoint]);
  useEffect(() => {
    const m = manager.current; if (!m) return;
    if (locked) {
      for (const d of m.drawings()) {
        if (!originalLocks.current.has(d.id)) originalLocks.current.set(d.id, d.locked);
        if (!d.locked) m.update({ ...d, locked: true });
      }
    } else {
      for (const d of m.drawings()) if (originalLocks.current.has(d.id)) m.update({ ...d, locked: originalLocks.current.get(d.id) });
      originalLocks.current.clear();
    }
  }, [locked, revision, binding, drawingKey, state.hydrated]);
  useEffect(() => { manager.current?.setMagnet(magnet); manager.current?.setStayInDrawingMode(keepDrawing); }, [magnet, keepDrawing, binding, drawingKey, state.hydrated]);
  useEffect(() => {
    if (!binding || binding.isDisposed()) return;
    applyAppearance(binding, zoomActive.current ? { ...appearance, autoScale: false } : appearance, digits);
    binding.chart.applyOptions({ crosshair: { mode: preferences.cursor === 'crosshair' && appearance.crosshair ? CrosshairMode.Normal : CrosshairMode.Hidden } });
    let cursor = 'crosshair';
    if (preferences.cursor === 'arrow') cursor = 'default';
    if (preferences.cursor === 'dot') {
      const color = appearanceColors(appearance).text;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="2" fill="${color}"/></svg>`;
      cursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 8 8, crosshair`;
    }
    binding.host.style.setProperty('cursor', cursor);
    const values = renderer.current?.update(effectiveIndicators, bars, missing, timeframeSec, appearance, context.symbol, until, maximizedPaneId, systemModels, paneOrder) ?? [];
    const frame = requestAnimationFrame(() => setSample({ scope: chartScope, values }));
    manager.current?.setDrawingsVisible(appearance.hideDrawings);
    manager.current?.setInterval(timeframeSec >= 86400 ? '1D' : String(timeframeSec / 60));
    if (manager.current) replay.current.sync(manager.current, until);
    manager.current?.redraw();
    return () => cancelAnimationFrame(frame);
  }, [binding, appearance, digits, effectiveIndicators, bars, missing, timeframeSec, context.symbol, until, theme, revision, preferences.cursor, maximizedPaneId, chartScope, systemModels, paneOrder]);

  useEffect(() => {
    if (!alarmsAvailable || sample.scope !== chartScope) return;
    const previous = previousSample.current.scope === sample.scope ? previousSample.current.values : {};
    const current = Object.fromEntries(sample.values.map(item => [item.config.id, item.value]));
    previousSample.current = { scope: sample.scope, values: current };
    const crossed = documentRef.current.alarms.filter(alarm => {
      const before = previous[alarm.indicatorId], now = current[alarm.indicatorId];
      if (!alarm.armed || before == null || now == null) return false;
      return alarm.direction === 'above' ? before < alarm.value && now >= alarm.value : before > alarm.value && now <= alarm.value;
    });
    if (!crossed.length) return;
    for (const alarm of crossed) toast.info(t('cw.alarmTriggered', { indicator: names.get(alarm.indicatorId) ?? '', value: fmt.number(alarm.value) }));
    saveDocument({ ...documentRef.current, alarms: documentRef.current.alarms.map(alarm => crossed.includes(alarm) ? { ...alarm, armed: false } : alarm) });
  }, [sample, chartScope, alarmsAvailable, names, fmt, t, saveDocument]);
  useEffect(() => {
    if (!appearance.countdown || countdownNow == null) return;
    const started = Date.now();
    const frame = requestAnimationFrame(() => setElapsed(0));
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => { clearInterval(timer); cancelAnimationFrame(frame); };
  }, [appearance.countdown, countdownNow]);

  const arm = (kind: DrawingKind | null, glyph = '★') => {
    if (kind) {
      const store = useChartWorkspaceStore.getState();
      store.setToolbar(context.key, { lastTools: { ...store.toolbar[context.key]?.lastTools, [toolGroup(kind)]: kind } });
    }
    if (kind === 'image') { imageInput.current?.click(); return; }
    manager.current?.setTool(kind, kind === 'font-icon' ? { glyph } : undefined);
    binding?.host.focus({ preventScroll: true });
  };
  const active = drawingSnapshot.find(d => d.id === activeObject && d.points.every(p => typeof p.time !== 'number' || p.time <= until));
  const updateDrawing = (next: Drawing) => { if (locked) return; manager.current?.update(next); checkpoint(); };
  const drawings = drawingSnapshot.filter(d => d.points.every(p => typeof p.time !== 'number' || p.time <= until));
  const remaining = countdownNow == null ? null : Math.max(0, timeframeSec - ((countdownNow + elapsed) % timeframeSec));
  const patchIndicators = (change: (indicators: Indicator[]) => Indicator[]) => saveDocument({ ...documentRef.current, indicators: change(documentRef.current.indicators) });
  /** The system RSI is never deleted: removing it switches its layer off (same state as the switch in the layers menu). */
  const removeIndicators = (ids: Set<string>) => saveDocument({ ...(ids.has(SYSTEM_RSI_ID) ? applySystemLayer(documentRef.current, 'rsi', false) : documentRef.current), indicators: documentRef.current.indicators.filter(item => !ids.has(item.id) || isSystemRsi(item)), alarms: alarmsAfterRemove(documentRef.current.alarms, ids) });
  const changeIndicator = (id: string, change: Partial<Indicator>) => patchIndicators(indicators => indicators.map(item => item.id === id ? { ...item, ...change } : item));
  const sideOf = (indicator: Indicator) => indicator.scaleSide === 'auto' ? appearance.side as 'left' | 'right' : indicator.scaleSide;
  const patchSystemPane = (id: SystemPaneId, change: (state: { hidden?: boolean; collapsed?: boolean }) => { hidden?: boolean; collapsed?: boolean }) => {
    const current = documentRef.current;
    saveDocument({ ...current, systemPanes: { ...current.systemPanes, [id]: change(current.systemPanes?.[id] ?? {}) } });
  };
  const oscillatorActions: OscillatorActions = {
    movePane: (paneId, offset) => {
      const current = documentRef.current, systemIds = SYSTEM_PANE_IDS.filter(id => systemModels.some(pane => pane.id === id));
      const panes = orderPanes(current.paneOrder, presentPanes(current.indicators.filter(v => !isSystemRsi(v) || (current.overlays.rsi ?? true)), systemIds)), index = panes.indexOf(paneId), target = index + offset;
      if (index < 0 || target < 0 || target >= panes.length) return;
      [panes[index], panes[target]] = [panes[target], panes[index]];
      // The user panes keep the same order in the indicator list, so older readers of the document see the same order
      const oscillators = current.indicators.filter(isOscillator), userPanes = panes.filter(id => !isSystemPane(id));
      saveDocument({ ...current, paneOrder: panes, indicators: [...current.indicators.filter(item => !isOscillator(item)), ...userPanes.flatMap(id => oscillators.filter(item => item.paneId === id))] });
    },
    toggleCollapsed: paneId => {
      if (isSystemPane(paneId)) { patchSystemPane(paneId, pane => ({ ...pane, collapsed: !pane.collapsed })); return; }
      patchIndicators(indicators => {
        const collapsed = !indicators.find(item => item.paneId === paneId)?.paneCollapsed;
        return indicators.map(item => item.paneId === paneId ? { ...item, paneCollapsed: collapsed } : item);
      });
    },
    toggleMaximized: paneId => setMaximized(maximizedPaneId === paneId ? null : { scope: chartScope, paneId }),
    removePane: paneId => {
      if (isSystemPane(paneId)) { saveDocument(applySystemLayer(documentRef.current, paneId, false)); return; }
      removeIndicators(new Set(documentRef.current.indicators.filter(item => item.paneId === paneId).map(item => item.id)));
    },
    toggleSystemVisible: id => patchSystemPane(id, pane => ({ ...pane, hidden: !pane.hidden })),
    toggleVisible: indicator => changeIndicator(indicator.id, { visible: !indicator.visible }),
    update: (indicator, change) => changeIndicator(indicator.id, change),
    openSettings: indicator => { setSettingsFocus(indicator.id); setIndicatorsOpen(true); },
    switchScale: indicator => changeIndicator(indicator.id, { scaleSide: sideOf(indicator) === 'left' ? 'right' : 'left' }),
    moveToPane: (indicator, paneId) => changeIndicator(indicator.id, { paneId: paneId ?? crypto.randomUUID(), paneCollapsed: paneId ? doc.indicators.some(item => item.paneId === paneId && item.paneCollapsed) : false }),
    openAlarm: indicator => { setAlarmTarget(indicator); setAlarmValue(''); },
    toggleFavorite: indicator => state.setFavorites(state.favorites.includes(indicator.kind) ? state.favorites.filter(kind => kind !== indicator.kind) : [...state.favorites, indicator.kind]),
    copy: indicator => { const id = crypto.randomUUID(); patchIndicators(indicators => [...indicators, { ...indicator, id, paneId: id, paneCollapsed: false }]); },
    openInfo: (indicator, formula) => setIndicatorInfo({ indicator, formula }),
    remove: indicator => removeIndicators(new Set([indicator.id])),
  };
  const addAlarm = () => { if (!alarmTarget || !Number.isFinite(Number(alarmValue))) return; saveDocument({ ...documentRef.current, alarms: [...documentRef.current.alarms, { id: crypto.randomUUID(), indicatorId: alarmTarget.id, direction: alarmDirection, value: Number(alarmValue), armed: true }].slice(-50) }); setAlarmTarget(null); };
  const changeImage = async (file: File | undefined) => {
    const targetManager = manager.current;
    if (!file || !targetManager) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2_000_000) { setError('cw.imageError'); return; }
    try {
      const url = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file); });
      const img = await decodeImage(url);
      if (manager.current !== targetManager) return;
      if (img.width > 2000 || img.height > 2000) { setError('cw.imageError'); return; }
      const name = crypto.randomUUID(); cacheImage(name, img); saveDocument({ ...documentRef.current, images: { ...documentRef.current.images, [name]: url } }); manager.current?.addImage({ name, width: img.width, height: img.height }); checkpoint();
    } catch { setError('cw.imageError'); }
  };
  const removeDrawings = (all: boolean, ids = selected) => {
    const m = manager.current; if (!m || locked) return;
    for (const d of replay.current.snapshot(m)) if (!d.locked && (all || ids.includes(d.id))) m.remove(d.id);
    checkpoint();
  };
  const setPreferences = (patch: Partial<typeof preferences>) => state.setToolbar(context.key, patch);
  const setVisibility = (target: 'drawings' | 'indicators' | 'all') => {
    if (target === 'all') {
      const visible = !appearance.hideDrawings || preferences.indicatorsHidden;
      saveAppearance({ ...appearance, hideDrawings: visible }); setPreferences({ indicatorsHidden: !visible });
    } else if (target === 'drawings') saveAppearance({ ...appearance, hideDrawings: !appearance.hideDrawings });
    else setPreferences({ indicatorsHidden: !preferences.indicatorsHidden });
  };
  // Çizimler sekmesi (1106-A3): eski „Çizim nesneleri“ penceresinin içeriği artık Göstergeler penceresinde; yalnız pencere açıkken kurulur
  const drawingsPanel = indicatorsOpen && <div data-testid="drawing-objects">
    {drawings.length === 0 && <p className="text-sm text-muted-foreground">{t('cw.drawingsEmpty')}</p>}
    <div className="flex flex-wrap gap-2">{drawings.map(d => <Button key={d.id} size="sm" aria-pressed={selected.includes(d.id)} hint={t('cw.selection.hint')} onClick={() => { manager.current?.select([d.id]); }}>{d.name || t(toolKey(d.kind))}</Button>)}</div>
    {active && <fieldset disabled={locked} className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
      <InputField label={t('cw.objectName')} hint={t('cw.objectName.hint')}><input className={fieldClass} value={active.name ?? ''} onChange={e => updateDrawing({ ...active, name: e.target.value })} /></InputField>
      <ColorField name="cw.color" value={active.style.color} onChange={color => updateDrawing({ ...active, style: { ...active.style, color } })} />
      <Numeric name="cw.width" min={1} max={8} value={active.style.width} onChange={width => updateDrawing({ ...active, style: { ...active.style, width } })} />
      <Choice name="cw.priceStyle" options={['solid', 'dashed', 'dotted']} value={active.style.lineStyle} onChange={v => updateDrawing({ ...active, style: { ...active.style, lineStyle: v as Drawing['style']['lineStyle'] } })} />
      <Toggle name="cw.lock" checked={active.locked ?? false} onChange={locked => updateDrawing({ ...active, locked })} />
      <Toggle name="cw.visible" checked={!active.hidden} onChange={v => { manager.current?.setHidden(active.id, !v); checkpoint(); }} />
      {OVERLAY_SPECS[active.kind].textEditable && <InputField label={t('cw.text')} hint={t('cw.text.hint')}><input className={fieldClass} value={active.text ?? ''} onChange={e => updateDrawing({ ...active, text: e.target.value })} /></InputField>}
      {typeof active.style.fillBackground === 'boolean' && <><Toggle name="cw.fill" checked={active.style.fillBackground} onChange={fillBackground => updateDrawing({ ...active, style: { ...active.style, fillBackground } })} /><ColorField name="cw.fillColor" value={active.style.backgroundColor || active.style.color} onChange={backgroundColor => updateDrawing({ ...active, style: { ...active.style, backgroundColor } })} /><Numeric name="cw.opacity" min={0} max={100} value={100 - (active.style.transparency ?? 92)} onChange={v => updateDrawing({ ...active, style: { ...active.style, transparency: 100 - v } })} /></>}
      {OVERLAY_SPECS[active.kind].textEditable && <><Numeric name="cw.objectTextSize" value={active.style.fontSize ?? 14} min={8} max={72} onChange={fontSize => updateDrawing({ ...active, style: { ...active.style, fontSize } })} /><Toggle name="cw.bold" checked={active.style.bold ?? false} onChange={bold => updateDrawing({ ...active, style: { ...active.style, bold } })} /><Toggle name="cw.italic" checked={active.style.italic ?? false} onChange={italic => updateDrawing({ ...active, style: { ...active.style, italic } })} /></>}
      {active.style.levels && <InputField label={t('cw.levels')} hint={t('cw.levels.hint')}><input key={active.id} className={fieldClass} defaultValue={active.style.levels.map(v => v.coeff).join(', ')} onBlur={e => { const coeffs = e.target.value.split(',').map(v => Number(v.trim())); if (coeffs.length && coeffs.length <= 40 && coeffs.every(Number.isFinite)) updateDrawing({ ...active, style: { ...active.style, levels: coeffs.map(coeff => ({ coeff, color: active.style.color, visible: true })) } }); }} /></InputField>}
      <div className="flex flex-wrap gap-2 sm:col-span-2"><Button size="sm" hint={t('cw.duplicate.hint')} onClick={() => { manager.current?.add({ ...active, id: crypto.randomUUID() }); checkpoint(); }}>{t('cw.duplicate')}</Button><Button size="sm" hint={t('cw.front.hint')} onClick={() => { manager.current?.bringToFront(active.id); checkpoint(); }}>{t('cw.front')}</Button><Button size="sm" hint={t('cw.back.hint')} onClick={() => { manager.current?.sendToBack(active.id); checkpoint(); }}>{t('cw.back')}</Button><Button size="sm" variant="danger" hint={t(active.locked ? 'cw.lockedRemove.hint' : 'cw.remove.hint')} disabled={locked || active.locked} onClick={() => { manager.current?.remove(active.id); checkpoint(); }}>{t('cw.remove')}</Button>
      {active.kind === 'table' && <><Button size="sm" hint={t('cw.tableRow.hint')} onClick={() => { manager.current?.tableOp(active.id, 'insert-row'); checkpoint(); }}>{t('cw.tableRow')}</Button><Button size="sm" hint={t('cw.tableColumn.hint')} onClick={() => { manager.current?.tableOp(active.id, 'insert-column'); checkpoint(); }}>{t('cw.tableColumn')}</Button></>}</div>
    </fieldset>}
  </div>;
  const statusStyle = appearance.statusBackground && typeof document !== 'undefined' ? { backgroundColor: withAlpha(appearance.statusColor || appearanceColors(appearance).background, appearance.opacity / 100) } : undefined;
  return <div ref={root} inert={!interactionReady} data-testid="chart-workspace" data-context={context.key} className={`${overlayLayout ? 'absolute inset-0' : 'relative isolate'} min-w-0 [&:fullscreen]:overflow-y-auto [&:fullscreen]:bg-card ${className}`} onKeyDown={e => {
    if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); history(!e.shiftKey); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); history(false); }
  }}>
    {/* Araç grupları (UI-16, 1105-A5.8): Görünüm · Göstergeler · Düzen · Pencere; yerleşim dock/ altında (DockProvider, DockSurface; UI-17) */}
    <DockSurface host={root} symbol={context.symbol} movable={overlayLayout} bottomRef={setToolbarCard} groups={{
      view: overlayLayout && (appearance.navigation || viewActions) ? <>
        {appearance.navigation && <Button size="icon-xs" variant="ghost" hint={t('cw.fit.hint')} aria-label={t('cw.fit')} onClick={() => binding?.chart.timeScale().fitContent()}><Scan size={15} /></Button>}
        {viewActions}
      </> : null,
      indicators: <>
        {overlayLayout
          ? <Button size="icon-xs" variant="ghost" hint={t('cw.indicators.hint')} aria-label={t('cw.indicators')} onClick={() => setIndicatorsOpen(true)}><ChartSpline size={15} /></Button>
          : <Button size="sm" variant="ghost" hint={t('cw.indicators.hint')} onClick={() => setIndicatorsOpen(true)}>{t('cw.indicators')}</Button>}
        {toolbarActions}
      </>,
      edit: <>
        <Button size={iconSize} variant="ghost" hint={t(historySize.undo ? 'cw.undo.hint' : 'cw.undoEmpty.hint')} aria-label={t('cw.undo')} disabled={locked || !historySize.undo} onClick={() => history(true)}><Undo2 size={15} /></Button>
        <Button size={iconSize} variant="ghost" hint={t(historySize.redo ? 'cw.redo.hint' : 'cw.redoEmpty.hint')} aria-label={t('cw.redo')} disabled={locked || !historySize.redo} onClick={() => history(false)}><Redo2 size={15} /></Button>
      </>,
      window: <>
        <Button size={iconSize} variant="ghost" hint={t('cw.settings.hint')} aria-label={t('cw.settings')} data-testid="workspace-settings" onClick={() => openSettings()}><Settings2 size={15} /></Button>
        <Button size={iconSize} variant="ghost" hint={t(isFullscreen ? 'analysis.chart.fullscreen.exit.hint' : 'analysis.chart.fullscreen.hint')} aria-label={t(isFullscreen ? 'analysis.chart.fullscreen.exit' : 'analysis.chart.fullscreen')} onClick={() => { const target = fullscreenOfPage ? (root.current?.closest<HTMLElement>('[data-chart-page]') ?? root.current) : root.current; if (!target) return; void (document.fullscreenElement ? document.exitFullscreen() : target.requestFullscreen()).catch(() => setError('cw.drawingError')); }}>{isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</Button>
      </>,
    }} />
    {(state.storageError || error) && <Alert tone="warning" title={t(state.storageError ? 'cw.storageError' : error ?? 'cw.drawingError')} />}
    <div className={overlayLayout ? 'contents' : 'relative flex min-w-0 flex-row pl-[52px]'}>
      <div className={overlayLayout ? 'absolute inset-y-0 left-0 z-20 flex w-[52px]' : 'absolute inset-y-0 left-0 flex w-[52px]'}>
        <DrawingToolbar tool={tool} gesture={gesture} preferences={preferences} magnet={magnet} keepDrawing={keepDrawing} drawingsVisible={appearance.hideDrawings}
          favorites={state.favorites} linked={drawingKey !== context.key} linkAvailable={Boolean(context.syncIdentity)} selected={selected.length > 0} canResetZoom={zoomSnapshot !== null}
          arm={arm} setGesture={setGesture} setPreferences={setPreferences} setFavorites={state.setFavorites}
          setMagnet={value => saveAppearance({ ...appearance, magnet: value })} setKeepDrawing={() => saveAppearance({ ...appearance, keepDrawing: !keepDrawing })}
          setVisibility={setVisibility} setLinked={() => { if (context.syncIdentity) { try { state.setLinked(context.key, drawingKey !== context.key ? null : linkedDrawingKey(context.syncIdentity)); } catch { setError('cw.drawingError'); } } }}
          remove={target => { if (target === 'selected' && selected.length <= 1) removeDrawings(false); else setConfirmRemove({ target, ids: [...selected] }); }}
          resetZoom={() => { if (!binding || !zoomSnapshot) return; binding.chart.timeScale().setVisibleLogicalRange(zoomSnapshot.logical); const scale = binding.candles.priceScale(); scale.setAutoScale(zoomSnapshot.autoScale); if (!zoomSnapshot.autoScale && zoomSnapshot.price) scale.setVisibleRange(zoomSnapshot.price); zoomActive.current = false; setZoomSnapshot(null); }} />
      </div>
      <div className={overlayLayout ? 'contents' : 'relative min-w-0 flex-1'}>
        {(appearance.title || appearance.timeframe || (appearance.countdown && remaining !== null)) && <div style={statusStyle} className={`${overlayLayout ? 'absolute bottom-2 left-[60px] z-10 rounded bg-card' : ''} px-2 py-1 text-xs text-muted-foreground`}>{appearance.title ? context.symbol : ''}{appearance.timeframe ? ` ${TIMEFRAME_LABEL[timeframeSec] ?? fmt.number(timeframeSec)}` : ''}{appearance.countdown && remaining !== null ? ` · ${fmt.number(remaining, { maximumFractionDigits: 0 })}s` : ''}</div>}
        <IndicatorLegend key={context.key} binding={binding} renderer={renderer} manager={manager} indicators={effectiveIndicators} latest={lastValues} names={names} favorites={state.favorites} sideOf={sideOf} maximizedPaneId={maximizedPaneId} alarmsAvailable={alarmsAvailable} atLimit={doc.indicators.length >= 20} overlayLayout={overlayLayout} showNames={appearance.names} showParams={appearance.params} showValues={appearance.values} lineMenuMode={appearance.lineMenu} textStyle={statusStyle} actions={oscillatorActions} systemPanes={systemModels} paneOrder={paneOrder} />
        <DrawingPriorityContext.Provider value={drawingPriority}>{children}</DrawingPriorityContext.Provider>
        {appearance.navigation && !overlayLayout && <div className="flex justify-center gap-1 py-1">{[-1, 1, 0].map(n => <Button key={n} size="sm" variant="ghost" hint={t(zoomHint(n))} onClick={() => { if (!binding) return; const scale = binding.chart.timeScale(), range = scale.getVisibleLogicalRange(); if (!n) scale.fitContent(); else if (range) { const mid = (range.from + range.to) / 2, half = (range.to - range.from) / (n > 0 ? 2.5 : 1.6); scale.setVisibleLogicalRange({ from: mid - half, to: mid + half }); } }}>{zoomLabel(n, t('cw.fit'))}</Button>)}</div>}
      </div>
    </div>
    {binding && !binding.isDisposed() && gesture && <ChartGestureLayer key={`${context.key}-${gesture}`} binding={binding} mode={gesture} digits={digits} cancel={() => setGesture(null)} finishZoom={previous => { zoomActive.current = true; setZoomSnapshot(previous); setGesture(null); arm(null); }} />}
    {confirmRemove && <ConfirmModal open title={t(removalLabels[confirmRemove.target].title)} message={t(removalLabels[confirmRemove.target].message)} confirmHint={t(removalLabels[confirmRemove.target].hint)} onClose={() => setConfirmRemove(null)} onConfirm={() => { if (confirmRemove.target === 'indicators') saveDocument({ ...doc, indicators: doc.indicators.filter(isSystemRsi) }); else removeDrawings(confirmRemove.target === 'drawings', confirmRemove.ids); }} />}
    <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label={t('cw.image')} data-tooltip-exempt onChange={e => { void changeImage(e.target.files?.[0]); e.target.value = ''; }} />
    {settingsOpen && <SettingsDialog initialSection={settingsSection} toolbarResettable={overlayLayout} initialAppearance={appearance} onApply={saveAppearance} defaultMargins={binding?.defaultMargins?.()} ohlcAvailable={!overlayLayout} countdownAvailable={countdownNow != null} onClose={() => setSettingsOpen(false)} overlayContent={overlays} rollbackOverlays={rollbackOverlays} commitOverlays={() => { state.finishOverlayPreview(true); useAnalysisPrefsStore.getState().finishPreview(true); }} />}
    {indicatorsOpen && <IndicatorDialog values={paneIndicators} favorites={state.favorites.filter(kind => INDICATOR_KINDS.includes(kind as Indicator['kind'])) as Indicator['kind'][]} focusId={settingsFocus} timeframeSec={timeframeSec} drawingsPanel={drawingsPanel} drawingCount={drawings.length} onClose={() => { setIndicatorsOpen(false); setSettingsFocus(null); }} onChange={next => {
      // The dialog does not list the system RSI while its layer is off, and deleting it there only switches the layer off
      const current = documentRef.current, system = current.indicators.find(isSystemRsi), lost = !!system && !next.some(isSystemRsi);
      const indicators = lost ? [system, ...next] : next, base = lost && (current.overlays.rsi ?? true) ? applySystemLayer(current, 'rsi', false) : current;
      saveDocument({ ...base, indicators, alarms: current.alarms.filter(alarm => indicators.some(item => item.id === alarm.indicatorId)) });
    }} />}
    {alarmTarget && <Modal open onClose={() => setAlarmTarget(null)} title={t('cw.indicatorAlarm')}><div className="grid gap-3 sm:grid-cols-2"><InputField label={t('cw.alarmDirection')} hint={t('cw.alarmDirection.hint')}><select className={fieldClass} value={alarmDirection} onChange={event => setAlarmDirection(event.target.value as 'above' | 'below')}><option value="above">{t('cw.alarmAbove')}</option><option value="below">{t('cw.alarmBelow')}</option></select></InputField><InputField label={t('cw.alarmValue')} hint={t('cw.alarmValue.hint')}><input className={fieldClass} type="number" value={alarmValue} onChange={event => setAlarmValue(event.target.value)} /></InputField></div><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="primary" hint={t('cw.alarmSave.hint')} disabled={!alarmValue || !Number.isFinite(Number(alarmValue))} onClick={addAlarm}>{t('cw.alarmSave')}</Button>{doc.alarms.filter(alarm => alarm.indicatorId === alarmTarget.id).map(alarm => <Button key={alarm.id} size="sm" variant="ghost" hint={t('cw.alarmDelete.hint')} onClick={() => saveDocument({ ...documentRef.current, alarms: documentRef.current.alarms.filter(item => item.id !== alarm.id) })}>{alarm.direction === 'above' ? '≥' : '≤'} {fmt.number(alarm.value)}{alarm.armed ? '' : ` · ${t('cw.alarmFired')}`} · {t('cw.alarmDelete')}</Button>)}</div></Modal>}
    {indicatorInfo && <Modal open onClose={() => setIndicatorInfo(null)} title={`${names.get(indicatorInfo.indicator.id) ?? indicatorInfo.indicator.kind} · ${t(indicatorInfo.formula ? 'cw.indicatorSource' : 'cw.indicatorInfo')}`}>
      <p className="mb-2 text-sm text-muted-foreground">{t(indicatorInfo.formula ? 'cw.indicatorSourceReadOnly' : 'cw.indicatorInfoText')}</p>
      {indicatorInfo.formula
        ? <pre className="max-h-[50dvh] overflow-auto rounded-lg bg-muted p-3 text-xs" data-testid="indicator-formula">{indicatorFormula(indicatorInfo.indicator)}</pre>
        : <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm" data-testid="indicator-info">
          <dt className="text-muted-foreground">{t('cw.period')}</dt><dd>{fmt.number(indicatorInfo.indicator.period)}</dd>
          {['EWO', 'MACD'].includes(indicatorInfo.indicator.kind) && <><dt className="text-muted-foreground">{t('cw.slow')}</dt><dd>{fmt.number(indicatorInfo.indicator.slow)}</dd></>}
          {indicatorInfo.indicator.kind === 'MACD' && <><dt className="text-muted-foreground">{t('cw.signal')}</dt><dd>{fmt.number(indicatorInfo.indicator.signal)}</dd></>}
          {indicatorInfo.indicator.kind !== 'ATR' && <><dt className="text-muted-foreground">{t('cw.source')}</dt><dd>{indicatorInfo.indicator.source}</dd></>}
        </dl>}
    </Modal>}
    {editor && <Modal open onClose={() => { if (editor.cell) manager.current?.endTableEdit(); setEditor(null); }} title={t(editor.cell ? 'cw.cell' : 'cw.text')}><InputField label={t('cw.text')} hint={t('cw.text.hint')}><textarea className={fieldClass} value={editor.text} onChange={e => setEditor({ ...editor, text: e.target.value })} /></InputField><Button className="mt-3" variant="primary" hint={t('cw.apply.hint')} onClick={() => { if (locked) return; if (editor.cell) { manager.current?.setTableCellText(editor.drawing.id, editor.cell, editor.text); manager.current?.endTableEdit(); } else manager.current?.update({ ...editor.drawing, text: editor.text }); checkpoint(); setEditor(null); }}>{t('cw.apply')}</Button></Modal>}
  </div>;
}
