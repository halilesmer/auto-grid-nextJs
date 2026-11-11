'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Eye, EyeOff, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import AnimatedTabs from '@/components/ui/animated-tabs';
import { Modal } from '@/components/ui/modal';
import { useFormat, useT } from '@/i18n';
import { INDICATOR_KINDS, newIndicator, resetIndicator, type Indicator } from '@/lib/chart-workspace/indicators';
import { readChartColors } from '@/lib/chartTheme';
import { useChartWorkspaceStore } from '@/store/useChartWorkspaceStore';
import { InputsTab, StyleTab, VisibilityTab } from './IndicatorTabs';
import { randomId } from '@/lib/randomId';

type TabId = 'inputs' | 'style' | 'visibility';
type Section = 'indicators' | 'drawings';
const LIMIT = 20;

/**
 * Indicator dialog, the one window for indicators and drawings (1106-A3). Without a chosen indicator it has two tabs:
 * Indicators lists the kinds to add and the indicators of the chart (show/hide, edit, remove); Drawings shows the drawing
 * objects of the chart (`drawingsPanel`, the former "Drawing objects" window). With a chosen indicator it is the tabbed
 * settings dialog (Inputs / Style / Visibility). Changes show on the chart at once; Cancel restores the state from when
 * the settings were opened (a new indicator stays, with its default look), OK keeps it.
 */
