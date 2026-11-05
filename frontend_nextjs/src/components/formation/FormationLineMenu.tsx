'use client';

import { useCallback } from 'react';
import { ContextMenu, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator } from '@/components/ui/context-menu';
import { LineStyleControls } from '@/components/chart-workspace/LineStyleControls';
import { useT, type MessageKey } from '@/i18n';
import { requestChartSettings } from '@/lib/chart-workspace/settingsRequest';
import type { FormationLineRole } from '@/lib/formation/lineStyle';
import { useAnalysisPrefsStore } from '@/store/useAnalysisPrefsStore';

export const lineRoleLabel = (role: FormationLineRole): MessageKey => `formation.line.role.${role}`;

/** Menü einer Formationslinie (Plan 1105-A7, S2): Stil der Rolle ändern, ausblenden, zurücksetzen, Tabelle öffnen. Änderungen wirken sofort. */
export function FormationLineMenu({ x, y, role, onClose }: { x: number; y: number; role: FormationLineRole; onClose: () => void }) {
  const t = useT();
  const spec = useAnalysisPrefsStore(s => s.formationStyle[role]);
  const set = useAnalysisPrefsStore(s => s.setFormationStyle);
  const reset = useAnalysisPrefsStore(s => s.resetFormationStyle);
  const patch = useCallback((p: Parameters<typeof set>[1]) => set(role, p), [set, role]);
  const title = t('formation.line.menu', { role: t(lineRoleLabel(role)) });
  return (
    <ContextMenu x={x} y={y} label={title} onClose={onClose} data-testid="line-menu">
      <ContextMenuLabel>{title}</ContextMenuLabel>
      <LineStyleControls spec={spec} onChange={patch} auto={role === 'trendUp' || role === 'trendDown' ? 'candle' : 'theme'} />
      <ContextMenuSeparator />
      <ContextMenuItem hint={t('formation.line.hide.hint')} onSelect={() => patch({ visible: false })}>{t('formation.line.hide')}</ContextMenuItem>
      <ContextMenuItem hint={t('formation.line.reset.hint')} keepOpen onSelect={() => reset(role)}>{t('formation.line.reset')}</ContextMenuItem>
      <ContextMenuItem hint={t('formation.line.all.hint')} onSelect={() => requestChartSettings('overlays')}>{t('formation.line.all')}</ContextMenuItem>
    </ContextMenu>
  );
}
