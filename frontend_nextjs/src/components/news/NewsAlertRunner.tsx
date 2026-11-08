'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { axiosInstance } from '@/lib/api';
import { useLocale } from '@/i18n';
import { useNewsCurrencies } from '@/hooks/useNewsCurrencies';
import { IMPACTS, type NewsEvent } from '@/lib/news';
import { MAX_ALERT_MINUTES, activeMinutes, dueNow, planAlerts, readShown, writeShown, type PlannedAlert, type ShownMap } from '@/lib/newsAlerts';
import { announceNews } from '@/lib/newsAlertNotify';
import { useConnectionStore } from '@/store/useConnectionStore';
import { useNewsStore } from '@/store/useNewsStore';

const LOCK_NAME = 'grid-news-alerts';
const REFRESH_MS = 60_000;
/** Pencerenin sonuna eklenen pay: en büyük uyarıdan biraz ötedeki haberler de planlanır */
const MARGIN_MS = 5 * 60_000;
/** Hesap değişiminde ayarın ve süzgecin oturması için bekleme */
const SETTLE_MS = 700;

/**
 * Haber uyarıları (NWS-03, plan 1107-A16 S3): app-genelinde çalışır (layout.tsx). Süzgeç ve uyarı ayarını yükler,
 * yaklaşan haberleri okur (gün süzgecinden bağımsız), her haber ve açık uyarı için tam ana zamanlayıcı kurar.
 * Yalnız Web Lock'u tutan sekme bildirir; diğer sekmeler beklemede kalır (FRM-30 ile aynı).
 */
export default function NewsAlertRunner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const locale = useLocale();
  const connected = useConnectionStore((s) => s.status === 'connected');
  const accountId = useNewsStore((s) => s.accountId);
  const alerts = useNewsStore((s) => s.alerts);
  const filter = useNewsStore((s) => s.filter);
  const { selectedAccount, accountsSettled, currenciesKey } = useNewsCurrencies();
  const [lockHeld, setHolding] = useState(false);
  // Web Locks yoksa (eski tarayıcı) sekme kendini tutan sayar
  const hasLocks = typeof navigator !== 'undefined' && !!navigator.locks;
  const holding = hasLocks ? lockHeld : true;

  useEffect(() => {
    useNewsStore.getState().loadFilter(selectedAccount);
  }, [selectedAccount]);

  const minutesKey = activeMinutes(alerts).join(',');
  const filterKey = `${filter.impacts.join(',')}|${currenciesKey}`;
  const active = connected && accountsSettled && accountId === selectedAccount && minutesKey !== '';

  // Bildirime tıklanınca (?news=<id>): kartı aç, adresi temizle
  const focusId = params.get('news');
  useEffect(() => {
    if (!focusId) return;
    useNewsStore.getState().requestFocus(focusId);
    router.replace(pathname);
  }, [focusId, pathname, router]);

  // Yalnız bir sekme bildirir
  useEffect(() => {
    if (!active || !hasLocks) return;
    const controller = new AbortController();
    let release: () => void = () => {};
    navigator.locks
      .request(`${LOCK_NAME}:${accountId}`, { signal: controller.signal }, () => {
        setHolding(true);
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      })
      .catch(() => {
        /* AbortError: sekme aktiflikten çıktı */
      });
    return () => {
      controller.abort();
      release();
      setHolding(false);
    };
  }, [active, accountId, hasLocks]);

  const shown = useRef<ShownMap | null>(null);

  useEffect(() => {
    if (!active || !holding) return;
    const mins = minutesKey.split(',').map(Number);
    const horizon = () => Date.now() + (Math.max(...mins) + 5) * 60_000;
    const impacts = IMPACTS.filter((i) => filter.impacts.includes(i));
    const currencies = currenciesKey ? currenciesKey.split(',') : [];
    let cancelled = false;
    let timers: ReturnType<typeof setTimeout>[] = [];

    const seen = (): ShownMap => (shown.current ??= readShown(Date.now()));
    const fire = (p: PlannedAlert) => {
      const map = seen();
      if (map[p.key]) return;
      const now = Date.now();
      if (Date.parse(p.event.time) <= now) return; // haber arada oldu
      map[p.key] = Date.parse(p.event.time);
      writeShown(map);
      announceNews(p, now, (url) => router.push(url));
    };
    const arm = (events: NewsEvent[]) => {
      timers.forEach(clearTimeout);
      timers = [];
      const now = Date.now();
      const limit = horizon();
      const planned = planAlerts(events.filter((e) => Date.parse(e.time) <= limit), mins, now).filter((p) => !seen()[p.key]);
      const { fire: due, skip } = dueNow(planned, now);
      const map = seen();
      for (const p of skip) map[p.key] = Date.parse(p.event.time);
      if (skip.length) writeShown(map);
      due.forEach(fire);
      for (const p of planned) {
        if (p.fireAt <= now) continue;
        timers.push(setTimeout(() => fire(p), p.fireAt - now));
      }
    };
    const load = async () => {
      if (!impacts.length || !currencies.length) return arm([]);
      const now = Date.now();
      try {
        const res = await axiosInstance.get('/news/events', {
          params: {
            from: new Date(now).toISOString(),
            to: new Date(now + MAX_ALERT_MINUTES * 60_000 + MARGIN_MS).toISOString(),
            impact: impacts.join(','),
            currencies: currencies.join(','),
            lang: locale,
          },
        });
        if (cancelled) return;
        const events: NewsEvent[] = res.data?.events ?? [];
        useNewsStore.getState().setAlertEvents(events);
        arm(events);
      } catch {
        /* worker yok: sonraki turda yeniden denenir, mevcut zamanlayıcılar kalır */
      }
    };
    const first = setTimeout(() => void load(), SETTLE_MS);
    const poll = setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(poll);
      timers.forEach(clearTimeout);
    };
  }, [active, holding, hasLocks, minutesKey, filterKey, currenciesKey, filter.impacts, locale, router]);

  return null;
}
