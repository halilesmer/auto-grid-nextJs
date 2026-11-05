'use client';

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownToLine, ArrowUpToLine, GripVertical, Move, RotateCcw } from 'lucide-react';
import { DropdownMenu, DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useT, type MessageKey } from '@/i18n';
import { cn } from '@/lib/utils';
import { isAutoLayout, moveGroup, nudgeStep, placeFree, placementZone, toRatio, TOOLBAR_GROUPS, type Box, type FreeArea, type GroupPlacement, type ToolbarGroupId, type ToolbarZone } from '@/lib/chart-workspace/toolbar';
import { useChartWorkspaceStore } from '@/store/useChartWorkspaceStore';

/*
 * Taşınabilir araç grupları (UI-16, 1105-A5.8, journal 2026-11-05-toolbar-groups).
 * İki şerit her zaman aynı yerde durur; "oto" gruplar kabın genişliğine göre birine girer:
 * 71rem ve üstü üst şerit (sayfa başlığının sağı), altı alt şerit (grafiğin altındaki yüzen kart), yani bugünkü gibi.
 * Şeritlerin yeri CSS kap sorgusudur; hangi grubun hangi şeritte olduğunu kabın ölçülen genişliği belirler.
 * Serbest grup kabın içinde mutlak konumdadır; sığmazsa çizimde alt şeride düşer, kayıt değişmez.
 */
const WIDE_REM = 71;
/** Serbest grubun grafik alanındaki payları (px): solda 52 px çizim çubuğu + 8 px, üst ve altta 8 px; sağ pay fiyat ekseni (5rem, alt şerit gibi). */
const FREE_INSET = { left: 60, top: 8, bottom: 8 };
/** Sürükleme eşiği (px); parmakla dokunuşta titreme menüyü engellemesin diye daha büyük. */
const DRAG_THRESHOLD = { mouse: 5, touch: 10 };
const DROP_LABEL: Record<ToolbarZone, MessageKey> = { top: 'cw.tbDropTop', bottom: 'cw.tbDropBottom', free: 'cw.tbDropFree' };
const GROUP_LABEL: Record<ToolbarGroupId, MessageKey> = { view: 'cw.tbGroup.view', indicators: 'cw.tbGroup.indicators', edit: 'cw.tbGroup.edit', window: 'cw.tbGroup.window' };

interface Props {
  host: RefObject<HTMLDivElement | null>;
  symbol: string;
  /** Her grubun düğmeleri; null olan grup gösterilmez (ör. Görünüm, gezinme kapalı ve Formasyon modu değilken). */
  groups: Record<ToolbarGroupId, ReactNode | null>;
  /** Taşıma yalnız grafik sayfasının yüzen düzeninde (overlayLayout); değilse eski düz çubuk. */
  movable: boolean;
  /** Alt şerit (grupları varken): ChartWorkspace yüksekliğini grafiğin altından ayırır (--workspace-card). */
  bottomRef: (el: HTMLDivElement | null) => void;
}
interface Drag { id: ToolbarGroupId; from: ToolbarZone; touch: boolean; pointerId: number; startX: number; startY: number; offX: number; offY: number; width: number; height: number; x: number; y: number; active: boolean; target: ToolbarZone | null }