export function IndicatorDialog({ values, favorites, focusId = null, onChange, onClose, timeframeSec, drawingsPanel, drawingCount, initialSection = 'indicators' }: { initialSection?: Section; values: Indicator[]; favorites: Indicator['kind'][]; focusId?: string | null; onChange: (v: Indicator[]) => void; onClose: () => void; timeframeSec: number; drawingsPanel: ReactNode; drawingCount: number }) {
  const t = useT(), fmt = useFormat(), defaults = useChartWorkspaceStore(s => s.indicatorDefaults), saveDefault = useChartWorkspaceStore(s => s.saveIndicatorDefault);
  const [editing, setEditing] = useState<string | null>(focusId);
  const [tab, setTab] = useState<TabId>('inputs');
  const [section, setSection] = useState<Section>(initialSection);
  // State from before the settings were opened: Cancel puts it back
  const snapshot = useRef<Indicator[]>(values);
  const live = useRef(values);
  useEffect(() => { live.current = values; });
  const current = values.find(v => v.id === editing) ?? null;
  const colors = readChartColors();
  const tones = useMemo(() => ({ info: colors.info, warning: colors.warning, up: colors.up, down: colors.down, muted: colors.muted }), [colors.info, colors.warning, colors.up, colors.down, colors.muted]);
  const update = (id: string, change: Partial<Indicator>) => onChange(values.map(v => v.id === id ? { ...v, ...change } : v));
  const open = (id: string) => { snapshot.current = values; setTab('inputs'); setEditing(id); };
  const add = (kind: Indicator['kind']) => {
    if (values.length >= LIMIT) return;
    const created = { ...newIndicator(kind), ...defaults[kind] }, id = randomId();
    const item = { ...created, id, paneId: id, paneCollapsed: false, visible: true };
    // Adding is its own step in the list: Cancel in the settings keeps the new indicator with its default look
    snapshot.current = [...values, item]; setTab('inputs'); setEditing(id); onChange([...values, item]);
  };
  const cancel = () => { onChange(snapshot.current); onClose(); };
  const reset = (item: Indicator) => update(item.id, resetIndicator(item, defaults[item.kind]));

  if (!current) {
    const sections = [
      { id: 'indicators', label: `${t('cw.tab.indicators')} · ${fmt.number(values.length)}`, hint: t('cw.tab.indicators.hint') },
      { id: 'drawings', label: `${t('cw.tab.drawings')} · ${fmt.number(drawingCount)}`, hint: t('cw.tab.drawings.hint') },
    ];
    return <Modal open onClose={onClose} title={t('cw.indicatorsAndDrawings')} className="max-h-[90dvh] max-w-4xl overflow-y-auto">
      <AnimatedTabs tabs={sections} activeTab={section} onChange={id => setSection(id as Section)} className="mb-4" />
      {section === 'drawings' ? drawingsPanel : <div data-testid="indicator-list">
        {favorites.length > 0 && <div className="mb-3"><p className="mb-2 text-sm font-medium">{t('cw.favoriteIndicators')}</p><div className="flex flex-wrap gap-2">{favorites.map(kind => <Button key={kind} size="sm" hint={t(values.length >= LIMIT ? 'cw.indicatorLimit.hint' : 'cw.add.hint')} disabled={values.length >= LIMIT} onClick={() => add(kind)}><span aria-hidden="true">★ </span>{kind}</Button>)}</div></div>}
        <div className="flex flex-wrap gap-2">{INDICATOR_KINDS.map(kind => <Button key={kind} size="sm" hint={t(values.length >= LIMIT ? 'cw.indicatorLimit.hint' : 'cw.add.hint')} disabled={values.length >= LIMIT} onClick={() => add(kind)}>+ {kind}</Button>)}</div>
        <ul className="mt-4 space-y-2" data-testid="indicator-instances">{values.map(v => <li key={v.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2" data-indicator={v.kind} data-indicator-id={v.id}>
          <strong className="text-sm">{v.kind} <span className="font-normal text-muted-foreground">{v.period}</span></strong>
          <span className="flex flex-wrap justify-end gap-2">
            {/* Show/hide, moved from the former "Drawing objects" window (1106-A3); the label states the current state */}
            <Button size="sm" variant="ghost" data-testid="indicator-visibility" hint={t('cw.indicatorTree.hint')} onClick={() => update(v.id, { visible: !v.visible })}><span className="flex items-center gap-1.5">{v.visible ? <Eye size={15} aria-hidden="true" /> : <EyeOff size={15} aria-hidden="true" />}{t(v.visible ? 'cw.visible' : 'cw.hidden')}</span></Button>
            <Button size="sm" variant="outline" hint={t('ind.edit.hint')} onClick={() => open(v.id)}>{t('ind.edit')}</Button><Button size="sm" variant="ghost" hint={t('cw.remove.hint')} onClick={() => onChange(values.filter(i => i.id !== v.id))}>{t('cw.remove')}</Button>
          </span>
        </li>)}</ul>
      </div>}
    </Modal>;
  }
  const tabs = [
    { id: 'inputs', label: t('ind.tab.inputs'), hint: t('ind.tab.inputs.hint') },
    { id: 'style', label: t('ind.tab.style'), hint: t('ind.tab.style.hint') },
    { id: 'visibility', label: t('ind.tab.visibility'), hint: t('ind.tab.visibility.hint') },
  ];
  const props = { indicator: current, update: (change: Partial<Indicator>) => update(current.id, change), timeframeSec, tones };
  return <Modal open onClose={cancel} title={current.kind} className="flex max-h-[90dvh] max-w-md flex-col" >
    <div className="-mx-6 -mb-6 flex min-h-0 flex-1 flex-col" data-indicator={current.kind} data-indicator-id={current.id} data-testid="indicator-settings">
      <div className="px-6"><AnimatedTabs tabs={tabs} activeTab={tab} onChange={id => setTab(id as TabId)} /></div>
      <div className="max-h-[60dvh] min-h-[22rem] overflow-y-auto px-6 py-4">
        {tab === 'inputs' && <InputsTab {...props} />}
        {tab === 'style' && <StyleTab {...props} />}
        {tab === 'visibility' && <VisibilityTab {...props} />}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-6 py-3">
        <DropdownMenu label={t('ind.defaults')} hint={t('ind.defaults.hint')} side="top" align="left" size="sm" panelClassName="w-60" icon={<span>{t('ind.defaults')} ▾</span>}>
          <DropdownMenuGroup>
            <DropdownMenuItem icon={<RotateCcw className="size-4" aria-hidden="true" />} hint={t('ind.reset.hint')} onSelect={() => reset(current)}>{t('ind.reset')}</DropdownMenuItem>
            <DropdownMenuItem icon={<Save className="size-4" aria-hidden="true" />} hint={t('ind.saveDefault.hint')} onSelect={() => saveDefault(current)}>{t('ind.saveDefault')}</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenu>
        <div className="flex gap-2"><Button variant="outline" hint={t('ind.cancel.hint')} onClick={cancel}>{t('cw.cancel')}</Button><Button variant="primary" hint={t('ind.ok.hint')} onClick={onClose}>{t('ind.ok')}</Button></div>
      </div>
    </div>
  </Modal>;
}
