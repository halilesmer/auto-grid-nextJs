'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import type { DrawingManager } from 'lightweight-charts-drawing';
import type { MouseEventParams, Time } from 'lightweight-charts';
import { ArrowDown, ArrowLeftRight, ArrowUp, Bell, ChevronDown, ChevronUp, Copy, Eye, EyeOff, FunctionSquare, Info, ListTree, Maximize2, Minimize2, MoreHorizontal, Plus, Settings2, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useFormat, useT } from '@/i18n';
import { lineMenuAllows, type LineMenuTrigger } from '@/lib/chart-workspace/lineMenu';
import type { Appearance } from '@/lib/chart-workspace/settings';
import { IndicatorLineMenu } from './IndicatorLineMenu';
import { useToolGrace } from './drawingPriority';
import { isOscillator, type Indicator, type Value } from '@/lib/chart-workspace/indicators';
import { lineTarget, nextSelection, type DrawingPriority } from '@/lib/chart-workspace/hover';
import { isSystemPane, type SystemPaneId } from '@/lib/chart-workspace/paneOrder';
import { PANES_CHANGED_EVENT, type ChartBinding, type IndicatorRenderer, type SystemPaneModel } from './runtime';

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
  /** Changes fields of one indicator (line menu: color, pattern, width) */
  update: (indicator: Indicator, change: Partial<Indicator>) => void;
  /** Eye of a system pane (RSI(7), Wave 5/35) */
  toggleSystemVisible: (id: SystemPaneId) => void;
  openSettings: (indicator: Indicator) => void;
  switchScale: (indicator: Indicator) => void;
  moveToPane: (indicator: Indicator, paneId: string | null) => void;
  openAlarm: (indicator: Indicator) => void;
  toggleFavorite: (indicator: Indicator) => void;
  copy: (indicator: Indicator) => void;
  openInfo: (indicator: Indicator, formula: boolean) => void;
  remove: (indicator: Indicator) => void;
}

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
  /** Setting „Çizgi menüsü“: which trigger may open the line menu */
  lineMenuMode: Appearance['lineMenu'];
  textStyle?: CSSProperties;
  actions: OscillatorActions;
  /** System oscillators of the switched-on layers; they share the pane model, the row and the pane buttons with the user oscillators */
  systemPanes?: readonly SystemPaneModel[];
  /** Panes from top to bottom (user pane ids and system ids) */
  paneOrder?: readonly string[];
}

interface Layout { tops: readonly number[]; paneOf: Readonly<Record<string, number | null>>; priceInset: number }
const NO_LAYOUT: Layout = { tops: [], paneOf: {}, priceInset: 0 };
const NO_SYSTEM: readonly SystemPaneModel[] = [];
/** Height of the chart's own OHLC line at the top of the price pane (not shown on the formation page), so the price legend sits below it. */
const OHLC_LINE_PX = 20;
const sameLayout = (a: Layout, b: Layout) => a.priceInset === b.priceInset && a.tops.length === b.tops.length && a.tops.every((top, i) => top === b.tops[i]) && Object.keys(b.paneOf).every(id => a.paneOf[id] === b.paneOf[id]);
/** Buttons stay hidden until the row or its stack gets the mouse or the keyboard focus; touch screens have no hover, so they always show. */
const REVEAL = 'opacity-0 transition-opacity has-[[aria-expanded=true]]:opacity-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:none)]:opacity-100';
const REVEAL_PANE = 'opacity-0 transition-opacity group-hover/stack:opacity-100 group-focus-within/stack:opacity-100 [@media(hover:none)]:opacity-100';

