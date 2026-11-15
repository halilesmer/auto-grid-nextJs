'use client';

import { useState } from 'react';
import { Check, ExternalLink, Info } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import ConfirmModal from '@/components/ConfirmModal';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { CHART_DEFAULT_TFS, type ChartDefaultTf } from '@/lib/userPrefs';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { hasProductOscillators, type OscScope } from '@/lib/chart-workspace/oscStandard';
import { useChartWorkspaceStore } from '@/store/useChartWorkspaceStore';
import { useChartPrefsStore } from '@/store/useChartPrefsStore';
import { useCustomColorsStore } from '@/store/useCustomColorsStore';
import { useSettingsDialogStore } from '@/store/useSettingsDialogStore';
import { clearCustomColors, useUserPrefsStore } from '@/store/useUserPrefsStore';
import { Segmented, SettingsRow } from './parts';

/** USR-17: RSI ve EWO her üründe aynı standart mı, ürün başına mı. */
function OscillatorScope() {
  const t = useT();
  const mode = useChartWorkspaceStore((s) => s.oscScope);
  const kept = useChartWorkspaceStore((s) => Object.values(s.documents).filter(hasProductOscillators).length);
  const setMode = (v: OscScope) => useChartWorkspaceStore.getState().setOscScope(v);
  const options: { value: OscScope; title: string; desc: string; hint: string; badge?: string }[] = [
    { value: 'standard', title: t('sdlg.osc.standard'), desc: t('sdlg.osc.standard.desc'), hint: t('sdlg.osc.standard.hint'), badge: t('sdlg.osc.standard.badge') },
    { value: 'product', title: t('sdlg.osc.product'), desc: t('sdlg.osc.product.desc'), hint: t('sdlg.osc.product.hint') },
  ];
  return (
    <SettingsRow label={t('sdlg.osc')} desc={t('sdlg.osc.desc')} prefKey="chart_osc_scope" isNew testId="row-chart-osc">
      <div className="flex min-w-0 flex-col gap-3.5">
        <div role="radiogroup" aria-label={t('sdlg.osc')} className="flex flex-col gap-3" data-testid="settings-osc-scope">
          {options.map((o) => {
            const on = mode === o.value;
            return (
              <Tooltip key={o.value} content={o.hint}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-testid={`settings-osc-scope-${o.value}`}
                  onClick={() => { if (!on) setMode(o.value); }}
                  className={cn(
                    'flex min-h-11 w-full min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    on ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50',
                  )}
                >
                  <span aria-hidden="true" className={cn('mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border-2', on ? 'border-primary' : 'border-muted-foreground')}>
                    <span className={cn('size-2 rounded-full', on ? 'bg-primary' : 'bg-transparent')} />
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {o.title}
                      {o.badge && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">{o.badge}</span>}
                    </span>
                    <span className="text-[13px] leading-snug text-muted-foreground">{o.desc}</span>
                  </span>
                </button>
              </Tooltip>
            );
          })}
        </div>
        {mode === 'standard' ? (
          <div className="flex flex-col gap-3.5" data-testid="settings-osc-standard-info">
            <div className="flex flex-col gap-2">
              <h3 className="m-0 text-[13px] font-semibold text-muted-foreground">{t('sdlg.osc.incl')}</h3>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {(['i1', 'i2', 'i3', 'i4', 'i5', 'i6'] as const).map((id) => (
                  <li key={id} className="rounded-full bg-muted px-2.5 py-1 text-[13px]">{t(`sdlg.osc.${id}`)}</li>
                ))}
              </ul>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-[13px] leading-snug">
              <Info size={18} className="mt-px shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              <div className="flex min-w-0 flex-col gap-1">
                {kept > 0 && <span data-testid="settings-osc-kept">{t('sdlg.osc.kept', { n: kept })}</span>}
                <span className="text-muted-foreground">{t('sdlg.osc.how')}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-xl bg-muted px-4 py-3 text-[13px] leading-snug" data-testid="settings-osc-product-info">
            <Info size={18} className="mt-px shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>{t('sdlg.osc.productinfo')}</span>
          </div>
        )}
        <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Check size={16} aria-hidden="true" />
          {t('sdlg.osc.saved')}
        </span>
      </div>
    </SettingsRow>
  );
}

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

  const openAppearance = () => {
    useSettingsDialogStore.getState().requestAppearance();
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

      <OscillatorScope />

      <SettingsRow
        label={
          <>
            {t('sdlg.chartprefs')}
            <span className="ml-2.5 rounded-full bg-primary/15 px-2 py-0.5 align-middle text-[11px] font-normal text-primary">{t('sdlg.chartprefs.badge')}</span>
          </>
        }
        desc={t('sdlg.chartprefs.desc')}
        prefKey="chart_appearance"
        testId="row-chart-prefs"
      >
        <div className="flex flex-col gap-3.5">
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm" data-testid="settings-chartprefs-list">
            {(['i1', 'i2', 'i3', 'i4', 'i5', 'i6'] as const).map((id) => (
              <li key={id} className="flex items-start gap-2">
                <Check size={14} strokeWidth={2.5} className="mt-[3px] shrink-0 text-emerald-500" aria-hidden="true" />
                <span>{t(`sdlg.chartprefs.${id}`)}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="md" className="min-h-11 md:min-h-9" hint={t('sdlg.chartprefs.appearance.hint')} data-testid="settings-appearance-open" onClick={openAppearance}>
              {t('sdlg.chartprefs.appearance')}
              <ExternalLink size={15} aria-hidden="true" />
            </Button>
            <Button variant="outline" size="md" className="min-h-11 md:min-h-9" hint={t('sdlg.chartprefs.indicators.hint')} data-testid="settings-indicators-open" onClick={openIndicators}>
              {t('sdlg.chartprefs.indicators')}
              <ExternalLink size={15} aria-hidden="true" />
            </Button>
          </div>
          <span className="text-[13px] leading-snug text-muted-foreground" data-testid="settings-chartprefs-note">{t('sdlg.chartprefs.note')}</span>
        </div>
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
