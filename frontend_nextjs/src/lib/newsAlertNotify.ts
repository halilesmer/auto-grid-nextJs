/**
 * Haber uyarısının bildirimi (NWS-03): uygulama içi kart + izin varsa sistem bildirimi.
 * Yol FRM-30 ile aynı: `showSystem` (registration.showNotification, tag + data.url), tıklamayı service-worker.js
 * 'formation-alarm-open' mesajıyla uygulamaya iletir (FormationScanRunner → router.push).
 */
import { toast } from '@/components/ui/animated-toast';
import { makeFormatters, t } from '@/i18n';
import { notificationPermission, showSystem } from '@/lib/formation/alarmNotify';
import { useLocaleStore } from '@/store/useLocaleStore';
import { timeModeOf, type NewsEvent } from './news';
import type { PlannedAlert } from './newsAlerts';

/** Bildirime tıklayınca açılan adres: ana sayfa; NewsAlertRunner `news` parametresini okuyup kartı açar. */
export const newsUrl = (event: Pick<NewsEvent, 'id' | 'event_code'>) => `/?news=${encodeURIComponent(String(event.id ?? event.event_code ?? ''))}`;

/** 90 → "1 sa 30 dk" (kartın satırlarıyla aynı biçim) */
export function durationText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  if (!h) return t('news.dur.m', { m });
  return m % 60 && h < 24 ? `${t('news.dur.h', { h })} ${t('news.dur.m', { m: m % 60 })}` : t('news.dur.h', { h });
}

export function announceNews(planned: PlannedAlert, nowMs: number, navigate: (url: string) => void) {
  const { event } = planned;
  if (timeModeOf(event) !== 'time') return;
  const format = makeFormatters(useLocaleStore.getState().locale);
  const left = Math.max(1, Math.round((Date.parse(event.time) - nowMs) / 60_000));
  const title = [event.currency, event.title].filter(Boolean).join(' · ');
  const body = t('news.alert.body', { t: durationText(left), time: format.clock(event.time) });
  const url = newsUrl(event);
  toast.warning(body, { title, duration: 10_000, action: { label: t('news.alert.show'), hint: t('news.alert.show.hint'), onClick: () => navigate(url) } });
  if (notificationPermission() === 'granted') void showSystem(title, body, planned.key, url);
}
