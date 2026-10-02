'use client';

import { Settings2 } from 'lucide-react';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { useT, type MessageKey } from '@/i18n';
import { useAnalysisPrefsStore, type AnalysisPrefs } from '@/store/useAnalysisPrefsStore';

const SWITCHES: { key: keyof AnalysisPrefs; label: MessageKey; hint: MessageKey; id: string }[] = [
  { key: 'showZoneLines', label: 'analysis.settings.zoneLines', hint: 'analysis.settings.zoneLines.hint', id: 'analysis-pref-zone-lines' },
  { key: 'showLevels', label: 'analysis.settings.levels', hint: 'analysis.settings.levels.hint', id: 'analysis-pref-levels' },
  { key: 'showTrades', label: 'analysis.settings.trades', hint: 'analysis.settings.trades.hint', id: 'analysis-pref-trades' },
  { key: 'showPauses', label: 'analysis.settings.pauses', hint: 'analysis.settings.pauses.hint', id: 'analysis-pref-pauses' },
  { key: 'showRsi', label: 'analysis.settings.rsi', hint: 'analysis.settings.rsi.hint', id: 'analysis-pref-rsi' },
  { key: 'showZoneCard', label: 'analysis.settings.zoneCard', hint: 'analysis.settings.zoneCard.hint', id: 'analysis-pref-zone-card' },
];

/** Zahnrad: Anzeige-Schalter (gespeichert in diesem Browser). Pflicht-Hinweise haben keinen Schalter. */
export function AnalysisSettingsPanel() {
  const t = useT();
  const prefs = useAnalysisPrefsStore();

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
        {SWITCHES.map((s) => (
          <Switch
            key={s.key}
            checked={prefs[s.key]}
            onChange={(v) => prefs.setPref(s.key, v)}
            label={t(s.label)}
            hint={t(s.hint)}
            id={s.id}
          />
        ))}
        <p className="border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
          {t('analysis.settings.fixed')}
        </p>
      </div>
    </DropdownMenu>
  );
}
