'use client';

import { useState } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { SwitchToggle } from '@/components/ui/switch';
import { useT, type MessageKey } from '@/i18n';
import { notificationPermission } from '@/lib/formation/alarmNotify';
import { IMPACTS, KNOWN_CURRENCIES, toggleImpact } from '@/lib/news';
import { MAX_ALERT_MINUTES, MIN_ALERT_MINUTES, isValidMinutes, type NewsAlertSettings } from '@/lib/newsAlerts';
import { TOAST_SECONDS, type ToastSeconds } from '@/lib/userPrefs';
import { cn } from '@/lib/utils';
import { useNewsCurrencies } from '@/hooks/useNewsCurrencies';
import { useNewsStore } from '@/store/useNewsStore';
import { useUserPrefsStore } from '@/store/useUserPrefsStore';
import { useToastSeconds } from '@/store/useToastPrefsStore';
import { ChipToggle, Segmented, SettingsRow } from './parts';

export type NotificationsTab = 'general' | 'alerts' | 'filter';
export const NOTIFICATION_TABS: NotificationsTab[] = ['general', 'alerts', 'filter'];

export default function NotificationsSection({ tab }: { tab: NotificationsTab }) {
  return (
    <div data-testid="settings-notifications" data-tab={tab}>
      {tab === 'general' && <GeneralTab />}
      {tab === 'alerts' && <AlertsTab />}
      {tab === 'filter' && <FilterTab />}
    </div>
  );
}

function GeneralTab() {
  const t = useT();
  const seconds = useToastSeconds();
  const change = useUserPrefsStore((s) => s.change);
  const text = (s: ToastSeconds) => (s === 0 ? t('sdlg.toast.until') : t('sdlg.toast.sec', { n: s }));
  return (
    <SettingsRow label={t('sdlg.toast')} desc={t('sdlg.toast.desc')} prefKey="toast_duration" isNew testId="row-toast">
      <Segmented<string>
        ariaLabel={t('sdlg.toast')}
        testId="settings-toast"
        value={String(seconds)}
        onChange={(v) => void change('toast_duration', { seconds: Number(v) }, () => ({ name: t('sdlg.toast'), value: text(Number(v) as ToastSeconds) }))}
        options={TOAST_SECONDS.map((s) => ({ value: String(s), label: text(s), hint: t(s === 0 ? 'sdlg.toast.until.hint' : 'sdlg.toast.sec.hint', { n: s }) }))}
      />
    </SettingsRow>
  );
}

function AlertsTab() {
  const t = useT();
  const alerts = useNewsStore((s) => s.alerts);
  const setAlerts = useNewsStore((s) => s.setAlerts);
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  const patch = (i: 0 | 1, change: Partial<NewsAlertSettings['alerts'][0]>) => {
    const next: NewsAlertSettings = { alerts: [alerts.alerts[0], alerts.alerts[1]] };
    next.alerts[i] = { ...next.alerts[i], ...change };
    setAlerts(next);
  };
  const toggle = async (i: 0 | 1) => {
    const on = !alerts.alerts[i].on;
    patch(i, { on });
    // Anahtar önce kaydedilir; tarayıcının izin sorusu açık kalsa da onu tutmaz
    if (on && notificationPermission() === 'default') await Notification.requestPermission();
  };
  const commit = (i: 0 | 1) => {
    const raw = (drafts[i] ?? '').trim();
    const value = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (isValidMinutes(value) && value !== alerts.alerts[i].minutes) patch(i, { minutes: value });
    setDrafts((d) => {
      const next = { ...d };
      delete next[i];
      return next;
    });
  };

  return (
    <>
      {([0, 1] as const).map((i) => {
        const a = alerts.alerts[i];
        const draft = drafts[i];
        const invalid = draft !== undefined && !(/^\d+$/.test(draft.trim()) && isValidMinutes(Number(draft.trim())));
        return (
          <SettingsRow key={i} label={t('news.alert.name', { n: i + 1 })} desc={t('sdlg.alert.desc')} prefKey="news_alerts" testId={`row-alert-${i}`}>
            <div className="flex flex-wrap items-center gap-3">
              <Tooltip content={t(`news.alert.switch.${i}.hint` as MessageKey)}>
                <span className="-m-2.5 inline-flex p-2.5">
                  <SwitchToggle checked={a.on} onChange={() => void toggle(i)} ariaLabel={t('news.alert.name', { n: i + 1 })} />
                </span>
              </Tooltip>
              <Tooltip content={t('news.alert.minutes.hint', { min: MIN_ALERT_MINUTES, max: MAX_ALERT_MINUTES })}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={draft ?? String(a.minutes)}
                  aria-label={t('news.alert.minutes.aria', { n: i + 1 })}
                  aria-invalid={invalid || undefined}
                  data-testid={`settings-alert-min-${i}`}
                  onChange={(e) => setDrafts((d) => ({ ...d, [i]: e.target.value }))}
                  onBlur={() => commit(i)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commit(i);
                    }
                  }}
                  className={cn(
                    'h-11 w-20 rounded-lg border bg-background px-3 text-right text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-10',
                    invalid ? 'border-danger' : 'border-border',
                    !a.on && 'opacity-60',
                  )}
                />
              </Tooltip>
              <span className="text-sm text-muted-foreground">{t('sdlg.alert.before')}</span>
            </div>
            {invalid && (
              <span className="mt-1.5 block text-xs text-danger" data-testid={`settings-alert-error-${i}`}>
                {t('news.alert.invalid', { min: MIN_ALERT_MINUTES, max: MAX_ALERT_MINUTES })}
              </span>
            )}
          </SettingsRow>
        );
      })}
    </>
  );
}

function FilterTab() {
  const t = useT();
  const filter = useNewsStore((s) => s.filter);
  const setFilter = useNewsStore((s) => s.setFilter);
  const { currencies, derived } = useNewsCurrencies();
  return (
    <>
      <SettingsRow label={t('sdlg.nf.impact')} desc={t('sdlg.nf.impact.desc')} prefKey="news_filter" testId="row-news-impact">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('sdlg.nf.impact')}>
          {IMPACTS.map((i) => (
            <ChipToggle
              key={i}
              testId={`settings-imp-${i}`}
              pressed={filter.impacts.includes(i)}
              label={t(`news.imp.${i}` as MessageKey)}
              hint={t(`news.imp.${i}.hint` as MessageKey)}
              onClick={() => setFilter(toggleImpact(filter, i))}
            />
          ))}
        </div>
      </SettingsRow>
      <SettingsRow label={t('sdlg.nf.ccy')} desc={t('sdlg.nf.ccy.desc')} prefKey="news_filter" testId="row-news-ccy">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('sdlg.nf.ccy')}>
            {KNOWN_CURRENCIES.map((c) => (
              <ChipToggle
                key={c}
                testId={`settings-ccy-${c}`}
                pressed={currencies.includes(c)}
                label={c}
                hint={t('news.ccy.item.hint')}
                onClick={() => setFilter({ ...filter, currencies: currencies.includes(c) ? currencies.filter((x) => x !== c) : [...currencies, c] })}
              />
            ))}
          </div>
          <Tooltip content={t('news.ccy.fill.hint')} className="self-start">
            <button
              type="button"
              data-testid="settings-ccy-fill"
              onClick={() => setFilter({ ...filter, currencies: derived.length ? derived : KNOWN_CURRENCIES })}
              className="min-h-11 cursor-pointer text-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-9"
            >
              {t('news.ccy.fill')}
            </button>
          </Tooltip>
        </div>
      </SettingsRow>
    </>
  );
}
