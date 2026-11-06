'use client';

import { LineStyleControls } from '@/components/chart-workspace/LineStyleControls';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { FORMATION_LINE_ROLES } from '@/lib/formation/lineStyle';
import { useAnalysisPrefsStore } from '@/store/useAnalysisPrefsStore';
import { lineRoleLabel } from './FormationLineMenu';

/**
 * Tabelle „Formasyon çizgileri“ in den Chart-Einstellungen (Abschnitt Auto-Grid-Anzeigen): je Rolle eine Zeile mit denselben
 * Reglern wie im Menü. Der Dialog hat die Prefs mit `beginPreview` gesichert: Abbrechen stellt den Stil wieder her.
 */
export function FormationLineTable() {
  const t = useT();
  const style = useAnalysisPrefsStore(s => s.formationStyle);
  const set = useAnalysisPrefsStore(s => s.setFormationStyle);
  const reset = useAnalysisPrefsStore(s => s.resetFormationStyle);
  return (
    <section aria-label={t('formation.line.table')} className="mt-6 first:mt-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Tooltip content={t('formation.line.table.hint')}><h4 tabIndex={0} className="cursor-help text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('formation.line.table')}</h4></Tooltip>
        <Button size="sm" variant="ghost" hint={t('formation.line.table.resetAll.hint')} onClick={() => reset()}>{t('formation.line.table.resetAll')}</Button>
      </div>
      <div className="grid gap-2">
        {FORMATION_LINE_ROLES.map(role => (
          <div key={role} data-testid="line-style-row" data-role={role} className="min-w-0 rounded-lg border border-border p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">{t(lineRoleLabel(role))}</span>
              <div className="flex items-center gap-3">
                <Checkbox label={t('formation.line.table.visible')} hint={t('formation.line.table.visible.hint')} checked={style[role].visible} onChange={visible => set(role, { visible })} />
                <Button size="sm" variant="outline" hint={t('formation.line.table.reset.hint')} onClick={() => reset(role)}>{t('formation.line.table.reset')}</Button>
              </div>
            </div>
            <LineStyleControls layout="inline" spec={style[role]} onChange={patch => set(role, patch)} auto={role === 'trendUp' || role === 'trendDown' ? 'candle' : 'theme'} />
          </div>
        ))}
      </div>
    </section>
  );
}
