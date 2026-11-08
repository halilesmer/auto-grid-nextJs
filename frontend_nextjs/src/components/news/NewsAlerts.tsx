'use client';

import { useState } from 'react';
import { Bell, BellOff, CircleAlert, Settings2 } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { notificationPermission } from '@/lib/formation/alarmNotify';
import { MAX_ALERT_MINUTES, MIN_ALERT_MINUTES, activeMinutes, isValidMinutes, type NewsAlertSettings } from '@/lib/newsAlerts';
import { durationText } from '@/lib/newsAlertNotify';
import { cn } from '@/lib/utils';
import { useNewsStore } from '@/store/useNewsStore';

/** Kartın altındaki uyarı satırı ve ayar paneli (NWS-03, karar 1107-A16.9) */
export default function NewsAlerts() {
  const t = useT();
  const alerts = useNewsStore((s) => s.alerts);
  const setAlerts = useNewsStore((s) => s.setAlerts);
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [permission, setPermission] = useState(notificationPermission);

  const active = activeMinutes(alerts);
  const summary = active.length ? t('news.alert.summary', { list: active.map(durationText).join(' · ') }) : t('news.alert.off');

  const patch = (i: 0 | 1, change: Partial<NewsAlertSettings['alerts'][0]>) => {
    const next: NewsAlertSettings = { alerts: [alerts.alerts[0], alerts.alerts[1]] };
    next.alerts[i] = { ...next.alerts[i], ...change };
    setAlerts(next);
  };

  const toggle = async (i: 0 | 1) => {
    const on = !alerts.alerts[i].on;
    patch(i, { on });
    // Anahtar önce kaydedilir; tarayıcının izin sorusu açık kalsa da onu tutmaz (FRM-30 gibi)
    if (on && notificationPermission() === 'default') {
      await Notification.requestPermission();
      setPermission(notificationPermission());
    }
  };

  const change = (i: 0 | 1, raw: string) => {
    setDrafts((d) => ({ ...d, [i]: raw }));
    const value = raw.trim() === '' || !/^\d+$/.test(raw.trim()) ? NaN : Number(raw.trim());
    if (isValidMinutes(value)) patch(i, { minutes: value });
  };

  const anyOn = alerts.alerts.some((a) => a.on);
  const permNote = permission === 'granted' && !anyOn ? 'default' : permission;

  return (
    <div className="w-full border-t border-border" data-testid="news-notify">
      {open && (
        <div className="flex flex-col gap-1.5 bg-muted/55 px-2.5 pb-2.5 pt-1.5" data-testid="news-alerts-panel">
          {([0, 1] as const).map((i) => {
            const a = alerts.alerts[i];
            const draft = drafts[i];
            const shown = draft ?? String(a.minutes);
            const invalid = draft !== undefined && !(/^\d+$/.test(draft.trim()) && isValidMinutes(Number(draft.trim())));
            return (
              <div key={i} className="flex flex-col gap-0.5">
                <div className={cn('flex items-center gap-2 rounded-lg border bg-card px-2 py-1.5', a.on ? 'border-primary/55' : 'border-border')} data-testid={`news-alert-${i}`}>
                  <Tooltip content={t(`news.alert.switch.${i}.hint` as 'news.alert.switch.0.hint')}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={a.on}
                      aria-label={t('news.alert.name', { n: i + 1 })}
                      data-testid={`news-alert-switch-${i}`}
                      onClick={() => void toggle(i)}
                      className={cn(
                        'relative h-4 w-7 shrink-0 rounded-full border-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        a.on ? 'bg-primary' : 'bg-border',
                      )}
                    >
                      <span className={cn('absolute top-0.5 size-3 rounded-full bg-white transition-all', a.on ? 'left-3.5' : 'left-0.5')} />
                    </button>
                  </Tooltip>
                  <span className="min-w-0 text-[11px] font-semibold">{t('news.alert.name', { n: i + 1 })}</span>
                  <span className={cn('ml-auto flex items-center gap-1 whitespace-nowrap', !a.on && 'opacity-50')}>
                    <Tooltip content={t('news.alert.minutes.hint', { min: MIN_ALERT_MINUTES, max: MAX_ALERT_MINUTES })}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={shown}
                        aria-label={t('news.alert.minutes.aria', { n: i + 1 })}
                        aria-invalid={invalid}
                        data-testid={`news-alert-min-${i}`}
                        onChange={(e) => change(i, e.target.value)}
                        onBlur={() =>
                          setDrafts((d) => {
                            const next = { ...d };
                            delete next[i];
                            return next;
                          })
                        }
                        className={cn('w-12 rounded-md border bg-card px-1 py-px text-right font-mono text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', invalid ? 'border-danger' : 'border-border')}
                      />
                    </Tooltip>
                    <span>{t('news.notify.minutes')}</span>
                  </span>
                  <span className="min-w-[3.2rem] text-right text-[10px] tabular-nums text-muted-foreground" data-testid={`news-alert-eq-${i}`}>
                    {invalid ? '' : `= ${durationText(a.minutes)}`}
                  </span>
                </div>
                {invalid && <span className="text-[10px] text-danger" data-testid={`news-alert-error-${i}`}>{t('news.alert.invalid', { min: MIN_ALERT_MINUTES, max: MAX_ALERT_MINUTES })}</span>}
              </div>
            );
          })}
          <div
            data-testid="news-alerts-permission"
            data-state={permNote}
            className={cn('flex items-start gap-1.5 rounded-lg border p-1.5 text-[10px]', permNote === 'denied' || permNote === 'unsupported' ? 'border-warning/45 bg-warning/10' : 'border-border bg-card', 'text-muted-foreground')}
          >
            <span className={cn('mt-px flex', (permNote === 'denied' || permNote === 'unsupported') && 'text-warning', permNote === 'granted' && 'text-success')} aria-hidden="true">
              {permNote === 'denied' || permNote === 'unsupported' ? <CircleAlert size={13} /> : <Bell size={13} />}
            </span>
            <span>{t(`news.alert.perm.${permNote}` as 'news.alert.perm.default')}</span>
          </div>
          <span className="text-[10px] text-muted-foreground">{t('news.alert.scope')}</span>
        </div>
      )}
      <div className={cn('flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[10px]', active.length ? 'text-foreground' : 'text-muted-foreground')}>
        {active.length ? <Bell size={11} className="text-primary" aria-hidden="true" /> : <BellOff size={11} aria-hidden="true" />}
        <span className="truncate">{t('news.notify')}</span>
        <span className={cn('ml-auto whitespace-nowrap tabular-nums', active.length ? 'font-semibold' : 'text-muted-foreground')} data-testid="news-notify-summary">{summary}</span>
        <Tooltip content={t('news.alert.settings.hint')}>
          <button
            type="button"
            aria-expanded={open}
            aria-label={t('news.alert.settings')}
            data-testid="news-notify-settings"
            onClick={() => setOpen((o) => !o)}
            className={cn('inline-flex size-[22px] shrink-0 items-center justify-center rounded-md border border-border bg-card hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', open && 'bg-accent')}
          >
            <Settings2 size={12} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
