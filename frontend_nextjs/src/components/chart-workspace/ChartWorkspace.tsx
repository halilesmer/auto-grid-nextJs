'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cacheImage, decodeImage, DrawingManager, OVERLAY_SPECS, setImageReader, type Drawing, type DrawingKind, type MagnetMode, type TableCellRef } from 'lightweight-charts-drawing';
import { type UTCTimestamp } from 'lightweight-charts';
import { Eye, Pencil, ListTree, Maximize2, Minimize2, MousePointer2, Redo2, Settings2, Star, Undo2 } from 'lucide-react';
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
import type { Appearance } from '@/lib/chart-workspace/settings';
import { applyAppearance, appearanceColors, IndicatorRenderer, type ChartBinding } from './runtime';
import { Choice, ColorField, fieldClass, Numeric, SettingsDialog, Toggle } from './SettingsDialog';
import { IndicatorDialog } from './IndicatorDialog';

const TIMEFRAME_LABEL = Object.fromEntries(Object.entries(TIMEFRAME_SEC).map(([name, seconds]) => [seconds, name]));
const EXCLUDED = new Set(['anchored-vwap', 'fixed-range-volume-profile', 'anchored-volume-profile']);
const TOOLS = (Object.keys(OVERLAY_SPECS) as DrawingKind[]).filter(k => !EXCLUDED.has(k));
const TOOL_GROUPS = ['lines', 'channels', 'fib', 'gann', 'patterns', 'waves', 'measurements', 'shapes', 'annotations'] as const;
function toolGroup(kind: DrawingKind): typeof TOOL_GROUPS[number] {
  if (/fib/.test(kind)) return 'fib';
  if (/gann/.test(kind)) return 'gann';
  if (/elliott/.test(kind)) return 'waves';
  if (/pattern|cypher|head-and-shoulders/.test(kind)) return 'patterns';
  if (/channel|pitchfork|pitchfan|flat-top/.test(kind)) return 'channels';
  if (/position|range|info-line|trend-angle|regression/.test(kind)) return 'measurements';
  if (/text|note|pin|comment|signpost|callout|font-icon|table|image|flag/.test(kind)) return 'annotations';
  if (/rectangle|circle|ellipse|triangle|curve|arc|sector|brush|path|polyline|highlighter/.test(kind)) return 'shapes';
  return 'lines';
}
function zoomHint(n: number): MessageKey { if (!n) return 'cw.fit.hint'; return n > 0 ? 'cw.zoomIn.hint' : 'cw.zoomOut.hint'; }
function zoomLabel(n: number, fit: string) { if (!n) return fit; return n > 0 ? '+' : '−'; }
const toolKey = (kind: DrawingKind) => `cw.tool.${kind}` as MessageKey;
export interface WorkspaceContext { key: string; symbol: string; view: 'analysis' | 'backtest' | 'formation' | 'free'; systemRsi?: boolean }
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
  const [toolsOpen, setToolsOpen] = useState(false);
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
  const perProduct = context.view === 'analysis' || context.view === 'free';
  const defaults = useMemo(() => {
    const indicators = context.systemRsi ? [newIndicator('EWO')] : [newIndicator('RSI'), newIndicator('EWO')];
    indicators.forEach(v => { v.id = `initial-${v.kind}`; });
    return { ...emptyChartDocument(), indicators };
  }, [context.systemRsi]);
  const doc = state.documents[context.key] ?? defaults;
  const appearance = state.preview ?? (perProduct ? doc.appearance ?? state.appearance : state.appearance);
  const magnet = appearance.magnet as MagnetMode, keepDrawing = appearance.keepDrawing;
  const effectiveIndicators = useMemo(() => doc.indicators.filter(v => v.id !== 'initial-RSI' || showRsi), [doc.indicators, showRsi]);

  useEffect(() => {
    // The library may paint before our preload finishes. Its default reader rejects
    // uncached images and deletes their drawings, so register the local asset source first.
    setImageReader(async name => {
      const data = Object.values(useChartWorkspaceStore.getState().documents).find(d => d.images[name])?.images[name];
      if (!data || !/^data:image\/(png|jpeg|webp);base64,/.test(data)) throw new Error('Local chart image missing');
      return (await fetch(data)).blob();
    });
    useChartWorkspaceStore.getState().hydrate();
  }, []);
  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(root.current && document.fullscreenElement?.contains(root.current)));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  useEffect(() => { live.current = { drawingBars, until, timeframeSec }; documentRef.current = doc; });
  const saveDocument = useCallback((next: ChartDocument) => { documentRef.current = next; useChartWorkspaceStore.getState().setDocument(context.key, next); }, [context.key]);
  const saveAppearance = useCallback((next: Appearance) => {
    if (perProduct) {
      const current = useChartWorkspaceStore.getState().documents[context.key] ?? documentRef.current;
      saveDocument({ ...current, appearance: next });
    } else useChartWorkspaceStore.getState().setAppearance(next);
  }, [context.key, perProduct, saveDocument]);
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
    const snapshot = replay.current.snapshot(m);
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
    const from = back ? undo.current : redo.current, to = back ? redo.current : undo.current, json = from.pop();
    if (json === undefined || !manager.current) return;
    to.push(current.current); current.current = json; replay.current.clear(); manager.current.importJSON(json);
    saveDocument({ ...documentRef.current, drawings: json }); checkpoint();
  };

  useEffect(() => {
    if (!binding || binding.isDisposed() || !state.hydrated) return;
    const m = new DrawingManager(binding.chart, binding.candles, { bars: () => live.current.drawingBars, magnet: 'weak', timeInfo: () => ({ timeZone: 'UTC', intraday: live.current.timeframeSec < 86400 }) });
    manager.current = m;
    const storeState = useChartWorkspaceStore.getState();
    const stored = storeState.documents[context.key] ?? { ...defaults, ...(perProduct ? { appearance: storeState.appearance } : {}) };
    documentRef.current = stored;
    if (!storeState.documents[context.key] || (perProduct && stored.appearance === undefined)) useChartWorkspaceStore.getState().setDocument(context.key, stored);
    replay.current.clear();
    try { m.importJSON(stored.drawings); }
    catch { queueMicrotask(() => setError('cw.drawingError')); }
    // Restore image bytes before drawing; no remote image URLs are accepted.
    for (const [name, url] of Object.entries(stored.images)) void decodeImage(url).then(img => { if (!disposed) { cacheImage(name, img); m.redraw(); } }).catch(() => { if (!disposed) setError('cw.imageError'); });
    current.current = m.exportJSON(); replay.current.sync(m, live.current.until); undo.current = []; redo.current = [];
    const off = [m.on('selection', ids => { setSelected([...ids]); if (ids[0]) setActiveObject(ids[0]); }), m.on('tool', setTool), m.on('gestureEnd', checkpoint), m.on('remove', () => queueMicrotask(() => { if (manager.current === m) checkpoint(); })), m.on('textEdit', drawing => setEditor({ drawing, text: drawing.text ?? '' })), m.on('tableEdit', (drawing, cell) => setEditor({ drawing, cell, text: drawing.style.tableCells?.[cell[0]]?.[cell[1]] ?? '' }))];
    const deactivate = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) { m.setTool(null); m.select([]); } };
    const focusOut = (e: FocusEvent) => { if (e.relatedTarget && !root.current?.contains(e.relatedTarget as Node)) { m.setTool(null); m.select([]); } };
    const inputFocus = (e: FocusEvent) => { if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) { m.setTool(null); m.select([]); } };
    document.addEventListener('pointerdown', deactivate, true);
    const el = root.current; el?.addEventListener('focusout', focusOut); el?.addEventListener('focusin', inputFocus);
    const r = new IndicatorRenderer(binding); renderer.current = r;
    const frame = requestAnimationFrame(checkpoint);
    let disposed = false;
    const dispose = () => { if (disposed) return; disposed = true; cancelAnimationFrame(frame); off.forEach(f => f()); document.removeEventListener('pointerdown', deactivate, true); el?.removeEventListener('focusout', focusOut); el?.removeEventListener('focusin', inputFocus); r.destroy(); renderer.current = null; m.destroy(); manager.current = null; };
    const unregister = binding.onDispose(dispose);
    return () => { unregister(); dispose(); };
  }, [binding, context.key, state.hydrated, defaults, checkpoint, perProduct]);

  useEffect(() => { manager.current?.setMagnet(magnet); manager.current?.setStayInDrawingMode(keepDrawing); }, [magnet, keepDrawing, binding, state.hydrated]);
  useEffect(() => {
    if (!binding || binding.isDisposed()) return;
    applyAppearance(binding, appearance, digits);
    const values = renderer.current?.update(effectiveIndicators, bars, missing, timeframeSec, appearance, context.symbol, until) ?? [];
    const frame = requestAnimationFrame(() => setLastValues(values));
    manager.current?.setDrawingsVisible(appearance.hideDrawings);
    manager.current?.setInterval(timeframeSec >= 86400 ? '1D' : String(timeframeSec / 60));
    if (manager.current) replay.current.sync(manager.current, until);
    manager.current?.redraw();
    return () => cancelAnimationFrame(frame);
  }, [binding, appearance, digits, effectiveIndicators, bars, missing, timeframeSec, context.symbol, until, theme, revision]);

  useEffect(() => {
    if (!appearance.countdown || countdownNow == null) return;
    const started = Date.now();
    const frame = requestAnimationFrame(() => setElapsed(0));
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => { clearInterval(timer); cancelAnimationFrame(frame); };
  }, [appearance.countdown, countdownNow]);

  const arm = (kind: DrawingKind | null) => {
    if (kind === 'image') { imageInput.current?.click(); return; }
    manager.current?.setTool(kind, kind === 'font-icon' ? { glyph: '★' } : undefined);
    binding?.host.focus({ preventScroll: true });
  };
  const active = drawingSnapshot.find(d => d.id === activeObject && d.points.every(p => typeof p.time !== 'number' || p.time <= until));
  const updateDrawing = (next: Drawing) => { manager.current?.update(next); checkpoint(); };
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
  let toolVisibility = toolsOpen ? 'flex' : 'hidden sm:flex';
  if (overlayLayout && !toolsOpen) toolVisibility = 'hidden';
  const statusStyle = appearance.statusBackground && typeof document !== 'undefined' ? { backgroundColor: withAlpha(appearance.statusColor || appearanceColors(appearance).background, appearance.opacity / 100) } : undefined;
  return <div ref={root} data-testid="chart-workspace" data-context={context.key} className={`${overlayLayout ? 'absolute inset-0' : 'relative'} min-w-0 [&:fullscreen]:overflow-y-auto [&:fullscreen]:bg-card ${className}`} onKeyDown={e => {
    if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); history(!e.shiftKey); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); history(false); }
  }}>
    <div className={`${overlayLayout ? 'absolute bottom-8 left-12 right-20 z-20 rounded-lg shadow-lg' : ''} flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-2 py-1.5`} data-testid="workspace-toolbar">
      <span className="min-w-0 truncate text-xs font-medium">{context.symbol}</span>
      <div className="flex flex-wrap items-center gap-1">
        {overlayLayout && appearance.navigation && <Button size="sm" variant="ghost" hint={t('cw.fit.hint')} onClick={() => binding?.chart.timeScale().fitContent()}>{t('cw.fit')}</Button>}
        <Button size="sm" variant="ghost" hint={t('cw.indicators.hint')} onClick={() => setIndicatorsOpen(true)}>{t('cw.indicators')}</Button>
        <Button size="icon-sm" variant="ghost" hint={t(historySize.undo ? 'cw.undo.hint' : 'cw.undoEmpty.hint')} aria-label={t('cw.undo')} disabled={!historySize.undo} onClick={() => history(true)}><Undo2 size={15} /></Button>
        <Button size="icon-sm" variant="ghost" hint={t(historySize.redo ? 'cw.redo.hint' : 'cw.redoEmpty.hint')} aria-label={t('cw.redo')} disabled={!historySize.redo} onClick={() => history(false)}><Redo2 size={15} /></Button>
        <Button size="icon-sm" variant="ghost" hint={t('cw.objects.hint')} aria-label={t('cw.objects')} onClick={() => setObjectsOpen(true)}><ListTree size={15} /></Button>
        <Button size="icon-sm" variant="ghost" hint={t('cw.settings.hint')} aria-label={t('cw.settings')} data-testid="workspace-settings" onClick={() => { useAnalysisPrefsStore.getState().beginPreview(); state.beginOverlayPreview(context.key); state.setPreview({ ...appearance }); setSettingsOpen(true); }}><Settings2 size={15} /></Button>
        <Button size="icon-sm" variant="ghost" hint={t(isFullscreen ? 'analysis.chart.fullscreen.exit.hint' : 'analysis.chart.fullscreen.hint')} aria-label={t(isFullscreen ? 'analysis.chart.fullscreen.exit' : 'analysis.chart.fullscreen')} onClick={() => { const target = root.current; if (!target) return; void (document.fullscreenElement ? document.exitFullscreen() : target.requestFullscreen()).catch(() => setError('cw.drawingError')); }}>{isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</Button>
      </div>
    </div>
    {(state.storageError || error) && <Alert tone="warning" title={t(state.storageError ? 'cw.storageError' : error ?? 'cw.drawingError')} />}
    <div className={overlayLayout ? 'contents' : 'flex min-w-0 flex-col sm:flex-row'}>
      <aside className={`${overlayLayout ? 'absolute left-0 top-[35%] z-20 max-w-12 rounded-r-lg' : ''} flex shrink-0 flex-wrap gap-1 border-b border-border bg-card p-1 sm:w-11 sm:flex-col sm:border-r sm:border-b-0`} aria-label={t('cw.tools')}>
        <Button className={overlayLayout ? '' : 'sm:hidden'} size="icon-sm" aria-label={t('cw.tools')} variant="ghost" hint={t('cw.tools.hint')} aria-expanded={toolsOpen} onClick={() => setToolsOpen(!toolsOpen)}><Pencil size={15} /></Button>
        <Button size="icon-sm" variant="ghost" hint={t('cw.selection.hint')} aria-label={t('cw.selection')} aria-pressed={!tool} onClick={() => arm(null)}><MousePointer2 size={15} /></Button>
        {state.favorites.filter(k => TOOLS.includes(k as DrawingKind)).slice(0, 8).map(k => <Button key={k} size="icon-sm" variant="ghost" hint={t('cw.placeTool.hint', { tool: t(toolKey(k as DrawingKind)), n: OVERLAY_SPECS[k as DrawingKind].pointCount })} aria-label={t(toolKey(k as DrawingKind))} aria-pressed={tool === k} onClick={() => arm(k as DrawingKind)}><Star size={13} /></Button>)}
        <Button size="icon-sm" variant="ghost" hint={t('cw.hideDrawings.hint')} aria-label={t('cw.hideDrawings')} aria-pressed={appearance.hideDrawings} onClick={() => saveAppearance({ ...appearance, hideDrawings: !appearance.hideDrawings })}><Eye size={15} /></Button>
      </aside>
      <div className={overlayLayout ? 'contents' : 'relative min-w-0 flex-1'}>
        <div className={`${toolVisibility} ${overlayLayout ? 'absolute bottom-32 left-12 right-20 z-30 max-h-[50dvh] overflow-y-auto rounded-lg' : ''} min-w-0 flex-wrap items-end gap-2 border-b border-border bg-card p-2`}>
          <InputField label={t('cw.tools')} hint={t('cw.tools.hint')} className="w-44 max-w-full"><select className={fieldClass} value={tool ?? ''} onChange={e => arm((e.target.value || null) as DrawingKind | null)}><option value="">{t('cw.selection')}</option>{TOOL_GROUPS.map(group => <optgroup key={group} label={t(`cw.group.${group}`)}>{TOOLS.filter(k => toolGroup(k) === group).map(k => <option key={k} value={k}>{t(toolKey(k))}</option>)}</optgroup>)}</select></InputField>
          <Choice name="cw.magnet" value={magnet} options={['off', 'weak', 'strong']} onChange={v => saveAppearance({ ...appearance, magnet: v })} />
          <Toggle name="cw.keepDrawing" checked={keepDrawing} onChange={v => saveAppearance({ ...appearance, keepDrawing: v })} />
          {tool && <Button size="icon-sm" hint={t('cw.favorite.hint')} aria-label={t('cw.favorite')} aria-pressed={state.favorites.includes(tool)} onClick={() => state.setFavorites(state.favorites.includes(tool) ? state.favorites.filter(v => v !== tool) : [...state.favorites, tool])}><Star size={14} /></Button>}
        </div>
        {(appearance.title || appearance.timeframe || (appearance.countdown && remaining !== null)) && <div style={statusStyle} className={`${overlayLayout ? 'absolute bottom-2 left-12 z-10 rounded bg-card' : ''} px-2 py-1 text-xs text-muted-foreground`}>{appearance.title ? context.symbol : ''}{appearance.timeframe ? ` ${TIMEFRAME_LABEL[timeframeSec] ?? fmt.number(timeframeSec)}` : ''}{appearance.countdown && remaining !== null ? ` · ${fmt.number(remaining, { maximumFractionDigits: 0 })}s` : ''}</div>}
        {children}
        {(appearance.names || appearance.params || appearance.values) && <div className={`${overlayLayout ? 'absolute right-20 bottom-2 z-10 max-w-[50%] rounded bg-card' : ''} flex flex-wrap gap-x-4 gap-y-1 px-2 py-1 font-mono text-[11px] text-muted-foreground`} style={statusStyle} data-testid="workspace-indicator-values">{lastValues.map(({ config: c, value }) => <span key={c.id} data-indicator-value={c.kind}>{appearance.names ? c.kind : ''}{appearance.params ? ` (${c.period}${c.kind === 'EWO' || c.kind === 'MACD' ? `/${c.slow}` : ''})` : ''}{appearance.values && c.values ? ` ${value === null ? '—' : fmt.number(value, { maximumFractionDigits: 5 })}` : ''}</span>)}</div>}
        {appearance.navigation && !overlayLayout && <div className="flex justify-center gap-1 py-1">{[-1, 1, 0].map(n => <Button key={n} size="sm" variant="ghost" hint={t(zoomHint(n))} onClick={() => { if (!binding) return; const scale = binding.chart.timeScale(), range = scale.getVisibleLogicalRange(); if (!n) scale.fitContent(); else if (range) { const mid = (range.from + range.to) / 2, half = (range.to - range.from) / (n > 0 ? 2.5 : 1.6); scale.setVisibleLogicalRange({ from: mid - half, to: mid + half }); } }}>{zoomLabel(n, t('cw.fit'))}</Button>)}</div>}
      </div>
    </div>
    <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label={t('cw.image')} data-tooltip-exempt onChange={e => { void changeImage(e.target.files?.[0]); e.target.value = ''; }} />
    {settingsOpen && <SettingsDialog initialAppearance={appearance} onApply={saveAppearance} defaultMargins={binding?.defaultMargins?.()} ohlcAvailable={!overlayLayout} countdownAvailable={countdownNow != null} onClose={() => setSettingsOpen(false)} overlayContent={overlays} rollbackOverlays={rollbackOverlays} commitOverlays={() => { state.finishOverlayPreview(true); useAnalysisPrefsStore.getState().finishPreview(true); }} />}
    {indicatorsOpen && <IndicatorDialog values={doc.indicators} timeframeSec={timeframeSec} onClose={() => setIndicatorsOpen(false)} onChange={indicators => saveDocument({ ...doc, indicators })} />}
    {objectsOpen && <Modal open title={t('cw.objects')} onClose={() => setObjectsOpen(false)} className="max-h-[85dvh] max-w-3xl overflow-y-auto">
      <div className="flex flex-wrap gap-2">{drawings.map(d => <Button key={d.id} size="sm" aria-pressed={selected.includes(d.id)} hint={t('cw.selection.hint')} onClick={() => { manager.current?.select([d.id]); }}>{d.name || t(toolKey(d.kind))}</Button>)}</div>
      {active && <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
        <div className="flex flex-wrap gap-2 sm:col-span-2"><Button size="sm" hint={t('cw.duplicate.hint')} onClick={() => { manager.current?.add({ ...active, id: crypto.randomUUID() }); checkpoint(); }}>{t('cw.duplicate')}</Button><Button size="sm" hint={t('cw.front.hint')} onClick={() => { manager.current?.bringToFront(active.id); checkpoint(); }}>{t('cw.front')}</Button><Button size="sm" hint={t('cw.back.hint')} onClick={() => { manager.current?.sendToBack(active.id); checkpoint(); }}>{t('cw.back')}</Button><Button size="sm" variant="danger" hint={t(active.locked ? 'cw.lockedRemove.hint' : 'cw.remove.hint')} disabled={active.locked} onClick={() => { manager.current?.remove(active.id); checkpoint(); }}>{t('cw.remove')}</Button>
        {active.kind === 'table' && <><Button size="sm" hint={t('cw.tableRow.hint')} onClick={() => { manager.current?.tableOp(active.id, 'insert-row'); checkpoint(); }}>{t('cw.tableRow')}</Button><Button size="sm" hint={t('cw.tableColumn.hint')} onClick={() => { manager.current?.tableOp(active.id, 'insert-column'); checkpoint(); }}>{t('cw.tableColumn')}</Button></>}</div>
      </div>}
    </Modal>}
    {editor && <Modal open onClose={() => { if (editor.cell) manager.current?.endTableEdit(); setEditor(null); }} title={t(editor.cell ? 'cw.cell' : 'cw.text')}><InputField label={t('cw.text')} hint={t('cw.text.hint')}><textarea className={fieldClass} value={editor.text} onChange={e => setEditor({ ...editor, text: e.target.value })} /></InputField><Button className="mt-3" variant="primary" hint={t('cw.apply.hint')} onClick={() => { if (editor.cell) { manager.current?.setTableCellText(editor.drawing.id, editor.cell, editor.text); manager.current?.endTableEdit(); } else manager.current?.update({ ...editor.drawing, text: editor.text }); checkpoint(); setEditor(null); }}>{t('cw.apply')}</Button></Modal>}
  </div>;
}
