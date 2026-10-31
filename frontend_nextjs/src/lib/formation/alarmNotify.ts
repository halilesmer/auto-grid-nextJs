/**
 * Meldungen des Formationsalarms: Karte in der App, Systemmeldung über den Service Worker und Ton.
 * Die Systemmeldung läuft über `registration.showNotification`, weil `new Notification` auf Android nicht geht.
 * Ein Klick darauf wird im Service Worker (public/service-worker.js) behandelt und führt zur Adresse in `data.url`.
 */
import { toast } from '@/components/ui/animated-toast';
import { t, type MessageKey } from '@/i18n';
import type { AlarmNotice } from './alarm';
import type { AlarmPrefs } from './alarmStore';
import { FINAL_POINT } from './scan';

/** Ab so vielen Meldungen in einem Durchlauf kommt eine Sammelmeldung statt einer Karte je Treffer */
export const MAX_SINGLE_NOTICES = 3;
/** Wie viele Produktnamen die Sammelmeldung nennt */
const NAMED_SYMBOLS = 3;

export const notificationPermission = (): NotificationPermission | 'unsupported' => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

/** Adresse auf /formasyon: mit Notice zeigt sie Produkt, Formation und Zeiteinheit, ohne nur die Seite des Kontos */
export function formationUrl(accountId: string, notice?: AlarmNotice): string {
  const params = new URLSearchParams({ account: accountId });
  if (notice) {
    params.set('symbol', notice.symbol);
    params.set('form', notice.form);
    params.set('tf', notice.tf);
  }
  return `/formasyon?${params.toString()}`;
}

function eventKey(notice: AlarmNotice, prefix: 'notice' | 'system'): MessageKey {
  const name = notice.events.length === 2 ? 'both' : notice.events[0];
  return `formation.alarm.${prefix}.${name}` as MessageKey;
}

function describe(notice: AlarmNotice) {
  return {
    form: t(`formation.form.${notice.form}` as MessageKey),
    side: t(`formation.side.${notice.side}` as MessageKey),
    symbol: notice.symbol,
    tf: notice.tf,
    point: FINAL_POINT[notice.form],
  };
}

function beep() {
  try {
    const context = new AudioContext();
    const tone = context.createOscillator();
    tone.connect(context.destination);
    tone.frequency.value = 880;
    tone.start();
    tone.stop(context.currentTime + 0.25);
    tone.onended = () => void context.close();
  } catch (error) {
    // Ohne Nutzergeste oder Audio-Unterstützung bleibt der Ton aus; die Meldung selbst erscheint trotzdem
    console.warn('formation alarm: sound not played', error);
  }
}

async function showSystem(title: string, body: string, tag: string, url: string) {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    // renotify: derselbe Treffer meldet erst „gültig“, später den Zielpunkt; ohne renotify bliebe die zweite Meldung still (fehlt in den TS-DOM-Typen)
    await registration?.showNotification(title, { body, tag, data: { url }, icon: '/icon-192.png', renotify: true } as NotificationOptions);
  } catch (error) {
    // Die Karte in der App ist schon da; eine fehlgeschlagene Systemmeldung darf den Durchlauf nicht stoppen
    console.warn('formation alarm: system notification not shown', error);
  }
}

interface Line {
  title: string;
  body: string;
  tag: string;
  url: string;
  kind: 'success' | 'warning' | 'info';
  /** Knopf auf der Karte; fehlt bei der Sammelmeldung */
  action: { label: string; hint: string } | null;
}

function lines(accountId: string, notices: AlarmNotice[], sinceOpening: boolean): Line[] {
  const overview = formationUrl(accountId);
  if (sinceOpening) {
    const count = notices.length;
    return [{ title: t('formation.alarm.notice.since', { count }), body: summarySymbols(notices), tag: 'formation-alarm-since', url: overview, kind: 'info', action: { label: t('formation.alarm.openFavorites'), hint: t('formation.alarm.openFavorites.hint') } }];
  }
  if (notices.length > MAX_SINGLE_NOTICES) {
    return [{ title: t('formation.alarm.notice.many', { count: notices.length }), body: summarySymbols(notices), tag: 'formation-alarm-many', url: overview, kind: 'success', action: null }];
  }
  return notices.map((notice) => ({
    title: t(eventKey(notice, 'notice'), describe(notice)),
    body: t('formation.alarm.system.detail', describe(notice)),
    tag: notice.key,
    url: formationUrl(accountId, notice),
    kind: notice.events.includes('valid') ? 'success' : 'warning',
    action: { label: t('formation.alarm.show'), hint: t('formation.alarm.show.hint') },
  }));
}

function summarySymbols(notices: AlarmNotice[]): string {
  const symbols = [...new Set(notices.map((notice) => notice.symbol))];
  const named = symbols.slice(0, NAMED_SYMBOLS).join(', ');
  return symbols.length > NAMED_SYMBOLS ? t('formation.alarm.notice.more', { symbols: named }) : named;
}

/** Titel der Systemmeldung: bei einem einzelnen Treffer nach Ereignis und Produkt, sonst wie die Karte */
function systemTitle(notice: AlarmNotice | undefined, line: Line): string {
  return notice ? t(eventKey(notice, 'system'), { symbol: notice.symbol }) : line.title;
}

export function announce(accountId: string, notices: AlarmNotice[], options: { sinceOpening: boolean; prefs: AlarmPrefs; navigate: (url: string) => void }) {
  if (notices.length === 0) return;
  const { sinceOpening, prefs, navigate } = options;
  const single = !sinceOpening && notices.length <= MAX_SINGLE_NOTICES;
  const system = prefs.system && notificationPermission() === 'granted';
  for (const [i, line] of lines(accountId, notices, sinceOpening).entries()) {
    toast[line.kind](line.title, { duration: 10_000, action: line.action ? { ...line.action, onClick: () => navigate(line.url) } : undefined });
    if (system) void showSystem(systemTitle(single ? notices[i] : undefined, line), line.body, line.tag, line.url);
  }
  if (prefs.sound) beep();
}
