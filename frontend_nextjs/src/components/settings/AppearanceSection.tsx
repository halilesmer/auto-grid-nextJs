'use client';

import { Eye } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { LOCALES, LOCALE_NAMES, useLocale, useT } from '@/i18n';
import type { ThemePreference } from '@/lib/theme';
import {
  DELAY_MAX_MS,
  DELAY_MIN_MS,
  HOLD_MAX_MS,
  HOLD_MIN_MS,
  parseSeconds,
  type TooltipDelayMode,
  type TooltipHoldMode,
} from '@/lib/userPrefs';
import { useThemeStore } from '@/store/useThemeStore';
import { useTooltipPrefsStore } from '@/store/useTooltipPrefsStore';
import { changeLocale, changeTheme, useUserPrefsStore } from '@/store/useUserPrefsStore';
import { Segmented, SecondsField, SettingsRow } from './parts';

const secs = (ms: number) => ms / 1000;

export default function AppearanceSection() {
  const t = useT();
  const locale = useLocale();
  const theme = useThemeStore((s) => s.theme);
  const delay = useTooltipPrefsStore((s) => s.delay);
  const hold = useTooltipPrefsStore((s) => s.hold);
  const change = useUserPrefsStore((s) => s.change);

  const setDelay = (mode: TooltipDelayMode, ms: number) =>
    change(
      'tooltip_delay',
      { mode, ms },
      {
        name: t('sdlg.delay'),
        value: mode === 'instant' ? t('sdlg.delay.instant') : `${secs(ms)} ${t('sdlg.unit.sec')}`,
      },
    );
  const setHold = (mode: TooltipHoldMode, ms: number) =>
    change(
      'tooltip_hold',
      { mode, ms },
      {
        name: t('sdlg.hold'),
        value: mode === 'pointer' ? t('sdlg.hold.pointer') : `${secs(ms)} ${t('sdlg.unit.sec')}`,
      },
    );

  const limits = (min: number, max: number) => ({ min: secs(min), max: secs(max) });

  return (
    <div data-testid="settings-appearance">
      <SettingsRow label={t('common.language')} desc={t('sdlg.lang.desc')} prefKey="locale" testId="row-locale">
        <Segmented
          ariaLabel={t('common.language')}
          testId="settings-lang"
          value={locale}
          onChange={(v) => void changeLocale(v)}
          options={LOCALES.map((l) => ({
            value: l,
            label: LOCALE_NAMES[l],
            hint: t('nav.language.option.hint', { language: LOCALE_NAMES[l] }),
          }))}
        />
      </SettingsRow>

      <SettingsRow label={t('common.theme')} desc={t('sdlg.theme.desc')} prefKey="theme" testId="row-theme">
        <Segmented<ThemePreference>
          ariaLabel={t('common.theme')}
          testId="settings-theme"
          value={theme}
          onChange={(v) => void changeTheme(v)}
          options={(['system', 'light', 'dark'] as ThemePreference[]).map((p) => ({
            value: p,
            label: t(`common.theme.${p}`),
            hint: t(`common.theme.${p}.hint`),
          }))}
        />
      </SettingsRow>

      <SettingsRow label={t('sdlg.delay')} desc={t('sdlg.delay.desc')} prefKey="tooltip_delay" isNew testId="row-tooltip-delay">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          <Segmented<TooltipDelayMode>
            ariaLabel={t('sdlg.delay')}
            testId="settings-delay"
            value={delay.mode}
            onChange={(mode) => void setDelay(mode, delay.ms)}
            options={[
              { value: 'instant', label: t('sdlg.delay.instant'), hint: t('sdlg.delay.instant.hint') },
              { value: 'custom', label: t('sdlg.delay.custom'), hint: t('sdlg.delay.custom.hint') },
            ]}
          />
          <SecondsField
            testId="settings-delay-input"
            ms={delay.ms}
            disabled={delay.mode === 'instant'}
            parse={(text) => parseSeconds(text, DELAY_MIN_MS, DELAY_MAX_MS)}
            onCommit={(ms) => void setDelay('custom', ms)}
            ariaLabel={t('sdlg.delay.input')}
            hint={t('sdlg.delay.input.hint')}
            help={t('sdlg.delay.help', limits(DELAY_MIN_MS, DELAY_MAX_MS))}
            error={t('sdlg.delay.error', limits(DELAY_MIN_MS, DELAY_MAX_MS))}
          />
        </div>
      </SettingsRow>

      <SettingsRow label={t('sdlg.hold')} desc={t('sdlg.hold.desc')} prefKey="tooltip_hold" isNew testId="row-tooltip-hold">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
            <Segmented<TooltipHoldMode>
              ariaLabel={t('sdlg.hold')}
              testId="settings-hold"
              value={hold.mode}
              onChange={(mode) => void setHold(mode, hold.ms)}
              options={[
                { value: 'pointer', label: t('sdlg.hold.pointer'), hint: t('sdlg.hold.pointer.hint') },
                { value: 'custom', label: t('sdlg.hold.custom'), hint: t('sdlg.hold.custom.hint') },
              ]}
            />
            <SecondsField
              testId="settings-hold-input"
              ms={hold.ms}
              disabled={hold.mode === 'pointer'}
              parse={(text) => parseSeconds(text, HOLD_MIN_MS, HOLD_MAX_MS)}
              onCommit={(ms) => void setHold('custom', ms)}
              ariaLabel={t('sdlg.hold.input')}
              hint={t('sdlg.hold.input.hint')}
              help={t('sdlg.hold.help', limits(HOLD_MIN_MS, HOLD_MAX_MS))}
              error={t('sdlg.hold.error', limits(HOLD_MIN_MS, HOLD_MAX_MS))}
            />
          </div>
          <Tooltip content={t('sdlg.try.text')} className="self-start" data-testid="settings-try-tooltip">
            <button
              type="button"
              data-testid="settings-try"
              className="inline-flex min-h-11 cursor-default items-center gap-2 rounded-lg border border-dashed border-border px-3.5 text-[13px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-9"
            >
              <Eye size={15} aria-hidden="true" />
              {t('sdlg.try')}
            </button>
          </Tooltip>
        </div>
      </SettingsRow>
    </div>
  );
}
