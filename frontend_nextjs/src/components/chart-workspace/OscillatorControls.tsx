'use client';

import { ArrowDown, ArrowLeftRight, ArrowUp, Bell, ChevronDown, ChevronUp, Copy, Eye, EyeOff, FunctionSquare, Info, ListTree, Maximize2, Minimize2, MoreHorizontal, Plus, Settings2, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useT } from '@/i18n';
import type { Indicator } from '@/lib/chart-workspace/indicators';

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
  add: () => void;
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

interface Props {
  indicators: Indicator[];
  names: ReadonlyMap<string, string>;
  favorites: readonly string[];
  /** Effective axis of each indicator. */
  sideOf: (indicator: Indicator) => 'left' | 'right';
  maximizedPaneId: string | null;
  alarmsAvailable: boolean;
  atLimit: boolean;
  overlayLayout: boolean;
  actions: OscillatorActions;
}

export function OscillatorControls({ indicators, names, favorites, sideOf, maximizedPaneId, alarmsAvailable, atLimit, overlayLayout, actions }: Props) {
  const t = useT();
  const paneIds = [...new Set(indicators.map(item => item.paneId))];
  // The formation page does not scroll and its chart ends at the bottom edge, so the menu opens upwards there.
  const menuPanelClass = overlayLayout ? 'bottom-full top-auto mb-2 mt-0 max-h-[70dvh] w-64 overflow-y-auto' : 'w-64';
  const paneName = (paneId: string) => indicators.filter(item => item.paneId === paneId).map(item => names.get(item.id)).join(' + ');
  return <div className={`${overlayLayout ? 'absolute bottom-20 left-12 z-10 max-w-[calc(100%-4rem)] rounded-lg sm:max-w-[50%]' : ''} flex min-w-0 flex-wrap items-center gap-1 border-b border-border bg-card/80 px-2 py-1`} data-testid="oscillator-controls">
    {paneIds.map((paneId, paneIndex) => {
      const members = indicators.filter(item => item.paneId === paneId), name = paneName(paneId), collapsed = members[0].paneCollapsed, maximized = maximizedPaneId === paneId;
      return <div key={paneId} className="flex min-w-0 max-w-full flex-wrap items-center gap-0.5 rounded-md border border-border px-1 py-0.5" data-oscillator-pane={name}>
        {members.map(indicator => {
          const label = names.get(indicator.id) ?? indicator.kind, favorite = favorites.includes(indicator.kind), side = sideOf(indicator) === 'left' ? 'right' : 'left';
          return <div key={indicator.id} className="flex items-center">
            <span className={`max-w-24 truncate px-1 text-xs font-medium ${indicator.visible ? '' : 'text-muted-foreground line-through'}`}>{label}</span>
            <DropdownMenu label={t('cw.indicatorActions', { indicator: label })} hint={t('cw.indicatorActions.hint')} icon={<MoreHorizontal size={15} />} size="icon-sm" variant="ghost" panelClassName={menuPanelClass}>
              <DropdownMenuGroup>
                <DropdownMenuItem icon={indicator.visible ? <EyeOff size={15} /> : <Eye size={15} />} hint={t(indicator.visible ? 'cw.indicatorHide.hint' : 'cw.indicatorShow.hint')} onSelect={() => actions.toggleVisible(indicator)}>{t(indicator.visible ? 'cw.indicatorHide' : 'cw.indicatorShow', { indicator: label })}</DropdownMenuItem>
                <DropdownMenuItem icon={<Settings2 size={15} />} hint={t('cw.indicatorSettings.hint')} onSelect={() => actions.openSettings(indicator)}>{t('cw.indicatorSettings')}</DropdownMenuItem>
                <DropdownMenuItem icon={<ArrowLeftRight size={15} />} hint={t('cw.indicatorScale.hint')} onSelect={() => actions.switchScale(indicator)}>{t('cw.indicatorScale', { side: t(side === 'left' ? 'cw.option.left' : 'cw.option.right') })}</DropdownMenuItem>
                {paneIds.filter(id => id !== paneId).map(id => <DropdownMenuItem key={id} icon={<ListTree size={15} />} hint={t('cw.indicatorMovePane.hint')} onSelect={() => actions.moveToPane(indicator, id)}>{t('cw.indicatorMovePane', { pane: paneName(id) })}</DropdownMenuItem>)}
                {members.length > 1 && <DropdownMenuItem icon={<Plus size={15} />} hint={t('cw.indicatorNewPane.hint')} onSelect={() => actions.moveToPane(indicator, null)}>{t('cw.indicatorNewPane')}</DropdownMenuItem>}
                {alarmsAvailable && <DropdownMenuItem icon={<Bell size={15} />} hint={t('cw.indicatorAlarm.hint')} onSelect={() => actions.openAlarm(indicator)}>{t('cw.indicatorAlarm')}</DropdownMenuItem>}
                <DropdownMenuItem icon={<Star size={15} />} hint={t('cw.indicatorFavorite.hint')} onSelect={() => actions.toggleFavorite(indicator)}>{t(favorite ? 'cw.indicatorUnfavorite' : 'cw.indicatorFavorite')}</DropdownMenuItem>
                <DropdownMenuItem icon={<Copy size={15} />} hint={t(atLimit ? 'cw.indicatorCopyLimit.hint' : 'cw.indicatorCopy.hint')} disabled={atLimit} onSelect={() => actions.copy(indicator)}>{t('cw.indicatorCopy')}</DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuGroup>
                <DropdownMenuItem icon={<Info size={15} />} hint={t('cw.indicatorInfo.hint')} onSelect={() => actions.openInfo(indicator, false)}>{t('cw.indicatorInfo')}</DropdownMenuItem>
                <DropdownMenuItem icon={<FunctionSquare size={15} />} hint={t('cw.indicatorSource.hint')} onSelect={() => actions.openInfo(indicator, true)}>{t('cw.indicatorSource')}</DropdownMenuItem>
                <DropdownMenuItem icon={<X size={15} />} hint={t('cw.remove.hint')} tone="danger" onSelect={() => actions.remove(indicator)}>{t('cw.remove')}</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenu>
          </div>;
        })}
        <Button size="icon-sm" variant="ghost" hint={t(paneIndex === 0 ? 'cw.paneFirst.hint' : 'cw.paneUp.hint')} aria-label={t('cw.paneUp', { indicator: name })} disabled={paneIndex === 0} onClick={() => actions.movePane(paneId, -1)}><ArrowUp size={14} /></Button>
        <Button size="icon-sm" variant="ghost" hint={t(paneIndex === paneIds.length - 1 ? 'cw.paneLast.hint' : 'cw.paneDown.hint')} aria-label={t('cw.paneDown', { indicator: name })} disabled={paneIndex === paneIds.length - 1} onClick={() => actions.movePane(paneId, 1)}><ArrowDown size={14} /></Button>
        <Button size="icon-sm" variant="ghost" hint={t(collapsed ? 'cw.paneExpand.hint' : 'cw.paneCollapse.hint')} aria-label={t(collapsed ? 'cw.paneExpand' : 'cw.paneCollapse', { indicator: name })} aria-expanded={!collapsed} onClick={() => actions.toggleCollapsed(paneId)}>{collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Button>
        <Button size="icon-sm" variant="ghost" hint={t(maximized ? 'cw.paneRestore.hint' : 'cw.paneMaximize.hint')} aria-label={t(maximized ? 'cw.paneRestore' : 'cw.paneMaximize', { indicator: name })} aria-pressed={maximized} onClick={() => actions.toggleMaximized(paneId)}>{maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</Button>
        <Button size="icon-sm" variant="ghost" hint={t('cw.paneRemove.hint')} aria-label={t('cw.paneRemoveNamed', { indicator: name })} onClick={() => actions.removePane(paneId)}><X size={14} /></Button>
      </div>;
    })}
    <Button size="sm" variant="ghost" hint={t('cw.add.hint')} onClick={actions.add}>+ {t('cw.addIndicator')}</Button>
  </div>;
}
