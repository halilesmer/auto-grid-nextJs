'use client';

import { Bell, Copy, EyeOff, Settings2, Star, Trash2 } from 'lucide-react';
import { ContextMenu, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator } from '@/components/ui/context-menu';
import { useT } from '@/i18n';
import { isOscillator, isSystemRsi, type Indicator } from '@/lib/chart-workspace/indicators';
import type { LineStyleSpec } from '@/lib/formation/lineStyle';
import { INDICATOR_GRAY as GRAY } from '@/lib/chart-workspace/indicators';
import { LineStyleControls } from './LineStyleControls';
import type { OscillatorActions } from './IndicatorLegend';

/**
 * Stored color of a swatch. Empty = the role's own color (runtime falls back to the theme color). The gray swatch stays the CSS variable
 * `var(--muted-foreground)` (runtime resolves it, so it follows the theme). Any other value must become #rrggbb; if it cannot, `null` = no change.
 */
export function toHex(color: string): string | null {
  if (!color || color === GRAY || /^#[\da-f]{6}$/i.test(color)) return color;
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return null;
  // Two different start values tell an ignored (invalid) color from a real one
  context.fillStyle = '#000000'; context.fillStyle = color; const first = context.fillStyle;
  context.fillStyle = '#ffffff'; context.fillStyle = color; const second = context.fillStyle;
  return first === second && /^#[\da-f]{6}$/i.test(first) ? first : null;
}

/** Menu of an indicator line (plan 1105-A7, S3): style of this indicator plus the actions of its legend row. Changes act at once. */
export function IndicatorLineMenu({ x, y, indicator, label, actions, alarmsAvailable, atLimit, favorite, onClose }: {
  x: number; y: number; indicator: Indicator; label: string; actions: OscillatorActions; alarmsAvailable: boolean; atLimit: boolean; favorite: boolean; onClose: () => void;
}) {
  const t = useT();
  const spec: LineStyleSpec = { color: indicator.color, style: indicator.lineStyle, width: indicator.width, visible: true };
  const patch = (change: Partial<LineStyleSpec>) => {
    const next: Partial<Indicator> = {};
    if (change.color !== undefined) { const hex = toHex(change.color); if (hex !== null) next.color = hex; }
    if (change.style !== undefined) next.lineStyle = change.style;
    if (change.width !== undefined) next.width = change.width;
    actions.update(indicator, next);
  };
  const title = t('cw.indicatorLine.menu', { indicator: label });
  return (
    <ContextMenu x={x} y={y} label={title} onClose={onClose} data-testid="indicator-line-menu">
      <ContextMenuLabel>{title}</ContextMenuLabel>
      {/* EWO draws its main series as bars: line type and width have no effect there, only the color does */}
      <LineStyleControls spec={spec} onChange={patch} colorOnly={indicator.kind === 'EWO'} />
      <ContextMenuSeparator />
      <ContextMenuItem hint={t('cw.indicatorSettings.hint')} onSelect={() => actions.openSettings(indicator)}><span className="flex items-center gap-2"><Settings2 size={15} />{t('cw.indicatorSettings')}</span></ContextMenuItem>
      <ContextMenuItem hint={t('cw.indicatorHide.hint')} onSelect={() => actions.toggleVisible(indicator)}><span className="flex items-center gap-2"><EyeOff size={15} />{t('cw.indicatorHide', { indicator: label })}</span></ContextMenuItem>
      {alarmsAvailable && isOscillator(indicator) && <ContextMenuItem hint={t('cw.indicatorAlarm.hint')} onSelect={() => actions.openAlarm(indicator)}><span className="flex items-center gap-2"><Bell size={15} />{t('cw.indicatorAlarm')}</span></ContextMenuItem>}
      <ContextMenuItem hint={t('cw.indicatorFavorite.hint')} onSelect={() => actions.toggleFavorite(indicator)}><span className="flex items-center gap-2"><Star size={15} />{t(favorite ? 'cw.indicatorUnfavorite' : 'cw.indicatorFavorite')}</span></ContextMenuItem>
      <ContextMenuItem hint={t(atLimit ? 'cw.indicatorCopyLimit.hint' : 'cw.indicatorCopy.hint')} onSelect={() => { if (!atLimit) actions.copy(indicator); }}><span className="flex items-center gap-2"><Copy size={15} />{t('cw.indicatorCopy')}</span></ContextMenuItem>
      <ContextMenuItem hint={t(isSystemRsi(indicator) ? 'cw.legend.hideLayer.hint' : 'cw.remove.hint')} tone="danger" onSelect={() => actions.remove(indicator)}><span className="flex items-center gap-2"><Trash2 size={15} />{isSystemRsi(indicator) ? t('cw.legend.hideLayer', { layer: label }) : t('cw.remove')}</span></ContextMenuItem>
    </ContextMenu>
  );
}
