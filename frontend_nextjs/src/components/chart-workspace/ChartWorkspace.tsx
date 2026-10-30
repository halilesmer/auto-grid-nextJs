'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cacheImage, decodeImage, DrawingManager, OVERLAY_SPECS, setImageReader, type Drawing, type DrawingKind, type MagnetMode, type TableCellRef } from 'lightweight-charts-drawing';
import { CrosshairMode, type UTCTimestamp } from 'lightweight-charts';
import { ListTree, Maximize2, Minimize2, Redo2, Settings2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { InputField } from '@/components/ui/InputField';
import { Modal } from '@/components/ui/modal';
import { useFormat, useT, type MessageKey } from '@/i18n';
import { TIMEFRAME_SEC, type Bar, type MissingRange } from '@/lib/analysis/candles';
import { newIndicator, type Indicator, type Value } from '@/lib/chart-workspace/indicators';
import { useChartWorkspaceStore, emptyChartDocument, type ChartDocument } from '@/store/useChartWorkspaceStore';
import { useThemeStore } from '@/store';
import { useAnalysisPrefsStore } from '@/store/useAnalysisPrefsStore';
import { ReplayDrawingVisibility } from '@/lib/chart-workspace/replayDrawings';
import { withAlpha } from '@/lib/chartTheme';
import { applyAppearance, appearanceColors, IndicatorRenderer, type ChartBinding } from './runtime';
import { Choice, ColorField, fieldClass, Numeric, SettingsDialog, Toggle } from './SettingsDialog';
import { IndicatorDialog } from './IndicatorDialog';
import ConfirmModal from '@/components/ConfirmModal';
import { DrawingToolbar } from './DrawingToolbar';
import { ChartGestureLayer, type ZoomSnapshot } from './ChartGestureLayer';
import { defaultToolbar, toolGroup, type ChartGesture } from '@/lib/chart-workspace/toolbar';
import { linkedDrawingKey, type DrawingIdentity } from '@/lib/chart-workspace/linkedDrawings';

const removalLabels = {
  selected: { title: 'cw.rail.removeSelected', message: 'cw.rail.confirmSelected', hint: 'cw.rail.removeSelected.hint' },
  drawings: { title: 'cw.rail.removeDrawings', message: 'cw.rail.confirmDrawings', hint: 'cw.rail.removeDrawings.hint' },
  indicators: { title: 'cw.rail.removeIndicators', message: 'cw.rail.confirmIndicators', hint: 'cw.rail.removeIndicators.hint' },
} as const;
const TIMEFRAME_LABEL = Object.fromEntries(Object.entries(TIMEFRAME_SEC).map(([name, seconds]) => [seconds, name]));
function zoomHint(n: number): MessageKey { if (!n) return 'cw.fit.hint'; return n > 0 ? 'cw.zoomIn.hint' : 'cw.zoomOut.hint'; }
function zoomLabel(n: number, fit: string) { if (!n) return fit; return n > 0 ? '+' : '−'; }
const toolKey = (kind: DrawingKind) => `cw.tool.${kind}` as MessageKey;
export interface WorkspaceContext { key: string; symbol: string; view: 'analysis' | 'backtest' | 'formation' | 'free'; systemRsi?: boolean; syncIdentity?: DrawingIdentity }
interface Props {
  context: WorkspaceContext;
  binding: ChartBinding | null;
  bars: readonly Bar[];
  missing: readonly MissingRange[];
  timeframeSec: number;
  digits: number | null;
  until: number;
  countdownNow?: number | null;
  children: ReactNode;
  overlays?: ReactNode;
  /** Preserve the old RSI preference without modifying the formation detector. */
  showRsi?: boolean;
  className?: string;
  overlayLayout?: boolean;
}

export function ChartWorkspace({ context, binding, bars, missing, timeframeSec, digits, until, countdownNow, children, overlays, showRsi = true, className = '', overlayLayout = false }: Props) {
  const t = useT(), fmt = useFormat();
  const root = useRef<HTMLDivElement>(null), manager = useRef<DrawingManager | null>(null), renderer = useRef<IndicatorRenderer | null>(null);
  const drawingBars = useMemo(() => bars.map(b => ({ ...b, time: b.time as UTCTimestamp })), [bars]);
  const live = useRef({ drawingBars, until, timeframeSec });
  const replay = useRef(new ReplayDrawingVisibility());
  const documentRef = useRef<ChartDocument>(emptyChartDocument());
  const undo = useRef<string[]>([]), redo = useRef<string[]>([]), current = useRef('[]');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [gesture, setGesture] = useState<ChartGesture>(null);
  const zoomActive = useRef(false);
  const [zoomSnapshot, setZoomSnapshot] = useState<ZoomSnapshot | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{ target: 'selected' | 'drawings' | 'indicators'; ids: string[] } | null>(null);
  const originalLocks = useRef(new Map<string, boolean | undefined>());
  const [activeObject, setActiveObject] = useState<string | null>(null);
  const [drawingSnapshot, setDrawingSnapshot] = useState<Drawing[]>([]);
  const [historySize, setHistorySize] = useState({ undo: 0, redo: 0 });
  const [revision, setRevision] = useState(0), [selected, setSelected] = useState<string[]>([]), [tool, setTool] = useState<DrawingKind | null>(null);
  const [objectsOpen, setObjectsOpen] = useState(false), [settingsOpen, setSettingsOpen] = useState(false), [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null), [editor, setEditor] = useState<{ drawing: Drawing; cell?: TableCellRef; text: string } | null>(null);
  const [lastValues, setLastValues] = useState<{ config: Indicator; value: Value }[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const imageInput = useRef<HTMLInputElement>(null);
  const state = useChartWorkspaceStore(), theme = useThemeStore(s => s.resolvedTheme);
  const appearance = state.preview ?? state.appearance;
  const toolbarDefaults = useMemo(() => defaultToolbar(), []);
  const preferences = state.toolbar[context.key] ?? toolbarDefaults;
  const drawingKey = state.links[context.key] ?? context.key;
  const locked = preferences.locked;
  const magnet = appearance.magnet as MagnetMode, keepDrawing = appearance.keepDrawing;
  const defaults = useMemo(() => {
    const indicators = context.systemRsi ? [newIndicator('EWO')] : [newIndicator('RSI'), newIndicator('EWO')];
    indicators.forEach(v => { v.id = `initial-${v.kind}`; });
    return { ...emptyChartDocument(), indicators };
  }, [context.systemRsi]);
  const ownDocument = state.documents[context.key] ?? defaults;
  const sharedDocument = state.documents[drawingKey];
  const doc = useMemo(() => drawingKey === context.key || !sharedDocument ? ownDocument : { ...ownDocument, drawings: sharedDocument.drawings, images: sharedDocument.images }, [drawingKey, context.key, sharedDocument, ownDocument]);
  const effectiveIndicators = useMemo(() => preferences.indicatorsHidden ? [] : doc.indicators.filter(v => v.id !== 'initial-RSI' || showRsi), [doc.indicators, showRsi, preferences.indicatorsHidden]);

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
  useEffect(() => { live.current = { drawingBars, until, timeframeSec }; documentRef.current = doc; });
  const saveDocument = useCallback((next: ChartDocument) => {
    documentRef.current = next;
    const store = useChartWorkspaceStore.getState();
    if (drawingKey === context.key) store.setDocument(context.key, next);
    else {
      const own = store.documents[context.key] ?? defaults;
      if (own.indicators !== next.indicators || own.overlays !== next.overlays) store.setDocument(context.key, { ...own, indicators: next.indicators, overlays: next.overlays });
      store.setDocument(drawingKey, { ...emptyChartDocument(), drawings: next.drawings, images: next.images });
    }
  }, [context.key, drawingKey, defaults]);
  const rollbackOverlays = useCallback(() => {
    useChartWorkspaceStore.getState().finishOverlayPreview(false);
    useAnalysisPrefsStore.getState().finishPreview(false);
  }, []);
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
    const privateDoc = useChartWorkspaceStore.getState().documents[context.key] ?? defaults;
    const shared = useChartWorkspaceStore.getState().documents[drawingKey];
    const stored = shared && drawingKey !== context.key ? { ...privateDoc, drawings: shared.drawings, images: shared.images } : privateDoc;
    documentRef.current = stored;
    if (!useChartWorkspaceStore.getState().documents[context.key]) useChartWorkspaceStore.getState().setDocument(context.key, privateDoc);
    replay.current.clear(); originalLocks.current.clear();
    try { m.importJSON(stored.drawings); }
    catch { queueMicrotask(() => setError('cw.drawingError')); }
    // Restore image bytes before drawing; no remote image URLs are accepted.
    for (const [name, url] of Object.entries(stored.images)) void decodeImage(url).then(img => { if (!disposed) { cacheImage(name, img); m.redraw(); } }).catch(() => { if (!disposed) setError('cw.imageError'); });
    current.current = m.exportJSON(); replay.current.sync(m, live.current.until); undo.current = []; redo.current = [];
    const off = [m.on('selection', ids => { setSelected([...ids]); if (ids[0]) setActiveObject(ids[0]); }), m.on('tool', setTool), m.on('visibility', visible => { const a = useChartWorkspaceStore.getState().appearance; if (a.hideDrawings !== visible) useChartWorkspaceStore.getState().setAppearance({ ...a, hideDrawings: visible }); }), m.on('gestureEnd', checkpoint), m.on('remove', () => queueMicrotask(() => { if (manager.current === m) checkpoint(); })), m.on('textEdit', drawing => { if (!useChartWorkspaceStore.getState().toolbar[context.key]?.locked) setEditor({ drawing, text: drawing.text ?? '' }); }), m.on('tableEdit', (drawing, cell) => { if (!useChartWorkspaceStore.getState().toolbar[context.key]?.locked) setEditor({ drawing, cell, text: drawing.style.tableCells?.[cell[0]]?.[cell[1]] ?? '' }); })];
    const deactivate = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) { m.setTool(null); m.select([]); } };
    const focusOut = (e: FocusEvent) => { if (e.relatedTarget && !root.current?.contains(e.relatedTarget as Node)) { m.setTool(null); m.select([]); } };
    const inputFocus = (e: FocusEvent) => { if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) { m.setTool(null); m.select([]); } };
    document.addEventListener('pointerdown', deactivate, true);
    const el = root.current; el?.addEventListener('focusout', focusOut); el?.addEventListener('focusin', inputFocus);
    const r = new IndicatorRenderer(binding); renderer.current = r;
    const frame = requestAnimationFrame(() => { setTool(m.tool()); setSelected([...m.selection()]); checkpoint(); });
    let disposed = false;
    const dispose = () => { if (disposed) return; disposed = true; cancelAnimationFrame(frame); off.forEach(f => f()); document.removeEventListener('pointerdown', deactivate, true); el?.removeEventListener('focusout', focusOut); el?.removeEventListener('focusin', inputFocus); r.destroy(); renderer.current = null; m.destroy(); manager.current = null; };
    const unregister = binding.onDispose(dispose);
    return () => { unregister(); dispose(); };
  }, [binding, context.key, drawingKey, state.hydrated, defaults, checkpoint]);

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
    const values = renderer.current?.update(effectiveIndicators, bars, missing, timeframeSec, appearance, context.symbol, until) ?? [];
    const frame = requestAnimationFrame(() => setLastValues(values));
    manager.current?.setDrawingsVisible(appearance.hideDrawings);
    manager.current?.setInterval(timeframeSec >= 86400 ? '1D' : String(timeframeSec / 60));
    if (manager.current) replay.current.sync(manager.current, until);
    manager.current?.redraw();
    return () => cancelAnimationFrame(frame);
  }, [binding, appearance, digits, effectiveIndicators, bars, missing, timeframeSec, context.symbol, until, theme, revision, preferences.cursor]);

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
      state.setAppearance({ ...appearance, hideDrawings: visible }); setPreferences({ indicatorsHidden: !visible });
    } else if (target === 'drawings') state.setAppearance({ ...appearance, hideDrawings: !appearance.hideDrawings });
    else setPreferences({ indicatorsHidden: !preferences.indicatorsHidden });
  };
  const statusStyle = appearance.statusBackground && typeof document !== 'undefined' ? { backgroundColor: withAlpha(appearance.statusColor || appearanceColors(appearance).background, appearance.opacity / 100) } : undefined;
  return <div ref={root} data-testid="chart-workspace" data-context={context.key} className={`${overlayLayout ? 'absolute inset-0' : 'relative'} min-w-0 [&:fullscreen]:overflow-y-auto [&:fullscreen]:bg-card ${className}`} onKeyDown={e => {
    if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); history(!e.shiftKey); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); history(false); }
  }}>
    <div className={`${overlayLayout ? 'absolute bottom-8 left-[60px] right-20 z-20 rounded-lg shadow-lg' : ''} flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-2 py-1.5`} data-testid="workspace-toolbar">
      <span className="min-w-0 truncate text-xs font-medium">{context.symbol}</span>
      <div className="flex flex-wrap items-center gap-1">
        {overlayLayout && appearance.navigation && <Button size="sm" variant="ghost" hint={t('cw.fit.hint')} onClick={() => binding?.chart.timeScale().fitContent()}>{t('cw.fit')}</Button>}
        <Button size="sm" variant="ghost" hint={t('cw.indicators.hint')} onClick={() => setIndicatorsOpen(true)}>{t('cw.indicators')}</Button>
        <Button size="icon-sm" variant="ghost" hint={t(historySize.undo ? 'cw.undo.hint' : 'cw.undoEmpty.hint')} aria-label={t('cw.undo')} disabled={locked || !historySize.undo} onClick={() => history(true)}><Undo2 size={15} /></Button>
        <Button size="icon-sm" variant="ghost" hint={t(historySize.redo ? 'cw.redo.hint' : 'cw.redoEmpty.hint')} aria-label={t('cw.redo')} disabled={locked || !historySize.redo} onClick={() => history(false)}><Redo2 size={15} /></Button>
        <Button size="icon-sm" variant="ghost" hint={t('cw.objects.hint')} aria-label={t('cw.objects')} onClick={() => setObjectsOpen(true)}><ListTree size={15} /></Button>
        <Button size="icon-sm" variant="ghost" hint={t('cw.settings.hint')} aria-label={t('cw.settings')} data-testid="workspace-settings" onClick={() => { useAnalysisPrefsStore.getState().beginPreview(); state.beginOverlayPreview(context.key); state.setPreview({ ...state.appearance }); setSettingsOpen(true); }}><Settings2 size={15} /></Button>
        <Button size="icon-sm" variant="ghost" hint={t(isFullscreen ? 'analysis.chart.fullscreen.exit.hint' : 'analysis.chart.fullscreen.hint')} aria-label={t(isFullscreen ? 'analysis.chart.fullscreen.exit' : 'analysis.chart.fullscreen')} onClick={() => { const target = root.current; if (!target) return; void (document.fullscreenElement ? document.exitFullscreen() : target.requestFullscreen()).catch(() => setError('cw.drawingError')); }}>{isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</Button>
      </div>
    </div>
    {(state.storageError || error) && <Alert tone="warning" title={t(state.storageError ? 'cw.storageError' : error ?? 'cw.drawingError')} />}
    <div className={overlayLayout ? 'contents' : 'relative flex min-w-0 flex-row pl-[52px]'}>
      <div className={overlayLayout ? 'absolute bottom-0 left-0 top-18 z-20 flex w-[52px] lg:top-0' : 'absolute inset-y-0 left-0 flex w-[52px]'}>
        <DrawingToolbar tool={tool} gesture={gesture} preferences={preferences} magnet={magnet} keepDrawing={keepDrawing} drawingsVisible={appearance.hideDrawings}
          favorites={state.favorites} linked={drawingKey !== context.key} linkAvailable={Boolean(context.syncIdentity)} selected={selected.length > 0} canResetZoom={zoomSnapshot !== null}
          arm={arm} setGesture={setGesture} setPreferences={setPreferences} setFavorites={state.setFavorites}
          setMagnet={value => state.setAppearance({ ...appearance, magnet: value })} setKeepDrawing={() => state.setAppearance({ ...appearance, keepDrawing: !keepDrawing })}
          setVisibility={setVisibility} setLinked={() => { if (context.syncIdentity) { try { state.setLinked(context.key, drawingKey !== context.key ? null : linkedDrawingKey(context.syncIdentity)); } catch { setError('cw.drawingError'); } } }}
          remove={target => { if (target === 'selected' && selected.length <= 1) removeDrawings(false); else setConfirmRemove({ target, ids: [...selected] }); }}
          resetZoom={() => { if (!binding || !zoomSnapshot) return; binding.chart.timeScale().setVisibleLogicalRange(zoomSnapshot.logical); const scale = binding.candles.priceScale(); scale.setAutoScale(zoomSnapshot.autoScale); if (!zoomSnapshot.autoScale && zoomSnapshot.price) scale.setVisibleRange(zoomSnapshot.price); zoomActive.current = false; setZoomSnapshot(null); }} />
      </div>
      <div className={overlayLayout ? 'contents' : 'relative min-w-0 flex-1'}>
        {(appearance.title || appearance.timeframe || (appearance.countdown && remaining !== null)) && <div style={statusStyle} className={`${overlayLayout ? 'absolute bottom-2 left-[60px] z-10 rounded bg-card' : ''} px-2 py-1 text-xs text-muted-foreground`}>{appearance.title ? context.symbol : ''}{appearance.timeframe ? ` ${TIMEFRAME_LABEL[timeframeSec] ?? fmt.number(timeframeSec)}` : ''}{appearance.countdown && remaining !== null ? ` · ${fmt.number(remaining, { maximumFractionDigits: 0 })}s` : ''}</div>}
        {children}
        {(appearance.names || appearance.params || appearance.values) && <div className={`${overlayLayout ? 'absolute right-20 bottom-2 z-10 max-w-[50%] rounded bg-card' : ''} flex flex-wrap gap-x-4 gap-y-1 px-2 py-1 font-mono text-[11px] text-muted-foreground`} style={statusStyle} data-testid="workspace-indicator-values">{lastValues.map(({ config: c, value }) => <span key={c.id} data-indicator-value={c.kind}>{appearance.names ? c.kind : ''}{appearance.params ? ` (${c.period}${c.kind === 'EWO' || c.kind === 'MACD' ? `/${c.slow}` : ''})` : ''}{appearance.values && c.values ? ` ${value === null ? '—' : fmt.number(value, { maximumFractionDigits: 5 })}` : ''}</span>)}</div>}
        {appearance.navigation && !overlayLayout && <div className="flex justify-center gap-1 py-1">{[-1, 1, 0].map(n => <Button key={n} size="sm" variant="ghost" hint={t(zoomHint(n))} onClick={() => { if (!binding) return; const scale = binding.chart.timeScale(), range = scale.getVisibleLogicalRange(); if (!n) scale.fitContent(); else if (range) { const mid = (range.from + range.to) / 2, half = (range.to - range.from) / (n > 0 ? 2.5 : 1.6); scale.setVisibleLogicalRange({ from: mid - half, to: mid + half }); } }}>{zoomLabel(n, t('cw.fit'))}</Button>)}</div>}
      </div>
    </div>
    {binding && !binding.isDisposed() && gesture && <ChartGestureLayer key={`${context.key}-${gesture}`} binding={binding} mode={gesture} digits={digits} cancel={() => setGesture(null)} finishZoom={previous => { zoomActive.current = true; setZoomSnapshot(previous); setGesture(null); arm(null); }} />}
    {confirmRemove && <ConfirmModal open title={t(removalLabels[confirmRemove.target].title)} message={t(removalLabels[confirmRemove.target].message)} confirmHint={t(removalLabels[confirmRemove.target].hint)} onClose={() => setConfirmRemove(null)} onConfirm={() => { if (confirmRemove.target === 'indicators') saveDocument({ ...doc, indicators: [] }); else removeDrawings(confirmRemove.target === 'drawings', confirmRemove.ids); }} />}
    <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label={t('cw.image')} data-tooltip-exempt onChange={e => { void changeImage(e.target.files?.[0]); e.target.value = ''; }} />
    {settingsOpen && <SettingsDialog defaultMargins={binding?.defaultMargins?.()} ohlcAvailable={!overlayLayout} countdownAvailable={countdownNow != null} onClose={() => setSettingsOpen(false)} overlayContent={overlays} rollbackOverlays={rollbackOverlays} commitOverlays={() => { state.finishOverlayPreview(true); useAnalysisPrefsStore.getState().finishPreview(true); }} />}
    {indicatorsOpen && <IndicatorDialog values={doc.indicators} timeframeSec={timeframeSec} onClose={() => setIndicatorsOpen(false)} onChange={indicators => saveDocument({ ...doc, indicators })} />}
    {objectsOpen && <Modal open title={t('cw.objects')} onClose={() => setObjectsOpen(false)} className="max-h-[85dvh] max-w-3xl overflow-y-auto">
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
    </Modal>}
    {editor && <Modal open onClose={() => { if (editor.cell) manager.current?.endTableEdit(); setEditor(null); }} title={t(editor.cell ? 'cw.cell' : 'cw.text')}><InputField label={t('cw.text')} hint={t('cw.text.hint')}><textarea className={fieldClass} value={editor.text} onChange={e => setEditor({ ...editor, text: e.target.value })} /></InputField><Button className="mt-3" variant="primary" hint={t('cw.apply.hint')} onClick={() => { if (locked) return; if (editor.cell) { manager.current?.setTableCellText(editor.drawing.id, editor.cell, editor.text); manager.current?.endTableEdit(); } else manager.current?.update({ ...editor.drawing, text: editor.text }); checkpoint(); setEditor(null); }}>{t('cw.apply')}</Button></Modal>}
  </div>;
}
