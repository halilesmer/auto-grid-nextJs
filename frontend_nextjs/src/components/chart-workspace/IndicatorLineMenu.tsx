'use client';

import { Bell, Copy, EyeOff, Settings2, Trash2 } from 'lucide-react';
import { ContextMenu, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator } from '@/components/ui/context-menu';
import { useT } from '@/i18n';
import { isOscillator, type Indicator } from '@/lib/chart-workspace/indicators';
import { readChartColors } from '@/lib/chartTheme';
import type { LineStyleSpec } from '@/lib/formation/lineStyle';
import { LineStyleControls } from './LineStyleControls';
import type { OscillatorActions } from './IndicatorLegend';

/** The canvas needs a real color; the gray swatch is a CSS variable, so it becomes the theme's gray as #rrggbb. */
function toHex(color: string): string {
  if (/^#[\da-f]{6}$/i.test(color)) return color;
  const resolved = color.startsWith('var(') ? readChartColors().muted : color;
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return '';
  context.fillStyle = '#000000'; context.fillStyle = resolved;
  return /^#[\da-f]{6}$/i.test(context.fillStyle) ? context.fillStyle : '';
}

/** Menu of an indicator line (plan 1105-A7, S3): style of this indicator plus the actions of its legend row. Changes act at once. */
export function IndicatorLineMenu({ x, y, indicator, label, actions, alarmsAvailable, atLimit, onClose }: {
  x: number; y: number; indicator: Indicator; label: string; actions: OscillatorActions; alarmsAvailable: boolean; atLimit: boolean; onClose: () => void;
}) {
  const t = useT();
  const spec: LineStyleSpec = { color: indicator.color, style: indicator.lineStyle, width: indicator.width, visible: true };
  const patch = (change: Partial<LineStyleSpec>) => {
    const next: Partial<Indicator> = {};
    if (change.color !== undefined) next.color = toHex(change.color);
    if (change.style !== undefined) next.lineStyle = change.style;
    if (change.width !== undefined) next.width = change.width;
    actions.update(indicator, next);
  };
  const title = t('cw.indicatorLine.menu', { indicator: label });
  return (
    <ContextMenu x={x} y={y} label={title} onClose={onClose} data-testid="indicator-line-menu">
      <ContextMenuLabel>{title}</ContextMenuLabel>
      {/* EWO draws its main series as bars: the width has no effect there, but color and the rest do */}
      <LineStyleControls spec={spec} onChange={patch} />
      <ContextMenuSeparator />
      <ContextMenuItem hint={t('cw.indicatorSettings.hint')} onSelect={() => actions.openSettings(indicator)}><span className="flex items-center gap-2"><Settings2 size={15} />{t('cw.indicatorSettings')}</span></ContextMenuItem>
      <ContextMenuItem hint={t('cw.indicatorHide.hint')} onSelect={() => actions.toggleVisible(indicator)}><span className="flex items-center gap-2"><EyeOff size={15} />{t('cw.indicatorHide', { indicator: label })}</span></ContextMenuItem>
      {alarmsAvailable && isOscillator(indicator) && <ContextMenuItem hint={t('cw.indicatorAlarm.hint')} onSelect={() => actions.openAlarm(indicator)}><span className="flex items-center gap-2"><Bell size={15} />{t('cw.indicatorAlarm')}</span></ContextMenuItem>}
      <ContextMenuItem hint={t(atLimit ? 'cw.indicatorCopyLimit.hint' : 'cw.indicatorCopy.hint')} onSelect={() => { if (!atLimit) actions.copy(indicator); }}><span className="flex items-center gap-2"><Copy size={15} />{t('cw.indicatorCopy')}</span></ContextMenuItem>
      <ContextMenuItem hint={t('cw.remove.hint')} tone="danger" onSelect={() => actions.remove(indicator)}><span className="flex items-center gap-2"><Trash2 size={15} />{t('cw.remove')}</span></ContextMenuItem>
    </ContextMenu>
  );
}
