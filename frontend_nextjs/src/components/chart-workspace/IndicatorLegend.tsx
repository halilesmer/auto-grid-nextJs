'use client';

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { DrawingManager } from 'lightweight-charts-drawing';
import type { MouseEventParams, Time } from 'lightweight-charts';
import { ArrowDown, ArrowLeftRight, ArrowUp, Bell, ChevronDown, ChevronUp, Copy, Eye, EyeOff, FunctionSquare, Info, ListTree, Maximize2, Minimize2, MoreHorizontal, Plus, Settings2, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useFormat, useT } from '@/i18n';
import { isOscillator, type Indicator, type Value } from '@/lib/chart-workspace/indicators';
import { lineTarget, nextSelection, type DrawingPriority } from '@/lib/chart-workspace/hover';
import type { ChartBinding, IndicatorRenderer } from './runtime';

/** Separate names for several instances of one kind, so buttons and alarms stay distinguishable. */
export function indicatorNames(indicators: readonly Indicator[]) {
  const seen = new Map<string, number>(), names = new Map<string, string>();
  for (const indicator of indicators) {
    const total = indicators.filter(item => item.kind === indicator.kind).length, number = (seen.get(indicator.kind) ?? 0) + 1;
    seen.set(indicator.kind, number);
    names.set(indicator.id, total > 1 ? `${indicator.kind} ${number}` : indicator.kind);
  }
  return names;
}

export interface OscillatorActions {
  movePane: (paneId: string, offset: -1 | 1) => void;
  toggleCollapsed: (paneId: string) => void;
  toggleMaximized: (paneId: string) => void;
  removePane: (paneId: string) => void;
  toggleVisible: (indicator: Indicator) => void;
  openSettings: (indicator: Indicator) => void;
  switchScale: (indicator: Indicator) => void;
  moveToPane: (indicator: Indicator, paneId: string | null) => void;
  openAlarm: (indicator: Indicator) => void;
  toggleFavorite: (indicator: Indicator) => void;
  copy: (indicator: Indicator) => void;
  openInfo: (indicator: Indicator, formula: boolean) => void;
  remove: (indicator: Indicator) => void;
}

/** A pane the chart draws itself (system RSI(7), Wave 5/35); its legend row hides the layer. */
export interface SystemPane { id: string; label: string; paneIndex: number }

interface Props {
  binding: ChartBinding | null;
  renderer: RefObject<IndicatorRenderer | null>;
  manager: RefObject<DrawingManager | null>;
  /** Every indicator of the chart, hidden ones included, so a hidden one can be shown again. */
  indicators: Indicator[];
  /** Latest value of each drawn indicator; the legend shows it while the crosshair is off the chart. */
  latest: { config: Indicator; value: Value }[];
  names: ReadonlyMap<string, string>;
  favorites: readonly string[];
  /** Effective axis of each indicator. */
  sideOf: (indicator: Indicator) => 'left' | 'right';
  maximizedPaneId: string | null;
  alarmsAvailable: boolean;
  atLimit: boolean;
  overlayLayout: boolean;
  showNames: boolean;
  showParams: boolean;
  showValues: boolean;
  textStyle?: CSSProperties;
  actions: OscillatorActions;
  systemPanes?: readonly SystemPane[];
  onHideSystemPane?: (id: string) => void;
}

interface Layout { tops: readonly number[]; paneOf: Readonly<Record<string, number | null>>; priceInset: number }
const NO_LAYOUT: Layout = { tops: [], paneOf: {}, priceInset: 0 };
/** Height of the chart's own OHLC line at the top of the price pane (not shown on the formation page), so the price legend sits below it. */
const OHLC_LINE_PX = 20;
const sameLayout = (a: Layout, b: Layout) => a.priceInset === b.priceInset && a.tops.length === b.tops.length && a.tops.every((top, i) => top === b.tops[i]) && Object.keys(b.paneOf).every(id => a.paneOf[id] === b.paneOf[id]);
/** Buttons stay hidden until the row or its stack gets the mouse or the keyboard focus; touch screens have no hover, so they always show. */
const REVEAL = 'opacity-0 transition-opacity has-[[aria-expanded=true]]:opacity-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:none)]:opacity-100';
const REVEAL_PANE = 'opacity-0 transition-opacity group-hover/stack:opacity-100 group-focus-within/stack:opacity-100 [@media(hover:none)]:opacity-100';

