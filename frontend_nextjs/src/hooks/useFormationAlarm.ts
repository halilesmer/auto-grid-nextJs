'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { toast } from '@/components/ui/animated-toast';
import { t, type MessageKey } from '@/i18n';
import { evaluateAlarm, type AlarmEvent, type AlarmNotice } from '@/lib/formation/alarm';
import { save, serverSnapshot, snapshot, subscribe, type AlarmPrefs, type Stored } from '@/lib/formation/alarmStore';
import { FINAL_POINT, SCAN_FORMATIONS, type ScanFormation } from '@/lib/formation/scan';
import type { FormationScan } from '@/hooks/useFormationScan';

/** Ab so vielen Meldungen in einem Lauf kommt eine Sammelmeldung statt einer Karte je Treffer */
const MAX_SINGLE_NOTICES = 3;

const notificationPermission = (): NotificationPermission | 'unsupported' => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
const noSubscription = () => () => {};

function noticeText(notice: AlarmNotice, symbol: string): { title: string; kind: 'success' | 'warning' } {
  const both = notice.events.length === 2;
  const key = (both ? 'formation.alarm.notice.both' : `formation.alarm.notice.${notice.events[0]}`) as MessageKey;
  const title = t(key, {
    form: t(`formation.form.${notice.form}` as MessageKey),
    side: t(`formation.side.${notice.side}` as MessageKey),
    symbol,
    tf: notice.tf,
    point: FINAL_POINT[notice.form],
  });
  return { title, kind: notice.events.includes('valid') ? 'success' : 'warning' };
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

function announce(notices: AlarmNotice[], symbol: string, prefs: AlarmPrefs, show: (notice: AlarmNotice) => void) {
  // Die Sammelmeldung gehört zu keinem einzelnen Treffer und hat deshalb keinen Anzeigen-Knopf
  const lines = notices.length > MAX_SINGLE_NOTICES
    ? [{ title: t('formation.alarm.notice.many', { symbol, count: notices.length }), kind: 'success' as const, notice: null }]
    : notices.map((notice) => ({ ...noticeText(notice, symbol), notice }));
  for (const { title, kind, notice } of lines) {
    const action = notice && { label: t('formation.alarm.show'), hint: t('formation.alarm.show.hint'), onClick: () => show(notice) };
    toast[kind](title, { duration: 10_000, action: action ?? undefined });
    if (prefs.system && notificationPermission() === 'granted') new Notification(title, { tag: `formation-alarm-${title}` });
  }
  if (prefs.sound) beep();
}

/**
 * Formationsalarm der Seite /formasyon: vergleicht jeden fertigen Suchlauf mit dem gemerkten Stand (alarm.ts) und meldet.
 * Läuft nur, solange die Seite offen ist. Der erste Lauf nach Einschalten, Öffnen oder Symbolwechsel merkt den Stand still.
 */
export function useFormationAlarm(accountId: string | null, symbol: string | null, scan: FormationScan, onShow: (notice: AlarmNotice) => void) {
  const stored = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const permission = useSyncExternalStore(noSubscription, notificationPermission, () => 'unsupported' as const);
  const scope = accountId && symbol ? `${accountId}|${symbol}` : null;
  const enabled = scope !== null && stored.enabled.includes(scope);

  // Die Meldung bleibt 10 s stehen: der Klick ruft den jeweils neuesten Stand der Seite auf, nicht den beim Anzeigen
  const show = useRef(onShow);
  useEffect(() => {
    show.current = onShow;
  });

  const lastScope = useRef<string | null>(null);
  const processed = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || scope === null || !symbol) {
      lastScope.current = null;
      return;
    }
    if (scan.loading || scan.error || scan.scanAt === null) return;
    const run = `${scope}|${scan.scanAt}`;
    if (processed.current === run) return;
    processed.current = run;
    const baseline = lastScope.current !== scope;
    lastScope.current = scope;
    const current = snapshot();
    const result = evaluateAlarm(symbol, scan.hits, current.memory[scope] ?? {}, current.prefs, baseline);
    save({ ...current, memory: { ...current.memory, [scope]: result.memory } });
    if (result.notices.length > 0) announce(result.notices, symbol, current.prefs, (notice) => show.current(notice));
  }, [enabled, scope, symbol, scan.loading, scan.error, scan.scanAt, scan.hits]);

  const update = useCallback((change: (current: Stored) => Stored) => save(change(snapshot())), []);
  const setEnabled = useCallback(
    (on: boolean) => {
      if (scope === null) return;
      update((current) => ({ ...current, enabled: on ? [...current.enabled.filter((x) => x !== scope), scope] : current.enabled.filter((x) => x !== scope) }));
      if (on && symbol) toast.info(t('formation.alarm.enabled', { symbol }), { duration: 6000 });
    },
    [scope, symbol, update],
  );
  const setEvent = useCallback((event: AlarmEvent, on: boolean) => update((current) => ({ ...current, prefs: { ...current.prefs, events: { ...current.prefs.events, [event]: on } } })), [update]);
  const setForm = useCallback(
    (form: ScanFormation, on: boolean) =>
      update((current) => ({ ...current, prefs: { ...current.prefs, forms: SCAN_FORMATIONS.filter((x) => (x === form ? on : current.prefs.forms.includes(x))) } })),
    [update],
  );
  const setSound = useCallback((on: boolean) => update((current) => ({ ...current, prefs: { ...current.prefs, sound: on } })), [update]);
  const setSystem = useCallback(
    async (on: boolean) => {
      if (on && notificationPermission() === 'default') await Notification.requestPermission();
      update((current) => ({ ...current, prefs: { ...current.prefs, system: on } }));
    },
    [update],
  );

  return { prefs: stored.prefs, enabled, permission, setEnabled, setEvent, setForm, setSound, setSystem };
}