export function ToolbarDock({ host, symbol, groups, movable, bottomRef }: Props) {
  const t = useT();
  const layout = useChartWorkspaceStore(s => s.toolbarLayout), setLayout = useChartWorkspaceStore(s => s.setToolbarLayout);
  const [wide, setWide] = useState(false);
  const [hostBox, setHostBox] = useState<Box>({ width: 0, height: 0 });
  const [rem, setRem] = useState(16);
  // lg ve üstünde sayfa başlığı grafiğin üstüne biner (ChartPage, --chart-top); serbest grup ve dar kaptaki üst şerit onun altında başlar
  const [headerInset, setHeaderInset] = useState(0);
  const [freeSizes, setFreeSizes] = useState<Partial<Record<ToolbarGroupId, Box>>>({});
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null), suppressClick = useRef(false), focusAfter = useRef<ToolbarGroupId | null>(null);
  const topStrip = useRef<HTMLDivElement>(null), bottomStrip = useRef<HTMLDivElement>(null);

  // Kabın genişliği (oto yer) ve ölçüsü (serbest yer); kap sorgusu ile aynı eşik, aynı kap (formation-main)
  // Kabın ref'i bu efektten sonra bağlanır (üst eleman); kabı kendi işaret elemanımızdan buluruz
  const anchor = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = anchor.current?.parentElement;
    if (!movable || !el) return;
    const page = el.closest<HTMLElement>('[data-testid="formation-main"]') ?? el;
    const measure = () => {
      const r = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setRem(r);
      setWide(page.getBoundingClientRect().width >= WIDE_REM * r);
      setHeaderInset(window.matchMedia('(min-width: 64rem)').matches ? parseFloat(getComputedStyle(page).getPropertyValue('--chart-top')) || 0 : 0);
      setHostBox(prev => (prev.width === el.clientWidth && prev.height === el.clientHeight ? prev : { width: el.clientWidth, height: el.clientHeight }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(page); observer.observe(el);
    return () => observer.disconnect();
  }, [movable]);

  const area: FreeArea = { ...hostBox, ...FREE_INSET, top: FREE_INSET.top + headerInset, right: 5 * rem };
  const resolve = (id: ToolbarGroupId): { zone: ToolbarZone; pos?: { left: number; top: number } } => {
    const zone = placementZone(layout, id, wide), p = layout[id];
    if (zone !== 'free' || p?.zone !== 'free') return { zone };
    const pos = placeFree(p, freeSizes[id] ?? { width: 1, height: 1 }, area);
    return pos ? { zone, pos } : { zone: 'bottom' };
  };
  const visible = TOOLBAR_GROUPS.filter(id => groups[id] != null);
  const placed = new Map(visible.map(id => [id, resolve(id)]));
  const inZone = (zone: ToolbarZone) => visible.filter(id => placed.get(id)!.zone === zone);
  const hasBottom = inZone('bottom').length > 0;
  // Sabit kimlikli ref: her çizimde yeni bir işlev ChartWorkspace'in durumunu boşuna değiştirirdi
  const bottomStripRef = useCallback((el: HTMLDivElement | null) => { bottomStrip.current = el; bottomRef(hasBottom ? el : null); }, [hasBottom, bottomRef]);

  // Serbest grubun kendi (satır kırmayan) ölçüsü; yalnız serbestken ölçülür, böylece düşme kararı salınmaz
  const sizeObserver = useRef<ResizeObserver | null>(null);
  const observeFree = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    sizeObserver.current ??= new ResizeObserver(entries => setFreeSizes(prev => {
      let next = prev;
      for (const entry of entries) {
        const node = entry.target as HTMLElement, id = node.dataset.toolbarGroup as ToolbarGroupId, box = { width: node.offsetWidth, height: node.offsetHeight };
        if (prev[id]?.width !== box.width || prev[id]?.height !== box.height) next = { ...next, [id]: box };
      }
      return next;
    }));
    const observer = sizeObserver.current;
    observer.observe(el);
    return () => observer.unobserve(el);
  }, []);
  useEffect(() => () => sizeObserver.current?.disconnect(), []);
  // Menüden ya da klavyeyle taşınan grup yeni yerinde odağı geri alır
  useEffect(() => {
    const id = focusAfter.current;
    if (!id) return;
    focusAfter.current = null;
    host.current?.querySelector<HTMLElement>(`[data-toolbar-handle="${id}"]`)?.focus();
  });

  const move = (id: ToolbarGroupId, placement: GroupPlacement) => { focusAfter.current = id; setLayout(moveGroup(layout, id, placement)); };
  const reset = () => setLayout({});

  const zoneAt = (x: number, y: number): ToolbarZone | null => {
    const inside = (el: HTMLElement | null) => { if (!el) return false; const r = el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
    if (inside(topStrip.current)) return 'top';
    if (inside(bottomStrip.current)) return 'bottom';
    return inside(host.current) ? 'free' : null;
  };
  const finish = (commit: boolean) => {
    const d = dragRef.current;
    dragRef.current = null; setDrag(null);
    if (!d?.active) return;
    suppressClick.current = true;
    if (!commit || !d.target) return;
    // Aynı şeride bırakmak bir şey değiştirmez; oto grup otoda kalır
    if (d.target !== 'free') { if (d.target !== d.from) move(d.id, { zone: d.target }); return; }
    const r = host.current?.getBoundingClientRect();
    if (!r) return;
    // Bırakılan sol üst köşe; kenarlara yaslanmış hâli saklanır, böylece kayıt görünen yerle aynıdır
    const pos = placeFree(toRatio(d.x - d.offX - r.left, d.y - d.offY - r.top, hostBox), { width: d.width, height: d.height }, area);
    move(d.id, pos ? { zone: 'free', ...toRatio(pos.left, pos.top, hostBox) } : { zone: 'bottom' });
  };
  useEffect(() => {
    if (!drag?.active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const handlers = (id: ToolbarGroupId, zone: ToolbarZone, pos?: { left: number; top: number }) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      // Önceki sürüklemenin bastırması tıklamasız kaldıysa (grup yer değiştirdi, pointercancel) sıfırlanır
      suppressClick.current = false;
      const group = e.currentTarget.closest<HTMLElement>('[data-toolbar-group]')!.getBoundingClientRect();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { id, from: zone, touch: e.pointerType !== 'mouse', pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, offX: e.clientX - group.left, offY: e.clientY - group.top, width: group.width, height: group.height, x: e.clientX, y: e.clientY, active: false, target: null };
    },
    onPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      if (!d.active && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD[d.touch ? 'touch' : 'mouse']) return;
      const next = { ...d, active: true, x: e.clientX, y: e.clientY, target: zoneAt(e.clientX, e.clientY) };
      dragRef.current = next; setDrag(next);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => { if (dragRef.current?.pointerId === e.pointerId) finish(true); },
    onPointerCancel: () => finish(false),
    // Tutamaç sürükleme sırasında yeniden kurulursa (genişlik değişti) bırakma gelmez: sürükleme iptal
    onLostPointerCapture: () => finish(false),
    // Sürüklemenin ardından gelen tıklama menüyü açmasın
    onClickCapture: (e: ReactMouseEvent) => { if (suppressClick.current) { suppressClick.current = false; e.stopPropagation(); e.preventDefault(); } },
    onKeyDown: (e: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (zone !== 'free' || !pos || !e.key.startsWith('Arrow') || e.altKey || e.ctrlKey || e.metaKey || e.currentTarget.getAttribute('aria-expanded') === 'true') return;
      e.preventDefault();
      const step = nudgeStep(e.shiftKey), dx = { ArrowLeft: -1, ArrowRight: 1 }[e.key] ?? 0, dy = { ArrowUp: -1, ArrowDown: 1 }[e.key] ?? 0;
      const next = placeFree(toRatio(pos.left + dx * step * hostBox.width, pos.top + dy * step * hostBox.height, hostBox), freeSizes[id] ?? { width: 1, height: 1 }, area);
      if (next) move(id, { zone: 'free', ...toRatio(next.left, next.top, hostBox) });
    },
  });

  const auto = isAutoLayout(layout);
  const renderGroup = (id: ToolbarGroupId) => {
    const { zone, pos } = placed.get(id)!, name = t(GROUP_LABEL[id]);
    // Menüler grubun yerine göre açılır: alt şeritte ve grafiğin alt yarısında yukarı (LayersMenu, TrendToggle: group-data-[menu=up]/tb)
    const menuUp = zone === 'bottom' || (zone === 'free' && (pos?.top ?? 0) > hostBox.height / 2);
    const item = (target: 'top' | 'bottom' | 'free', icon: ReactNode, label: MessageKey, testId: string) => (
      <DropdownMenuItem icon={icon} hint={t(zone === target ? 'cw.tbHere.hint' : `${label}.hint` as MessageKey)} disabled={zone === target} data-testid={testId}
        onSelect={() => move(id, target === 'free' ? { zone: 'free', x: 0.12, y: 0.12 * (TOOLBAR_GROUPS.indexOf(id) + 1) } : { zone: target })}>{t(label)}</DropdownMenuItem>
    );
    return (
      <div key={id} ref={zone === 'free' ? observeFree : undefined} role="group" aria-label={name} data-toolbar-group={id} data-zone={zone} data-menu={menuUp ? 'up' : 'down'}
        style={pos ? { left: pos.left, top: pos.top } : undefined}
        className={cn('group/tb flex min-w-0 max-w-full flex-wrap items-center gap-0.5 rounded-[0.875rem] border border-border bg-card p-px',
          zone === 'free' && 'absolute z-[53] w-max max-w-none flex-nowrap shadow-lg',
          zone === 'top' && 'shadow-md @min-[71rem]/formation-main:shadow-none',
          drag?.active && drag.id === id && 'opacity-40')}>
        <DropdownMenu label={t('cw.tbHandle', { group: name })} hint={t('cw.tbHandle.hint')} variant="ghost" size="icon-xs"
          side={menuUp ? 'top' : 'bottom'} align="left" panelClassName="w-60"
          icon={<GripVertical size={14} aria-hidden="true" />}
          triggerProps={{ className: 'w-4 cursor-grab touch-none active:cursor-grabbing', 'data-toolbar-handle': id, 'data-testid': `toolbar-handle-${id}`, ...handlers(id, zone, pos) }}>
          <DropdownMenuGroup>
            {item('top', <ArrowUpToLine className="size-4" aria-hidden="true" />, 'cw.tbMoveTop', 'toolbar-move-top')}
            {item('bottom', <ArrowDownToLine className="size-4" aria-hidden="true" />, 'cw.tbMoveBottom', 'toolbar-move-bottom')}
            {item('free', <Move className="size-4" aria-hidden="true" />, 'cw.tbMoveFree', 'toolbar-move-free')}
          </DropdownMenuGroup>
          <DropdownMenuGroup>
            <DropdownMenuItem icon={<RotateCcw className="size-4" aria-hidden="true" />} hint={t(auto ? 'cw.tbReset.auto.hint' : 'cw.tbReset.hint')} disabled={auto} data-testid="toolbar-reset" onSelect={() => { focusAfter.current = id; reset(); }}>{t('cw.tbReset')}</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenu>
        {groups[id]}
      </div>
    );
  };

  if (!movable) return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-2 py-1.5" data-testid="workspace-toolbar">
      <span className="min-w-0 truncate text-xs font-medium">{symbol}</span>
      <div className="flex flex-wrap items-center gap-1">{TOOLBAR_GROUPS.map(id => <Fragment key={id}>{groups[id]}</Fragment>)}</div>
    </div>
  );

  const dragging = Boolean(drag?.active);
  const top = inZone('top'), bottom = inZone('bottom'), free = inZone('free');
  const autoZone = wide ? 'top' : 'bottom';
  const dropMark = (zone: ToolbarZone) => dragging && cn('outline-2 outline-dashed -outline-offset-2 outline-primary/50', drag?.target === zone && 'bg-primary/10');
  const placeholder = (label: MessageKey) => <span className="flex h-7 min-w-32 items-center justify-center rounded-full px-3 text-[11px] text-muted-foreground">{t(label)}</span>;
  return <>
    <span ref={anchor} hidden />
    {(top.length > 0 || dragging) && (
      // Dar kapta grafiğin üstünde sağa yaslı; 71rem ve üstünde sayfa başlığının sağında (eski kartın yeri, FormationToolbar ve ChartTopBar yer ayırır)
      <div ref={topStrip} data-strip="top" data-testid={autoZone === 'top' ? 'workspace-toolbar' : 'toolbar-strip-top'}
        className={cn('pointer-events-none absolute left-[60px] right-20 top-2 z-[53] lg:@max-[71rem]/formation-main:top-[calc(var(--chart-top,0px)+0.5rem)] flex min-w-0 flex-wrap items-center justify-end gap-1 rounded-lg',
          '@min-[71rem]/formation-main:left-auto @min-[71rem]/formation-main:right-1 @min-[71rem]/formation-main:top-px @min-[71rem]/formation-main:z-[60] @min-[71rem]/formation-main:h-[37px] @min-[71rem]/formation-main:rounded-none',
          '[&>*]:pointer-events-auto', dropMark('top'))}>
        {top.map(renderGroup)}
        {!top.length && placeholder(DROP_LABEL.top)}
      </div>
    )}
    {(bottom.length > 0 || dragging) && (
      <div ref={bottomStripRef} data-strip="bottom" data-testid={autoZone === 'bottom' ? 'workspace-toolbar' : 'toolbar-strip-bottom'}
        className={cn('absolute bottom-8 left-[60px] right-20 z-[53] flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border-b border-border bg-card px-2 py-1.5 shadow-lg', dropMark('bottom'))}>
        <span className="min-w-0 truncate text-xs font-medium @min-[71rem]/formation-main:hidden">{symbol}</span>
        <div className="flex min-w-0 flex-wrap items-center gap-1">{bottom.map(renderGroup)}{!bottom.length && placeholder(DROP_LABEL.bottom)}</div>
      </div>
    )}
    {free.map(renderGroup)}
    {dragging && drag?.target === 'free' && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-[52px] right-0 z-[52] rounded-lg bg-primary/5 outline-2 outline-dashed -outline-offset-4 outline-primary/50" />}
    {dragging && drag && createPortal(
      // Sürüklenen grubun yeri: boyutu grubunki, üstünde ad ve hedef (durum yalnız renkle değil).
      // body'ye portal: formation-main bir kap (container-type) ve fixed çocukların konumunu kendine göre alır
      <div aria-hidden="true" style={{ left: drag.x - drag.offX, top: drag.y - drag.offY, minWidth: drag.width, height: drag.height }}
        className="pointer-events-none fixed z-[80] flex items-center gap-1 rounded-full border border-primary/60 bg-card px-2 text-[11px] font-medium text-foreground shadow-xl">
        <GripVertical size={14} aria-hidden="true" className="text-muted-foreground" />
        <span className="whitespace-nowrap">{t(GROUP_LABEL[drag.id])}{drag.target ? ` → ${t(DROP_LABEL[drag.target])}` : ''}</span>
      </div>, document.body,
    )}
  </>;
}
