'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAccountSettings } from '@/hooks/useAccountSettings';
import { useLocale, useT } from '@/i18n';
import { currenciesFromSymbols, effectiveCurrencies, isSoon, minutesUntil, nextEvent } from '@/lib/news';
import { cn } from '@/lib/utils';
import { useAccountStore } from '@/store/useAccountStore';
import { useConnectionStore } from '@/store/useConnectionStore';
import { useNewsStore } from '@/store/useNewsStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import NewsCard from './NewsCard';
import { useDuration } from './NewsRow';

/** Yönetim sayfaları: işlem sayfası değil, düğme gösterilmez (S0.5). */
const HIDDEN_PATHS = ['/vps', '/users'];
const POLL_MS = 60_000;
const PANEL_WIDTH = 332;

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function NewsButtonInner() {
  const t = useT();
  const locale = useLocale();
  const dur = useDuration();
  const nowMs = useNow(30_000);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selectedAccount = useAccountStore((s) => s.selectedAccount);
  const connected = useConnectionStore((s) => s.status === 'connected');
  const loadedAccount = useSettingsStore((s) => s.loadedAccount);
  const zones = useSettingsStore((s) => s.settings?.ZONES);
  const { filter, events, available, stale, failed, accountId } = useNewsStore();

  // Hesabın zone sembolleri (varsayılan para birimleri); ayarlar yoksa yüklenir
  const settingsError = useAccountSettings(selectedAccount, 'ifMissing');
  const settingsReady = !selectedAccount || (loadedAccount === selectedAccount && !!zones) || !!settingsError;
  const symbolsKey = (loadedAccount === selectedAccount ? (zones ?? []) : []).map((z) => z.symbol).join(',');
  const derived = useMemo(() => currenciesFromSymbols(symbolsKey ? symbolsKey.split(',') : []), [symbolsKey]);
  const ccys = effectiveCurrencies(filter, derived);
  const ccyKey = ccys.join(',');
  const ready = connected && accountId === selectedAccount && (filter.currencies !== null || settingsReady);

  useEffect(() => {
    useNewsStore.getState().loadFilter(selectedAccount);
  }, [selectedAccount]);

  const refresh = useCallback(() => useNewsStore.getState().fetchEvents({ lang: locale, currencies: ccyKey ? ccyKey.split(',') : [] }), [locale, ccyKey]);

  useEffect(() => {
    if (!ready) return;
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [ready, refresh, filter]);

  // Kart: üst-katman (popover) + sabit konum; nav'daki backdrop-filter fixed çocukları kendine bağlar
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const anchor = wrapRef.current;
    if (!open || !panel || !anchor) return;
    const place = () => {
      try {
        if (!panel.matches(':popover-open')) panel.showPopover();
      } catch {
        /* popover API yok: fixed kalır */
      }
      const a = anchor.getBoundingClientRect();
      const width = Math.min(PANEL_WIDTH, window.innerWidth - 16);
      const left = Math.max(8, Math.min(a.right - width, window.innerWidth - width - 8));
      const top = a.bottom + 8;
      panel.style.width = `${width}px`;
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.maxHeight = `${Math.max(160, Math.min(560, window.innerHeight - top - 8))}px`;
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!wrapRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role="tooltip"]')) return;
      e.preventDefault();
      setOpen(false);
      wrapRef.current?.querySelector('button')?.focus();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const next = connected && available && !failed ? nextEvent(events, nowMs) : null;
  const soon = !!next && isSoon(next, nowMs) && !stale;
  const dim = !connected || !available || failed || stale;
  const label = next ? `${next.currency ?? ''} ${dur(minutesUntil(next, nowMs))}` : t('news.button');

  return (
    <div className="relative shrink-0" ref={wrapRef} data-testid="news-wrap">
      <Button
        variant="outline"
        size="sm"
        hint={t('news.button.hint')}
        aria-label={t('news.button')}
        aria-expanded={open}
        data-testid="news-button"
        data-soon={soon ? 'true' : undefined}
        data-dim={dim ? 'true' : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'relative px-2 text-[11px] tabular-nums max-sm:size-7 max-sm:px-0 sm:px-2.5',
          soon && 'border-warning/55 bg-warning/15 text-warning hover:bg-warning/20',
          dim && 'text-muted-foreground opacity-70',
        )}
      >
        <CalendarClock size={15} aria-hidden="true" />
        <span className="hidden sm:inline" data-testid="news-button-label">{label}</span>
        {soon && <span data-testid="news-dot" className="absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-background bg-warning" />}
      </Button>
      {open && (
        <div
          ref={panelRef}
          popover="manual"
          role="dialog"
          aria-label={t('news.title')}
          data-testid="news-card"
          className="fixed inset-auto m-0 flex flex-col overflow-hidden rounded-xl border border-border bg-popover p-0 text-[11px] leading-snug text-popover-foreground shadow-[0_22px_56px_rgb(0_0_0/.42),0_4px_14px_rgb(0_0_0/.28)]"
        >
          <NewsCard nowMs={nowMs} connected={connected} derivedCurrencies={derived} onRetry={() => void refresh()} />
        </div>
      )}
    </div>
  );
}

export default function NewsButton() {
  const pathname = usePathname();
  if (HIDDEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  return <NewsButtonInner />;
}
