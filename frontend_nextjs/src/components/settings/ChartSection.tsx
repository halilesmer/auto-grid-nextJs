'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import ConfirmModal from '@/components/ConfirmModal';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { CHART_DEFAULT_TFS, type ChartDefaultTf } from '@/lib/userPrefs';
import { useChartPrefsStore } from '@/store/useChartPrefsStore';
import { useCustomColorsStore } from '@/store/useCustomColorsStore';
import { useSettingsDialogStore } from '@/store/useSettingsDialogStore';
import { clearCustomColors, useUserPrefsStore } from '@/store/useUserPrefsStore';
import { Segmented, SettingsRow } from './parts';

export default function ChartSection() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const tf = useChartPrefsStore((s) => s.tf);
  const colors = useCustomColorsStore((s) => s.colors);
  const change = useUserPrefsStore((s) => s.change);
  const [confirm, setConfirm] = useState(false);

  const openIndicators = () => {
    useSettingsDialogStore.getState().requestIndicators();
    // Zaten grafikteyse adres (sembol, zaman dilimi, formasyon) korunur
    if (!pathname.startsWith('/chart')) router.push('/chart');
  };

  return (
    <div data-testid="settings-chart">
      <SettingsRow label={t('sdlg.tf')} desc={t('sdlg.tf.desc')} prefKey="chart_tf" isNew testId="row-chart-tf">
        <Segmented<ChartDefaultTf>
          ariaLabel={t('sdlg.tf')}
          testId="settings-tf"
          value={tf}
          onChange={(v) => void change('chart_tf', { tf: v }, () => ({ name: t('sdlg.tf'), value: v }))}
          options={CHART_DEFAULT_TFS.map((v) => ({ value: v, label: v, hint: t('sdlg.tf.option.hint', { tf: v }) }))}
        />
      </SettingsRow>

      <SettingsRow label={t('sdlg.colors')} desc={t('sdlg.colors.desc')} prefKey="chart_colors" testId="row-chart-colors">
        <div className="flex flex-wrap items-center gap-4">
          {colors.length ? (
            <div className="flex flex-wrap gap-1.5" data-testid="settings-colors" aria-label={t('sdlg.colors')}>
              {colors.map((c) => (
                <span key={c} data-testid="settings-color" data-color={c} className="block size-6 rounded-md border border-black/20 dark:border-white/20" style={{ background: c }} aria-hidden="true" />
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground" data-testid="settings-colors-empty">{t('sdlg.colors.empty')}</span>
          )}
          <Button variant="outline" size="md" className="min-h-11 md:min-h-9" disabled={!colors.length} hint={colors.length ? t('sdlg.colors.clear.hint') : t('sdlg.colors.clear.disabled.hint')} data-testid="settings-colors-clear" onClick={() => setConfirm(true)}>
            {t('sdlg.colors.clear')}
          </Button>
        </div>
      </SettingsRow>

      <SettingsRow label={t('sdlg.ind')} desc={t('sdlg.ind.desc')} testId="row-chart-indicators">
        <Button variant="outline" size="md" className="min-h-11 md:min-h-9" hint={t('sdlg.ind.open.hint')} data-testid="settings-indicators-open" onClick={openIndicators}>
          {t('sdlg.ind.open')}
          <ExternalLink size={15} aria-hidden="true" />
        </Button>
      </SettingsRow>

      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          void clearCustomColors();
        }}
        title={t('sdlg.colors.confirm.title')}
        message={t('sdlg.colors.confirm.text', { n: colors.length })}
        confirmLabel={t('sdlg.colors.clear.confirm')}
        confirmHint={t('sdlg.colors.clear.confirm.hint')}
        variant="danger"
      />
    </div>
  );
}
