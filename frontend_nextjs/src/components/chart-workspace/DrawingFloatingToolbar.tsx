'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Baseline, GripVertical, LayoutGrid, Lock, LockOpen, MoreHorizontal, PaintBucket, PenLine, Settings2, Trash2, Type } from 'lucide-react';
import type { Drawing, DrawingManager } from 'lightweight-charts-drawing';
import { Button } from '@/components/ui/button';
import { useT, type MessageKey } from '@/i18n';
import { barButtons, barFamily, firstPlace, keepAlpha, LOCK_DISABLED, nudge, PHONE_BAR_PX, placeSaved, savedRatio, type BarButton, type Rect } from '@/lib/chart-workspace/floatingBar';
import { FIB_KIND, normalizeFibStyle, presetFibStyle } from '@/lib/chart-workspace/fibStyle';
import { cn } from '@/lib/utils';
import { useChartWorkspaceStore } from '@/store/useChartWorkspaceStore';
import { OHLC_LINE_PX } from './IndicatorLegend';
import type { ChartBinding } from './runtime';

const PALETTE = ['#ffffff', '#d1d4dc', '#9598a1', '#434651', '#000000', '#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#089981', '#00bcd4', '#2962ff', '#673ab7', '#9c27b0', '#e91e63', '#faa1a4', '#ffcc80', '#a5d6a7', '#90bff9', '#ce93d8'];
const WIDTHS = [1, 2, 3, 4], SIZES = [10, 12, 14, 16, 20, 24, 32], LINES = ['solid', 'dashed', 'dotted'] as const;
const COLOR_LABEL = { fib: 'color.fib', text: 'color.text', line: 'color', shape: 'color', multi: 'color' } as const;
const k = (key: string) => `fbar.${key}` as MessageKey;

/** Renk şeridi: tek renk ya da Fibonacci'nin görünen seviye renkleri. */
function stripColors(ds: readonly Drawing[], fill: boolean): string[] {
  const out: string[] = [];
  for (const d of ds) {
    const list = d.kind === FIB_KIND && !fill ? (d.style.levels ?? []).filter(l => l.visible !== false).map(l => l.color) : [fill ? d.style.backgroundColor || d.style.color : d.style.color];
    for (const c of list) { const v = (c ?? '#808080').slice(0, 7).toLowerCase(); if (!out.includes(v)) out.push(v); }
  }
  return out.length ? out.slice(0, 8) : ['#808080'];
}
const gradient = (colors: readonly string[]) => colors.length === 1 ? colors[0] : `linear-gradient(90deg,${colors.map((c, i) => `${c} ${i / colors.length * 100}% ${(i + 1) / colors.length * 100}%`).join(',')})`;

export interface DrawingFloatingToolbarProps {
  drawings: readonly Drawing[];
  /** Refs: yalnız efekt ve olay işleyicilerinde okunur */
  manager: RefObject<DrawingManager | null>;
  binding: ChartBinding;
  root: RefObject<HTMLDivElement | null>;
  overlayLayout: boolean;
  /** Çalışma alanı kilidi (araç çubuğundaki "Bütün çizimleri kilitle") */
  allLocked: boolean;
  /** Çizim sürüklenirken gizli (A4.13.5) */
  hidden: boolean;
  /** Her değişiklikten sonra tek geri alma adımı */
  onChange: () => void;
  onRemove: () => void;
  onSettings: (drawing: Drawing) => void;
  onMore: (at: { x: number; y: number }) => void;
}