export function IndicatorLegend({ binding, renderer, manager, indicators, latest, names, favorites, sideOf, maximizedPaneId, alarmsAvailable, atLimit, overlayLayout, showNames, showParams, showValues, textStyle, actions, systemPanes = [], onHideSystemPane }: Props) {
  const t = useT(), fmt = useFormat();
  const wrapper = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout>(NO_LAYOUT);
  const [hover, setHover] = useState<{ time: number | null; values: Map<string, Value> | null; pane: number | null; line: string | null }>({ time: null, values: null, pane: null, line: null });
  const [selected, setSelected] = useState<string | null>(null);
  const oscillators = indicators.filter(isOscillator), paneIds = [...new Set(oscillators.map(item => item.paneId))];
  const paneKey = indicators.map(item => `${item.id}${item.paneId}${item.visible}${item.paneCollapsed}`).join('|');
  const selectedId = indicators.some(item => item.id === selected) ? selected : null;

  // The crosshair and clicks come from the chart; the legend keeps its own state so a mouse move does not render the whole workspace.
  useEffect(() => {
    if (!binding || binding.isDisposed()) return;
    const { chart } = binding;
    const priority = (): DrawingPriority => ({ toolActive: manager.current?.tool() != null, drawingHovered: manager.current?.hoveredId() != null });
    const ownerOf = (param: MouseEventParams<Time>) => {
      // Price lines (RSI bands, zero line) also report their series, so only the series itself counts.
      const info = param.hoveredInfo;
      let series = param.hoveredSeries;
      if (info) series = info.objectKind === 'series' ? info.series : undefined;
      return renderer.current?.ownerOf(series) ?? null;
    };
    let frame = 0, latestParam: MouseEventParams<Time> | null = null;
    const onMove = (param: MouseEventParams<Time>) => {
      latestParam = param;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const current = latestParam; if (!current) return;
        const time = current.point && current.time !== undefined ? Number(current.time) : null;
        const pane = current.point ? current.paneIndex ?? null : null, line = current.point ? lineTarget(ownerOf(current), priority()) : null;
        setHover(prev => prev.time === time && prev.pane === pane && prev.line === line ? prev : { time, pane, line, values: time === null ? null : renderer.current?.valuesAt(time) ?? null });
      });
    };
    const onClick = (param: MouseEventParams<Time>) => setSelected(prev => nextSelection(prev, ownerOf(param), priority()));
    chart.subscribeCrosshairMove(onMove);
    chart.subscribeClick(onClick);
    return () => {
      cancelAnimationFrame(frame);
      if (!binding.isDisposed()) { chart.unsubscribeCrosshairMove(onMove); chart.unsubscribeClick(onClick); }
    };
  }, [binding, renderer, manager]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setHover(prev => prev.time === null ? prev : { ...prev, values: renderer.current?.valuesAt(prev.time) ?? null }));
    return () => cancelAnimationFrame(frame);
  }, [renderer, latest]);
  useEffect(() => {
    renderer.current?.emphasize(hover.line, selectedId);
  }, [renderer, binding, hover.line, selectedId, latest]);
  useEffect(() => {
    if (!binding || binding.isDisposed() || !hover.line) return;
    const host = binding.host, before = host.style.cursor;
    host.style.setProperty('cursor', 'pointer');
    return () => { host.style.setProperty('cursor', before); };
  }, [binding, hover.line, latest]); // the appearance effect resets the cursor on every data update
  useEffect(() => {
    if (!selectedId) return;
    const clear = (event: KeyboardEvent) => { if (event.key === 'Escape' && !(event.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) setSelected(null); };
    document.addEventListener('keydown', clear);
    return () => document.removeEventListener('keydown', clear);
  }, [selectedId]);

  // Each legend sits at the top of its chart pane, so it needs the pane positions. They change with the pane layout and with every resize.
  useEffect(() => {
    if (!binding || binding.isDisposed()) return;
    const measure = () => {
      const area = wrapper.current;
      if (!area || binding.isDisposed()) return;
      const origin = area.getBoundingClientRect().top;
      // On the formation page the chart runs under the page's toolbars; its default margin is the part they cover.
      const priceHeight = binding.chart.panes()[0]?.getHTMLElement()?.getBoundingClientRect().height ?? 0;
      const next: Layout = {
        priceInset: overlayLayout ? Math.round((binding.defaultMargins?.().top ?? 0) * priceHeight) : OHLC_LINE_PX,
        tops: binding.chart.panes().map(pane => (pane.getHTMLElement()?.getBoundingClientRect().top ?? origin) - origin),
        paneOf: Object.fromEntries(paneIds.map(id => [id, renderer.current?.paneIndexOf(id) ?? null])),
      };
      setLayout(prev => sameLayout(prev, next) ? prev : next);
    };
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(binding.host);
    for (const pane of binding.chart.panes()) { const element = pane.getHTMLElement(); if (element) observer.observe(element); }
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
    // paneIds is derived from paneKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binding, renderer, latest, paneKey, maximizedPaneId, overlayLayout]);

  const valueOf = (indicator: Indicator): Value | undefined => {
    if (hover.values) return hover.values.get(indicator.id) ?? null;
    return latest.find(item => item.config.id === indicator.id)?.value;
  };
  const paneName = (paneId: string) => indicators.filter(item => item.paneId === paneId).map(item => names.get(item.id)).join(' + ');

  const row = (indicator: Indicator, paneIndex: number) => {
    const label = names.get(indicator.id) ?? indicator.kind, favorite = favorites.includes(indicator.kind), side = sideOf(indicator) === 'left' ? 'right' : 'left';
    let emphasis: 'selected' | 'hover' | undefined;
    if (indicator.id === selectedId) emphasis = 'selected'; else if (indicator.id === hover.line) emphasis = 'hover';
    const members = indicators.filter(item => item.paneId === indicator.paneId);
    const value = valueOf(indicator), drawn = latest.some(item => item.config.id === indicator.id);
    // The formation page does not scroll and its chart ends at the bottom edge, so the menu opens upwards below the price pane there.
    const menuPanelClass = overlayLayout && paneIndex > 0 ? 'bottom-full top-auto mb-2 mt-0 max-h-[70dvh] w-64 overflow-y-auto' : 'w-64';
    return <div key={indicator.id} data-indicator-row={indicator.kind} data-visible={indicator.visible} data-drawn={drawn} data-emphasis={emphasis}
      className={`group/row pointer-events-auto flex min-w-0 items-center gap-0.5 rounded px-1 py-0.5 transition-colors hover:bg-muted/80 focus-within:bg-muted/80 ${emphasis || hover.pane === paneIndex ? 'bg-muted/80' : ''}`}>
      <span data-indicator-value={indicator.kind} style={textStyle} className={`min-w-0 truncate rounded px-1 font-mono text-[11px] ${drawn ? 'text-muted-foreground' : 'text-muted-foreground/60 line-through'}`}>
        {showNames ? indicator.kind : ''}{showParams && drawn ? ` (${indicator.period}${indicator.kind === 'EWO' || indicator.kind === 'MACD' ? `/${indicator.slow}` : ''})` : ''}{showValues && drawn && indicator.values && value !== undefined ? ` ${value === null ? '—' : fmt.number(value, { maximumFractionDigits: 5 })}` : ''}
      </span>
      <span className={`flex items-center ${emphasis === 'selected' ? 'opacity-100' : REVEAL}`}>
        <Button size="icon-xs" variant="ghost" aria-pressed={indicator.visible} hint={t('cw.legend.visibility.hint')} aria-label={t('cw.legend.visibility', { indicator: label })} onClick={() => actions.toggleVisible(indicator)}>{indicator.visible ? <Eye size={14} /> : <EyeOff size={14} />}</Button>
        <Button size="icon-xs" variant="ghost" hint={t('cw.legend.settings.hint')} aria-label={t('cw.legend.settings', { indicator: label })} onClick={() => actions.openSettings(indicator)}><Settings2 size={14} /></Button>
        <Button size="icon-xs" variant="ghost" hint={t('cw.legend.remove.hint')} aria-label={t('cw.legend.remove', { indicator: label })} onClick={() => actions.remove(indicator)}><X size={14} /></Button>
        <DropdownMenu label={t('cw.indicatorActions', { indicator: label })} hint={t('cw.indicatorActions.hint')} icon={<MoreHorizontal size={14} />} size="icon-xs" variant="ghost" panelClassName={menuPanelClass}>
          <DropdownMenuGroup>
            <DropdownMenuItem icon={indicator.visible ? <EyeOff size={15} /> : <Eye size={15} />} hint={t(indicator.visible ? 'cw.indicatorHide.hint' : 'cw.indicatorShow.hint')} onSelect={() => actions.toggleVisible(indicator)}>{t(indicator.visible ? 'cw.indicatorHide' : 'cw.indicatorShow', { indicator: label })}</DropdownMenuItem>
            <DropdownMenuItem icon={<Settings2 size={15} />} hint={t('cw.indicatorSettings.hint')} onSelect={() => actions.openSettings(indicator)}>{t('cw.indicatorSettings')}</DropdownMenuItem>
            {isOscillator(indicator) && <DropdownMenuItem icon={<ArrowLeftRight size={15} />} hint={t('cw.indicatorScale.hint')} onSelect={() => actions.switchScale(indicator)}>{t('cw.indicatorScale', { side: t(side === 'left' ? 'cw.option.left' : 'cw.option.right') })}</DropdownMenuItem>}
            {isOscillator(indicator) && paneIds.filter(id => id !== indicator.paneId).map(id => <DropdownMenuItem key={id} icon={<ListTree size={15} />} hint={t('cw.indicatorMovePane.hint')} onSelect={() => actions.moveToPane(indicator, id)}>{t('cw.indicatorMovePane', { pane: paneName(id) })}</DropdownMenuItem>)}
            {isOscillator(indicator) && members.length > 1 && <DropdownMenuItem icon={<Plus size={15} />} hint={t('cw.indicatorNewPane.hint')} onSelect={() => actions.moveToPane(indicator, null)}>{t('cw.indicatorNewPane')}</DropdownMenuItem>}
            {alarmsAvailable && isOscillator(indicator) && <DropdownMenuItem icon={<Bell size={15} />} hint={t('cw.indicatorAlarm.hint')} onSelect={() => actions.openAlarm(indicator)}>{t('cw.indicatorAlarm')}</DropdownMenuItem>}
            <DropdownMenuItem icon={<Star size={15} />} hint={t('cw.indicatorFavorite.hint')} onSelect={() => actions.toggleFavorite(indicator)}>{t(favorite ? 'cw.indicatorUnfavorite' : 'cw.indicatorFavorite')}</DropdownMenuItem>
            <DropdownMenuItem icon={<Copy size={15} />} hint={t(atLimit ? 'cw.indicatorCopyLimit.hint' : 'cw.indicatorCopy.hint')} disabled={atLimit} onSelect={() => actions.copy(indicator)}>{t('cw.indicatorCopy')}</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuGroup>
            <DropdownMenuItem icon={<Info size={15} />} hint={t('cw.indicatorInfo.hint')} onSelect={() => actions.openInfo(indicator, false)}>{t('cw.indicatorInfo')}</DropdownMenuItem>
            <DropdownMenuItem icon={<FunctionSquare size={15} />} hint={t('cw.indicatorSource.hint')} onSelect={() => actions.openInfo(indicator, true)}>{t('cw.indicatorSource')}</DropdownMenuItem>
            <DropdownMenuItem icon={<X size={15} />} hint={t('cw.remove.hint')} tone="danger" onSelect={() => actions.remove(indicator)}>{t('cw.remove')}</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenu>
      </span>
    </div>;
  };

  const paneControls = (paneId: string, paneIndex: number, hot: boolean) => {
    const members = indicators.filter(item => item.paneId === paneId), name = paneName(paneId), collapsed = members[0].paneCollapsed, maximized = maximizedPaneId === paneId;
    const order = paneIds.indexOf(paneId);
    return <div key={paneId} className={`pointer-events-auto flex items-center rounded ${hot ? 'opacity-100' : REVEAL_PANE}`} data-oscillator-pane={name} data-pane-index={paneIndex}>
      <Button size="icon-xs" variant="ghost" hint={t(order === 0 ? 'cw.paneFirst.hint' : 'cw.paneUp.hint')} aria-label={t('cw.paneUp', { indicator: name })} disabled={order === 0} onClick={() => actions.movePane(paneId, -1)}><ArrowUp size={14} /></Button>
      <Button size="icon-xs" variant="ghost" hint={t(order === paneIds.length - 1 ? 'cw.paneLast.hint' : 'cw.paneDown.hint')} aria-label={t('cw.paneDown', { indicator: name })} disabled={order === paneIds.length - 1} onClick={() => actions.movePane(paneId, 1)}><ArrowDown size={14} /></Button>
      <Button size="icon-xs" variant="ghost" hint={t(collapsed ? 'cw.paneExpand.hint' : 'cw.paneCollapse.hint')} aria-label={t(collapsed ? 'cw.paneExpand' : 'cw.paneCollapse', { indicator: name })} aria-expanded={!collapsed} onClick={() => actions.toggleCollapsed(paneId)}>{collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Button>
      <Button size="icon-xs" variant="ghost" hint={t(maximized ? 'cw.paneRestore.hint' : 'cw.paneMaximize.hint')} aria-label={t(maximized ? 'cw.paneRestore' : 'cw.paneMaximize', { indicator: name })} aria-pressed={maximized} onClick={() => actions.toggleMaximized(paneId)}>{maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</Button>
      <Button size="icon-xs" variant="ghost" hint={t('cw.paneRemove.hint')} aria-label={t('cw.paneRemoveNamed', { indicator: name })} onClick={() => actions.removePane(paneId)}><X size={14} /></Button>
    </div>;
  };

  const systemRow = (pane: SystemPane) => <div key={pane.id} data-system-row={pane.id}
    className={`group/row pointer-events-auto flex min-w-0 items-center gap-0.5 rounded px-1 py-0.5 transition-colors hover:bg-muted/80 focus-within:bg-muted/80 ${hover.pane === pane.paneIndex ? 'bg-muted/80' : ''}`}>
    <span style={textStyle} className="min-w-0 truncate rounded px-1 font-mono text-[11px] text-muted-foreground">{pane.label}</span>
    <span className={`flex items-center ${REVEAL}`}>
      <Button size="icon-xs" variant="ghost" hint={t('cw.legend.hideLayer.hint')} aria-label={t('cw.legend.hideLayer', { layer: pane.label })} onClick={() => onHideSystemPane?.(pane.id)}><X size={14} /></Button>
    </span>
  </div>;

  // A pane group without a drawn indicator (all hidden) has no chart pane; its rows sit in the price pane so they can be shown again.
  const stacks = new Map<number, { price: Indicator[]; panes: string[] }>();
  const stackAt = (index: number) => { if (!stacks.has(index)) stacks.set(index, { price: [], panes: [] }); return stacks.get(index)!; };
  stackAt(0).price.push(...indicators.filter(item => !isOscillator(item)));
  for (const paneId of paneIds) stackAt(layout.paneOf[paneId] ?? 0).panes.push(paneId);
  for (const pane of systemPanes) stackAt(pane.paneIndex);

  return <div ref={wrapper} data-testid="oscillator-controls" className="pointer-events-none absolute left-0 top-0 z-[51] h-px w-px">
    <div data-testid="workspace-indicator-values" className="contents">
      {[...stacks.entries()].sort(([a], [b]) => a - b).map(([paneIndex, stack]) => <div key={paneIndex} style={{ top: (layout.tops[paneIndex] ?? 0) + 4 + (paneIndex === 0 ? layout.priceInset : 0) }}
        className={`group/stack absolute ${overlayLayout ? 'left-14' : 'left-1'} flex w-max max-w-[min(32rem,calc(100vw-6rem))] flex-col items-start gap-0.5`}>
        {systemPanes.filter(pane => pane.paneIndex === paneIndex).map(systemRow)}
        {stack.price.map(indicator => row(indicator, paneIndex))}
        {stack.panes.map(paneId => <div key={paneId} className="flex min-w-0 max-w-full flex-wrap items-center gap-x-1">
          {indicators.filter(item => item.paneId === paneId).map(indicator => row(indicator, paneIndex))}
          {paneControls(paneId, paneIndex, hover.pane === paneIndex)}
        </div>)}
      </div>)}
    </div>
  </div>;
}