export function IndicatorLegend({ binding, renderer, manager, indicators, latest, names, favorites, sideOf, maximizedPaneId, alarmsAvailable, atLimit, overlayLayout, showNames, showParams, showValues, lineMenuMode, textStyle, actions, systemPanes = NO_SYSTEM, paneOrder }: Props) {
  const t = useT(), fmt = useFormat();
  const wrapper = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout>(NO_LAYOUT);
  const [hover, setHover] = useState<{ time: number | null; values: Map<string, Value> | null; pane: number | null; line: string | null }>({ time: null, values: null, pane: null, line: null });
  const [selected, setSelected] = useState<string | null>(null);
  const [lineMenu, setLineMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const closeLineMenu = useCallback(() => setLineMenu(null), []);
  const toolRecent = useToolGrace(binding?.host ?? null, () => manager.current?.tool() != null);
  const toolRecentRef = useRef(toolRecent);
  useEffect(() => { toolRecentRef.current = toolRecent; }, [toolRecent]);
  const oscillators = indicators.filter(isOscillator);
  // Every pane of the chart in its order. A pane hidden with the eye keeps its chart pane and its height (TradingView).
  const known = [...systemPanes.map(pane => pane.id as string), ...new Set(oscillators.map(item => item.paneId))];
  const paneIds = paneOrder ? [...paneOrder.filter(id => known.includes(id)), ...known.filter(id => !paneOrder.includes(id))] : known;
  const paneKey = `${indicators.map(item => `${item.id}${item.paneId}${item.visible}${item.paneCollapsed}`).join('|')}#${systemPanes.map(pane => `${pane.id}${pane.hidden}${pane.collapsed}`).join('|')}#${paneIds.join('|')}`;
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
    // Line menu (A7.4/A7.5): the line under the pointer comes from the last chart event; a drawing tool or a drawing under the mouse wins (priority)
    const open = (trigger: LineMenuTrigger, clientX: number, clientY: number, event?: Event) => {
      if (!lineMenuAllows(lineMenuMode, trigger) || toolRecentRef.current()) return;
      const current = latestParam, id = current ? ownerOf(current) : null;
      if (!id || lineTarget(id, priority()) !== id) return;
      event?.preventDefault();
      setLineMenu({ x: clientX, y: clientY, id });
    };
    const onContext = (event: MouseEvent) => open('context', event.clientX, event.clientY, event);
    const onDouble = (param: MouseEventParams<Time>) => {
      latestParam = param;
      // `param.point` is relative to the pane under the pointer; the viewport position comes from the DOM event (same as the trend menu)
      const source = param.sourceEvent;
      if (param.point && source) open('double', source.clientX, source.clientY);
    };
    binding.host.addEventListener('contextmenu', onContext);
    chart.subscribeDblClick(onDouble);
    chart.subscribeCrosshairMove(onMove);
    chart.subscribeClick(onClick);
    return () => {
      cancelAnimationFrame(frame);
      binding.host.removeEventListener('contextmenu', onContext);
      if (!binding.isDisposed()) { chart.unsubscribeCrosshairMove(onMove); chart.unsubscribeClick(onClick); chart.unsubscribeDblClick(onDouble); }
    };
  }, [binding, renderer, manager, lineMenuMode]);

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
    // Panes come and go (layers, eye, delete): the renderer says so, then the pane list and the observers are read again
    const changed = () => { cancelAnimationFrame(frame); requestAnimationFrame(measure); };
    binding.host.addEventListener(PANES_CHANGED_EVENT, changed);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); binding.host.removeEventListener(PANES_CHANGED_EVENT, changed); };
    // paneIds is derived from paneKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binding, renderer, latest, paneKey, maximizedPaneId, overlayLayout]);
  const systemOf = (paneId: string) => isSystemPane(paneId) ? systemPanes.find(pane => pane.id === paneId) : undefined;

  const valueOf = (indicator: Indicator): Value | undefined => {
    if (hover.values) return hover.values.get(indicator.id) ?? null;
    return latest.find(item => item.config.id === indicator.id)?.value;
  };
  const paneName = (paneId: string) => systemOf(paneId)?.label ?? indicators.filter(item => item.paneId === paneId).map(item => names.get(item.id)).join(' + ');

  /** The legend row of user and system oscillators: same frame, same eye, same delete button; only the text and the menu differ. */
  const rowShell = ({ key, attributes, hot, text, label, visible, drawn, emphasis, onToggleVisible, settings, remove, removeLabel, removeHint, menu }: {
    key: string; attributes: Record<string, string | boolean | undefined>; hot: boolean; text: ReactNode; label: string; visible: boolean; drawn: boolean; emphasis?: 'selected' | 'hover';
    onToggleVisible: () => void; settings?: () => void; remove: () => void; removeLabel: string; removeHint: string; menu: ReactNode;
  }) => <div key={key} {...attributes} data-visible={visible} data-drawn={drawn} data-emphasis={emphasis}
    className={`group/row pointer-events-auto flex min-w-0 items-center gap-0.5 rounded px-1 py-0.5 transition-colors hover:bg-muted/80 focus-within:bg-muted/80 ${emphasis || hot ? 'bg-muted/80' : ''}`}>
    {text}
    <span className={`flex items-center ${emphasis === 'selected' ? 'opacity-100' : REVEAL}`}>
      <Button size="icon-xs" variant="ghost" aria-pressed={visible} hint={t('cw.legend.visibility.hint')} aria-label={t('cw.legend.visibility', { indicator: label })} onClick={onToggleVisible}>{visible ? <Eye size={14} /> : <EyeOff size={14} />}</Button>
      {settings && <Button size="icon-xs" variant="ghost" hint={t('cw.legend.settings.hint')} aria-label={t('cw.legend.settings', { indicator: label })} onClick={settings}><Settings2 size={14} /></Button>}
      <Button size="icon-xs" variant="ghost" hint={removeHint} aria-label={removeLabel} onClick={remove}><Trash2 size={14} /></Button>
      {menu}
    </span>
  </div>;

  const row = (indicator: Indicator, paneIndex: number) => {
    const label = names.get(indicator.id) ?? indicator.kind, favorite = favorites.includes(indicator.kind), side = sideOf(indicator) === 'left' ? 'right' : 'left';
    let emphasis: 'selected' | 'hover' | undefined;
    if (indicator.id === selectedId) emphasis = 'selected'; else if (indicator.id === hover.line) emphasis = 'hover';
    const members = indicators.filter(item => item.paneId === indicator.paneId);
    const value = valueOf(indicator), drawn = latest.some(item => item.config.id === indicator.id);
    // The formation page does not scroll and its chart ends at the bottom edge, so the menu opens upwards below the price pane there.
    const menuPanelClass = overlayLayout && paneIndex > 0 ? 'bottom-full top-auto mb-2 mt-0 max-h-[70dvh] w-64 overflow-y-auto' : 'w-64';
    return rowShell({
      key: indicator.id, attributes: { 'data-indicator-row': indicator.kind }, hot: hover.pane === paneIndex, label, visible: indicator.visible, drawn, emphasis,
      text: <span data-indicator-value={indicator.kind} style={textStyle} className={`min-w-0 truncate rounded px-1 font-mono text-[11px] ${drawn ? 'text-muted-foreground' : `text-muted-foreground/60 ${indicator.visible ? 'line-through' : ''}`}`}>
        {showNames ? indicator.kind : ''}{showParams && drawn ? ` (${indicator.period}${indicator.kind === 'EWO' || indicator.kind === 'MACD' ? `/${indicator.slow}` : ''})` : ''}{showValues && drawn && indicator.values && value !== undefined ? ` ${value === null ? '—' : fmt.number(value, { maximumFractionDigits: 5 })}` : ''}
      </span>,
      onToggleVisible: () => actions.toggleVisible(indicator), settings: () => actions.openSettings(indicator), remove: () => actions.remove(indicator),
      removeLabel: t('cw.legend.remove', { indicator: label }), removeHint: t('cw.legend.remove.hint'),
      menu: <DropdownMenu label={t('cw.indicatorActions', { indicator: label })} hint={t('cw.indicatorActions.hint')} icon={<MoreHorizontal size={14} />} size="icon-xs" variant="ghost" panelClassName={menuPanelClass}>
          <DropdownMenuGroup>
            <DropdownMenuItem icon={indicator.visible ? <EyeOff size={15} /> : <Eye size={15} />} hint={t(indicator.visible ? 'cw.indicatorHide.hint' : 'cw.indicatorShow.hint')} onSelect={() => actions.toggleVisible(indicator)}>{t(indicator.visible ? 'cw.indicatorHide' : 'cw.indicatorShow', { indicator: label })}</DropdownMenuItem>
            <DropdownMenuItem icon={<Settings2 size={15} />} hint={t('cw.indicatorSettings.hint')} onSelect={() => actions.openSettings(indicator)}>{t('cw.indicatorSettings')}</DropdownMenuItem>
            {isOscillator(indicator) && <DropdownMenuItem icon={<ArrowLeftRight size={15} />} hint={t('cw.indicatorScale.hint')} onSelect={() => actions.switchScale(indicator)}>{t('cw.indicatorScale', { side: t(side === 'left' ? 'cw.option.left' : 'cw.option.right') })}</DropdownMenuItem>}
            {isOscillator(indicator) && paneIds.filter(id => id !== indicator.paneId && !isSystemPane(id)).map(id => <DropdownMenuItem key={id} icon={<ListTree size={15} />} hint={t('cw.indicatorMovePane.hint')} onSelect={() => actions.moveToPane(indicator, id)}>{t('cw.indicatorMovePane', { pane: paneName(id) })}</DropdownMenuItem>)}
            {isOscillator(indicator) && members.length > 1 && <DropdownMenuItem icon={<Plus size={15} />} hint={t('cw.indicatorNewPane.hint')} onSelect={() => actions.moveToPane(indicator, null)}>{t('cw.indicatorNewPane')}</DropdownMenuItem>}
            {alarmsAvailable && isOscillator(indicator) && <DropdownMenuItem icon={<Bell size={15} />} hint={t('cw.indicatorAlarm.hint')} onSelect={() => actions.openAlarm(indicator)}>{t('cw.indicatorAlarm')}</DropdownMenuItem>}
            <DropdownMenuItem icon={<Star size={15} />} hint={t('cw.indicatorFavorite.hint')} onSelect={() => actions.toggleFavorite(indicator)}>{t(favorite ? 'cw.indicatorUnfavorite' : 'cw.indicatorFavorite')}</DropdownMenuItem>
            <DropdownMenuItem icon={<Copy size={15} />} hint={t(atLimit ? 'cw.indicatorCopyLimit.hint' : 'cw.indicatorCopy.hint')} disabled={atLimit} onSelect={() => actions.copy(indicator)}>{t('cw.indicatorCopy')}</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuGroup>
            <DropdownMenuItem icon={<Info size={15} />} hint={t('cw.indicatorInfo.hint')} onSelect={() => actions.openInfo(indicator, false)}>{t('cw.indicatorInfo')}</DropdownMenuItem>
            <DropdownMenuItem icon={<FunctionSquare size={15} />} hint={t('cw.indicatorSource.hint')} onSelect={() => actions.openInfo(indicator, true)}>{t('cw.indicatorSource')}</DropdownMenuItem>
            <DropdownMenuItem icon={<Trash2 size={15} />} hint={t('cw.remove.hint')} tone="danger" onSelect={() => actions.remove(indicator)}>{t('cw.remove')}</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenu>,
    });
  };

  // No settings gear: the 7 and the 5/35 belong to the formation rules
  const systemRow = (pane: SystemPaneModel, paneIndex: number) => {
    const menuPanelClass = overlayLayout && paneIndex > 0 ? 'bottom-full top-auto mb-2 mt-0 max-h-[70dvh] w-64 overflow-y-auto' : 'w-64';
    return rowShell({
      key: pane.id, attributes: { 'data-system-row': pane.id }, hot: hover.pane === paneIndex, label: pane.label, visible: !pane.hidden, drawn: !pane.hidden,
      text: <span style={textStyle} className={`min-w-0 truncate rounded px-1 font-mono text-[11px] ${pane.hidden ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}>{pane.label}</span>,
      onToggleVisible: () => actions.toggleSystemVisible(pane.id), remove: () => actions.removePane(pane.id),
      removeLabel: t('cw.legend.hideLayer', { layer: pane.label }), removeHint: t('cw.legend.hideLayer.hint'),
      menu: <DropdownMenu label={t('cw.indicatorActions', { indicator: pane.label })} hint={t('cw.indicatorActions.hint')} icon={<MoreHorizontal size={14} />} size="icon-xs" variant="ghost" panelClassName={menuPanelClass}>
        <DropdownMenuGroup>
          <DropdownMenuItem icon={pane.hidden ? <Eye size={15} /> : <EyeOff size={15} />} hint={t(pane.hidden ? 'cw.indicatorShow.hint' : 'cw.indicatorHide.hint')} onSelect={() => actions.toggleSystemVisible(pane.id)}>{t(pane.hidden ? 'cw.indicatorShow' : 'cw.indicatorHide', { indicator: pane.label })}</DropdownMenuItem>
          <DropdownMenuItem icon={<Trash2 size={15} />} hint={t('cw.legend.hideLayer.hint')} tone="danger" onSelect={() => actions.removePane(pane.id)}>{t('cw.legend.hideLayer', { layer: pane.label })}</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenu>,
    });
  };

  const paneControls = (paneId: string, paneIndex: number, hot: boolean) => {
    const system = systemOf(paneId), members = indicators.filter(item => item.paneId === paneId), name = paneName(paneId), collapsed = system ? system.collapsed : members[0].paneCollapsed, maximized = maximizedPaneId === paneId;
    const order = paneIds.indexOf(paneId), first = order === 0, last = order === paneIds.length - 1;
    // No key: the controls are a single child next to the row, whose key is the pane id (same key = React duplicate-key warning)
    return <div className={`pointer-events-auto flex items-center rounded ${hot ? 'opacity-100' : REVEAL_PANE}`} data-oscillator-pane={name} data-pane-index={paneIndex}>
      {!first && <Button size="icon-xs" variant="ghost" data-pane-action="up" hint={t('cw.paneUp.hint')} aria-label={t('cw.paneUp', { indicator: name })} onClick={() => actions.movePane(paneId, -1)}><ArrowUp size={14} /></Button>}
      {!last && <Button size="icon-xs" variant="ghost" data-pane-action="down" hint={t('cw.paneDown.hint')} aria-label={t('cw.paneDown', { indicator: name })} onClick={() => actions.movePane(paneId, 1)}><ArrowDown size={14} /></Button>}
      <Button size="icon-xs" variant="ghost" data-pane-action="remove" hint={t('cw.paneRemove.hint')} aria-label={t('cw.paneRemoveNamed', { indicator: name })} onClick={() => actions.removePane(paneId)}><Trash2 size={14} /></Button>
      <Button size="icon-xs" variant="ghost" data-pane-action="collapse" hint={t(collapsed ? 'cw.paneExpand.hint' : 'cw.paneCollapse.hint')} aria-label={t(collapsed ? 'cw.paneExpand' : 'cw.paneCollapse', { indicator: name })} aria-expanded={!collapsed} onClick={() => actions.toggleCollapsed(paneId)}>{collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Button>
      <Button size="icon-xs" variant="ghost" data-pane-action="maximize" hint={t(maximized ? 'cw.paneRestore.hint' : 'cw.paneMaximize.hint')} aria-label={t(maximized ? 'cw.paneRestore' : 'cw.paneMaximize', { indicator: name })} aria-pressed={maximized} onClick={() => actions.toggleMaximized(paneId)}>{maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</Button>
    </div>;
  };

  // A pane group without a drawn series (all hidden) has no chart pane; its rows sit in the price pane so they can be shown again.
  const stacks = new Map<number, { price: Indicator[]; panes: string[] }>();
  const stackAt = (index: number) => { if (!stacks.has(index)) stacks.set(index, { price: [], panes: [] }); return stacks.get(index)!; };
  stackAt(0).price.push(...indicators.filter(item => !isOscillator(item)));
  for (const paneId of paneIds) stackAt(layout.paneOf[paneId] ?? 0).panes.push(paneId);

  const menuIndicator = lineMenu ? indicators.find(item => item.id === lineMenu.id) : undefined;
  return <div ref={wrapper} data-testid="oscillator-controls" className="pointer-events-none absolute left-0 top-0 z-[51] h-px w-px">
    {lineMenu && menuIndicator && <IndicatorLineMenu x={lineMenu.x} y={lineMenu.y} indicator={menuIndicator} label={names.get(menuIndicator.id) ?? menuIndicator.kind} actions={actions} alarmsAvailable={alarmsAvailable} atLimit={atLimit} favorite={favorites.includes(menuIndicator.kind)} onClose={closeLineMenu} />}
    <div data-testid="workspace-indicator-values" className="contents">
      {[...stacks.entries()].sort(([a], [b]) => a - b).map(([paneIndex, stack]) => <div key={paneIndex} style={{ top: (layout.tops[paneIndex] ?? 0) + 4 + (paneIndex === 0 ? layout.priceInset : 0) }}
        className={`group/stack absolute ${overlayLayout ? 'left-14' : 'left-1'} flex w-max max-w-[min(32rem,calc(100vw-6rem))] flex-col items-start gap-0.5`}>
        {stack.price.map(indicator => row(indicator, paneIndex))}
        {stack.panes.map(paneId => <div key={paneId} className="flex min-w-0 max-w-full flex-wrap items-center gap-x-1">
          {systemOf(paneId) ? systemRow(systemOf(paneId)!, paneIndex) : indicators.filter(item => item.paneId === paneId).map(indicator => row(indicator, paneIndex))}
          {paneControls(paneId, paneIndex, hover.pane === paneIndex)}
        </div>)}
      </div>)}
    </div>
  </div>;
}
