'use client';

import { Settings2 } from 'lucide-react';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { useT } from '@/i18n';
import { useAnalysisPrefsStore } from '@/store/useAnalysisPrefsStore';

/** Zahnrad: Anzeige-Schalter (gespeichert in diesem Browser). Pflicht-Hinweise haben keinen Schalter. */
export function AnalysisSettingsPanel() {
  const t = useT();
  const showZoneLines = useAnalysisPrefsStore((s) => s.showZoneLines);
  const showZoneCard = useAnalysisPrefsStore((s) => s.showZoneCard);
  const setPref = useAnalysisPrefsStore((s) => s.setPref);

  return (
    <DropdownMenu
      label={t('analysis.settings')}
      hint={t('analysis.settings.hint')}
      icon={<Settings2 size={15} />}
      size="icon-sm"
      panelClassName="w-72"
    >
      <div className="space-y-3 p-3" data-testid="analysis-settings">
        <p className="text-xs font-semibold text-foreground">{t('analysis.settings')}</p>
        <Switch
          checked={showZoneLines}
          onChange={(v) => setPref('showZoneLines', v)}
          label={t('analysis.settings.zoneLines')}
          hint={t('analysis.settings.zoneLines.hint')}
          id="analysis-pref-zone-lines"
        />
        <Switch
          checked={showZoneCard}
          onChange={(v) => setPref('showZoneCard', v)}
          label={t('analysis.settings.zoneCard')}
          hint={t('analysis.settings.zoneCard.hint')}
          id="analysis-pref-zone-card"
        />
        <p className="border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
          {t('analysis.settings.fixed')}
        </p>
      </div>
    </DropdownMenu>
  );
}