/** Seçili çizimin yüzen araç çubuğu (plan 1110-A4.13, UI-29). Düğme listesi türe göre (floatingBar.ts). */
export function DrawingFloatingToolbar({ drawings, manager, binding, root: rootRef, overlayLayout, allLocked, hidden, onChange, onRemove, onSettings, onMore }: DrawingFloatingToolbarProps) {
  const t = useT();
  const bar = useRef<HTMLDivElement>(null);
  const saved = useChartWorkspaceStore(s => s.floatingBar);
  const userTemplates = useChartWorkspaceStore(s => s.drawingTemplates[FIB_KIND]);
  const [tick, setTick] = useState(0);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState<{ id: BarButton; left: number } | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number; width: number; phone: boolean } | null>(null);
  const templates = useMemo(() => Object.keys(userTemplates ?? {}).sort((a, b) => a.localeCompare(b, 'tr')), [userTemplates]);
  const family = barFamily(drawings.map(d => d.kind));
  const buttons = barButtons(family);
  const first = drawings[0];
  const frozen = allLocked || drawings.some(d => d.locked);
  const frozenHint = allLocked ? t(k('allLocked')) : t(k('locked'));
  const idKey = drawings.map(d => d.id).join('|');

  useEffect(() => {
    const observer = new ResizeObserver(() => setTick(n => n + 1));
    observer.observe(binding.host); if (rootRef.current) observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, [binding, rootRef]);

  // Yer: sürüklenen/kaydedilmiş oran, yoksa ilk yer (A4.13.2); grafik, legend ya da seçim değişince yeniden hesaplanır
  useLayoutEffect(() => {
    const el = bar.current, root = rootRef.current; if (!el || !root || binding.isDisposed()) return;
    const rr = root.getBoundingClientRect(), hr = binding.host.getBoundingClientRect();
    const ox = hr.left - rr.left, oy = hr.top - rr.top;
    const phone = hr.width < PHONE_BAR_PX;
    const size = { width: el.offsetWidth, height: el.offsetHeight };
    let next: { left: number; top: number; width: number; phone: boolean };
    if (phone) next = { left: ox, top: oy + hr.height - size.height, width: hr.width, phone };
    else {
      const leftScale = binding.chart.priceScale('left'), rightScale = binding.chart.priceScale('right');
      const area = { width: hr.width, height: hr.height, left: Math.round(leftScale.options().visible ? leftScale.width() : 0), right: Math.round(rightScale.options().visible ? rightScale.width() : 0), top: 0, bottom: 28 };
      const ratio = drag ?? saved;
      let p = ratio ? placeSaved(ratio, size, area) : null;
      if (!p) {
        const rel = (r: DOMRect): Rect => ({ left: r.left - hr.left, top: r.top - hr.top, right: r.right - hr.left, bottom: r.bottom - hr.top });
        const pane = binding.chart.panes()[0]?.getHTMLElement()?.getBoundingClientRect();
        const obstacles: Rect[] = [];
        if (!overlayLayout) obstacles.push({ left: 0, top: 0, right: 300, bottom: OHLC_LINE_PX });
        root.querySelectorAll<HTMLElement>('[data-indicator-row]').forEach(row => { const r = row.getBoundingClientRect(); if (pane && r.top < pane.bottom) obstacles.push(rel(r)); });
        root.ownerDocument.querySelectorAll<HTMLElement>('[data-dock-pkg][data-zone="free"]').forEach(pkg => obstacles.push(rel(pkg.getBoundingClientRect())));
        p = firstPlace(area, size, obstacles);
      }
      next = { left: ox + p.left, top: oy + p.top, width: 0, phone };
    }
    setPlace(prev => prev && prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.phone === next.phone ? prev : next);
  }, [binding, rootRef, overlayLayout, saved, drag, tick, idKey, family, hidden]);

  // Esc: önce açık kutu, sonra seçim. Kutunun dışına tık kutuyu kapatır.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if ((e.target as Element | null)?.closest('input, textarea, select, [contenteditable]') || document.querySelector('[role="dialog"][aria-modal="true"], [data-testid="drawing-context-menu"]')) return;
      if (open) setOpen(null); else manager.current?.select([]);
    };
    const down = (e: PointerEvent) => { if (open && !bar.current?.contains(e.target as Node)) setOpen(null); };
    document.addEventListener('keydown', key); document.addEventListener('pointerdown', down, true);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', down, true); };
  }, [open, manager]);
  useEffect(() => { const f = requestAnimationFrame(() => setOpen(null)); return () => cancelAnimationFrame(f); }, [idKey]);

  const patch = (change: (d: Drawing) => Drawing) => {
    const m = manager.current; if (!m) return;
    for (const d of drawings) m.update(change(m.get(d.id) ?? d));
    onChange(); setOpen(null);
  };
  const setColor = (c: string, fill = false) => patch(d => {
    if (fill) return { ...d, style: { ...d.style, backgroundColor: keepAlpha(d.style.backgroundColor || d.style.color, c) } };
    return { ...d, style: { ...d.style, color: keepAlpha(d.style.color, c), ...(d.style.levels ? { levels: d.style.levels.map(l => ({ ...l, color: keepAlpha(l.color, c) })) } : {}) } };
  });
  const toggleLock = () => { const all = drawings.every(d => d.locked); patch(d => ({ ...d, locked: !all })); };
  const startDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const el = bar.current; if (!el || place?.phone || e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget; handle.setPointerCapture(e.pointerId);
    const hr = binding.host.getBoundingClientRect(), br = el.getBoundingClientRect(), dx = e.clientX - br.left, dy = e.clientY - br.top;
    const at = (ev: PointerEvent) => savedRatio(Math.max(0, Math.min(hr.width - br.width, ev.clientX - hr.left - dx)), Math.max(0, Math.min(hr.height - br.height, ev.clientY - hr.top - dy)), hr);
    let last = at(e.nativeEvent);
    const move = (ev: PointerEvent) => { last = at(ev); setDrag(last); };
    const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); setDrag(null); useChartWorkspaceStore.getState().setFloatingBar(last); };
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
  };
  const handleKey = (e: ReactKeyboardEvent) => {
    const el = bar.current; if (!el || place?.phone) return;
    const hr = binding.host.getBoundingClientRect(), br = el.getBoundingClientRect();
    const next = nudge(saved ?? savedRatio(br.left - hr.left, br.top - hr.top, hr), e.key, e.shiftKey);
    if (!next) return;
    e.preventDefault(); useChartWorkspaceStore.getState().setFloatingBar(next);
  };

  const widthOf = first?.style.width ?? 1;
  const colorLabel = COLOR_LABEL[family];
  const disabledFor = (id: BarButton) => frozen && LOCK_DISABLED.includes(id);
  const hintFor = (id: BarButton, base: string) => disabledFor(id) ? frozenHint : base;
  const icon = (node: ReactNode, colors: string[]) => <span className="grid justify-items-center gap-0.5">{node}<i className="block h-[3px] w-[18px] rounded-sm" style={{ background: gradient(colors) }} data-testid="fbar-strip" /></span>;
  const size = place?.phone ? 'icon' as const : 'icon-sm' as const;
  const base = 'rounded-md text-foreground';
  const wide = 'w-auto gap-1 px-2 text-xs tabular-nums';
  const opener = (id: BarButton) => (e: ReactMouseEvent<HTMLButtonElement>) => { const left = e.currentTarget.parentElement?.offsetLeft ?? 0; setOpen(o => o?.id === id ? null : { id, left }); };

  const render = (id: BarButton): ReactNode => {
    const menu = { 'aria-haspopup': 'menu' as const, 'aria-expanded': open?.id === id, disabled: disabledFor(id), onClick: opener(id) };
    switch (id) {
      case 'template': return <Button key={id} size={size} variant="ghost" className={base} data-testid="fbar-template" aria-label={t(k('template'))} hint={hintFor(id, t(k('template.hint')))} {...menu}><LayoutGrid size={16} /></Button>;
      case 'color': return <Button key={id} size={size} variant="ghost" className={base} data-testid="fbar-color" aria-label={t(k(colorLabel))} hint={hintFor(id, t(k(`${colorLabel}.hint`)))} {...menu}>{icon(family === 'text' ? <Baseline size={16} /> : <PenLine size={16} />, stripColors(drawings, false))}</Button>;
      case 'fill': return <Button key={id} size={size} variant="ghost" className={base} data-testid="fbar-fill" aria-label={t(k('fill'))} hint={hintFor(id, t(k('fill.hint')))} {...menu}>{icon(<PaintBucket size={16} />, stripColors(drawings, true))}</Button>;
      case 'width': return <Button key={id} size={size} variant="ghost" className={cn(base, wide)} data-testid="fbar-width" aria-label={t(k('width'))} hint={hintFor(id, t(k(family === 'fib' ? 'width.fib.hint' : 'width.hint')))} {...menu}>{widthOf}px</Button>;
      case 'style': return <Button key={id} size={size} variant="ghost" className={cn(base, wide)} data-testid="fbar-style" aria-label={t(k('style'))} hint={hintFor(id, t(k('style.hint')))} {...menu}>{t(k(`style.${first?.style.lineStyle ?? 'solid'}`))}</Button>;
      case 'size': return <Button key={id} size={size} variant="ghost" className={cn(base, wide)} data-testid="fbar-size" aria-label={t(k('size'))} hint={hintFor(id, t(k('size.hint')))} {...menu}><Type size={14} />{first?.style.fontSize ?? 14}</Button>;
      case 'settings': return <Button key={id} size={size} variant="ghost" className={base} data-testid="fbar-settings" aria-label={t(k('settings'))} hint={t(k(family === 'fib' ? 'settings.fib.hint' : 'settings.other.hint'))} onClick={() => first && onSettings(first)}><Settings2 size={16} /></Button>;
      case 'lock': { const all = drawings.length > 0 && drawings.every(d => d.locked); return <Button key={id} size={size} variant="ghost" className={cn(base, all && 'text-primary')} data-testid="fbar-lock" aria-pressed={all} aria-label={t(k(all ? 'unlock' : 'lock'))} hint={allLocked ? frozenHint : t(k(all ? 'unlock.hint' : 'lock.hint'))} disabled={allLocked} onClick={toggleLock}>{all ? <Lock size={16} /> : <LockOpen size={16} />}</Button>; }
      case 'remove': return <Button key={id} size={size} variant="ghost" className={cn(base, 'hover:text-danger')} data-testid="fbar-remove" aria-label={t(k('remove'))} hint={hintFor(id, t(k('remove.hint')))} disabled={disabledFor(id)} onClick={onRemove}><Trash2 size={16} /></Button>;
      default: return <Button key={id} size={size} variant="ghost" className={base} data-testid="fbar-more" aria-haspopup="menu" aria-label={t(k('more'))} hint={t(k('more.hint'))} onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onMore({ x: r.left, y: r.bottom + 4 }); }}><MoreHorizontal size={16} /></Button>;
    }
  };

  const applyTemplate = (style: ReturnType<typeof presetFibStyle>) => patch(d => ({ ...d, style: { ...d.style, ...style } }));
  const pop = (items: ReactNode) => <div role="menu" data-testid={`fbar-pop-${open?.id}`} style={place?.phone ? undefined : { left: open?.left }}
    className={cn('absolute z-10 rounded-xl border border-border bg-popover p-2 shadow-2xl', place?.phone ? 'inset-x-1 bottom-full mb-1' : 'top-full mt-1')}>{items}</div>;
  const list = (children: ReactNode) => <div className="flex min-w-36 flex-col gap-0.5">{children}</div>;
  const item = (key: string | number, label: string, hint: string, pressed: boolean | undefined, testId: string, run: () => void) => <Button key={key} size="sm" variant="ghost" className="justify-start" aria-pressed={pressed} data-testid={testId} hint={hint} onClick={run}>{label}</Button>;
  const popup = (): ReactNode => {
    if (!open) return null;
    if (open.id === 'color' || open.id === 'fill') return pop(<div className="grid grid-cols-10 gap-1">{PALETTE.map(c => <Button key={c} size="icon-xs" variant="ghost" className="size-5 rounded border border-border p-0" style={{ background: c }} data-testid="fbar-swatch" aria-label={t(k('swatch'), { color: c })} hint={t(k('swatch.hint'), { color: c })} onClick={() => setColor(c, open.id === 'fill')} />)}</div>);
    if (open.id === 'width') return pop(list(WIDTHS.map(n => item(n, t(k('width.option'), { n }), t(k('width.option.hint'), { n }), n === widthOf, `fbar-width-${n}`, () => patch(d => ({ ...d, style: { ...d.style, width: n } }))))));
    if (open.id === 'style') return pop(list(LINES.map(s => item(s, t(k(`style.${s}`)), t(k(`style.${s}.hint`)), first?.style.lineStyle === s, `fbar-style-${s}`, () => patch(d => ({ ...d, style: { ...d.style, lineStyle: s } }))))));
    if (open.id === 'size') return pop(list(SIZES.map(n => item(n, t(k('size.option'), { n }), t(k('size.option.hint'), { n }), n === (first?.style.fontSize ?? 14), `fbar-size-${n}`, () => patch(d => ({ ...d, style: { ...d.style, fontSize: n } }))))));
    if (open.id === 'template') return pop(list(<>
      {item('preset', t('fib.presetName'), t(k('template.preset.hint')), undefined, 'fbar-template-preset', () => applyTemplate(presetFibStyle()))}
      {templates.map(n => item(n, n, t(k('template.user.hint')), undefined, 'fbar-template-user', () => applyTemplate(normalizeFibStyle(userTemplates?.[n]))))}
    </>));
    return null;
  };

  if (!first) return null;
  return <div ref={bar} role="toolbar" aria-label={t(k('label'))} data-testid="drawing-floating-toolbar" data-phone={place?.phone ? 'true' : 'false'} data-multi={family === 'multi'}
    style={{ left: place?.left ?? 0, top: place?.top ?? 0, width: place?.phone ? place.width : undefined, visibility: place && !hidden ? 'visible' : 'hidden', pointerEvents: hidden ? 'none' : undefined }}
    className={cn('absolute z-[55] flex items-center gap-0.5 border border-border bg-card p-0.5 shadow-lg', place?.phone ? 'justify-between rounded-none border-x-0 border-b-0 shadow-none' : 'rounded-xl')}
    onPointerDown={e => e.stopPropagation()}>
    {!place?.phone && <Button size="icon-sm" variant="ghost" className="w-5 cursor-grab touch-none rounded-md px-0 active:cursor-grabbing" data-testid="fbar-handle" aria-label={t(k('handle'))} hint={t(k('handle.hint'))}
      onPointerDown={startDrag} onDoubleClick={() => useChartWorkspaceStore.getState().setFloatingBar(null)} onKeyDown={handleKey}><GripVertical size={14} /></Button>}
    {buttons.map(id => render(id))}
    {popup()}
  </div>;
}
