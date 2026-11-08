'use client';

import { useState, type ReactNode } from 'react';
import { CircleAlert, Info, WifiOff } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { useFormat, useT, type MessageKey } from '@/i18n';
import {
  IMPACTS, KNOWN_CURRENCIES, RANGE_DAYS, SINGLE_DAYS, effectiveCurrencies, isRange, toggleDay, toggleImpact,
  type NewsDay, type NewsEvent,
} from '@/lib/news';
import { cn } from '@/lib/utils';
import { useConnectionDialogStore } from '@/store/useConnectionDialogStore';
import { useNewsStore } from '@/store/useNewsStore';
import NewsAlerts from './NewsAlerts';
import NewsRow from './NewsRow';

function Toggle({ pressed, disabled, hint, label, testid, onClick, dot }: {
  pressed: boolean; disabled?: boolean; hint: string; label: string; testid: string; onClick: () => void; dot?: string;
}) {
  return (
    <Tooltip content={hint}>
      <button
        type="button"
        data-testid={testid}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-1 rounded-md border px-1.5 text-[10px] leading-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40',
          pressed ? 'border-primary bg-primary/10 font-semibold text-foreground' : 'border-border bg-card text-muted-foreground hover:bg-accent',
        )}
      >
        {dot && <span className={cn('size-1.5 rounded-full', dot)} aria-hidden="true" />}
        {label}
      </button>
    </Tooltip>
  );
}

function LinkButton({ hint, label, testid, onClick, expanded }: { hint: string; label: string; testid: string; onClick: () => void; expanded?: boolean }) {
  return (
    <Tooltip content={hint}>
      <button
        type="button"
        data-testid={testid}
        aria-expanded={expanded}
        onClick={onClick}
        className="whitespace-nowrap text-[10px] text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
      </button>
    </Tooltip>
  );
}

function Note({ tone = 'info', icon, title, body, action }: { tone?: 'info' | 'warn'; icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className={cn('mx-2.5 my-2 flex items-start gap-2 rounded-lg border p-2', tone === 'warn' ? 'border-warning/40 bg-warning/10' : 'border-border bg-muted')}>
      <span className={cn('mt-0.5 flex', tone === 'warn' ? 'text-warning' : 'text-muted-foreground')} aria-hidden="true">{icon}</span>
      <div className="min-w-0 flex-1">
        <b className="block">{title}</b>
        <span className="text-[10.5px] text-muted-foreground">{body}</span>
      </div>
      {action}
    </div>
  );
}

function PillButton({ label, hint, testid, onClick }: { label: string; hint: string; testid: string; onClick: () => void }) {
  return (
    <Tooltip content={hint}>
      <button type="button" data-testid={testid} onClick={onClick} className="whitespace-nowrap rounded-md border border-border px-2 py-0.5 text-[10.5px] font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {label}
      </button>
    </Tooltip>
  );
}

interface Props {
  nowMs: number;
  connected: boolean;
  derivedCurrencies: string[];
  onRetry: () => void;
}

export default function NewsCard({ nowMs, connected, derivedCurrencies, onRetry }: Props) {
  const t = useT();
  const f = useFormat();
  const { filter, events: filtered, alertEvents, focusRequest, available, stale, loaded, failed, savedVisible, setFilter } = useNewsStore();
  const [ccyOpen, setCcyOpen] = useState(false);

  const ccys = effectiveCurrencies(filter, derivedCurrencies);
  const ccyList = Array.from(new Set([...KNOWN_CURRENCIES, ...ccys]));
  const rangeOn = filter.days.some(isRange);
  const noSource = connected && loaded && (failed || !available);

  // Bildirimden gelen haber süzgece uymasa da kartta görünür (gün süzgeci uyarıyı sınırlamaz)
  const focusId = focusRequest ? String(focusRequest.id) : null;
  const pinned = focusId && !filtered.some((e) => String(e.id) === focusId) ? alertEvents.find((e) => String(e.id) === focusId) : undefined;
  const events = pinned ? [...filtered, pinned].sort((a, b) => Date.parse(a.time) - Date.parse(b.time)) : filtered;

  const groups: { key: string; label: string; items: NewsEvent[] }[] = [];
  for (const e of events) {
    const d = new Date(e.time);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(new Date(nowMs).getFullYear(), new Date(nowMs).getMonth(), new Date(nowMs).getDate()).getTime()) / 86_400_000);
      g = { key, label: diff >= -1 && diff <= 1 ? t(`news.day.d${diff}` as MessageKey) : f.dayLabel(d), items: [] };
      groups.push(g);
    }
    g.items.push(e);
  }

  let body: ReactNode;
  if (noSource) {
    body = (
      <Note tone="warn" icon={<CircleAlert size={15} />} title={t('news.state.nosource.title')} body={t('news.state.nosource.body')}
        action={<PillButton label={t('news.state.retry')} hint={t('news.state.retry.hint')} testid="news-retry" onClick={onRetry} />} />
    );
  } else if (!loaded) {
    body = <p className="px-2.5 py-3 text-muted-foreground">{t('news.state.loading')}</p>;
  } else {
    body = (
      <>
        {stale && <Note tone="warn" icon={<CircleAlert size={15} />} title={t('news.state.stale.title')} body={t('news.state.stale.body')} />}
        {events.length === 0 ? (
          <Note icon={<Info size={15} />} title={t('news.state.empty.title')} body={t('news.state.empty.body')} />
        ) : (
          <div role="list" aria-label={t('news.list')} data-testid="news-list" className={cn('min-h-[60px] overflow-y-auto py-0.5', stale && 'opacity-60')}>
            {groups.map((g) => (
              <div key={g.key} data-testid="news-day-group">
                <div className="sticky top-0 z-[1] bg-popover px-2.5 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</div>
                {g.items.map((e) => <NewsRow key={e.id ?? e.time + e.title} event={e} nowMs={nowMs} focused={focusId !== null && String(e.id) === focusId} />)}
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  const header = (
    <div className="flex flex-wrap items-center gap-1.5 px-2.5 pb-1.5 pt-2">
      <b className="text-xs">{t('news.title')}</b>
      {connected && (
        <Tooltip content={t('news.source.hint')}>
          <span tabIndex={0} className="rounded-md border border-border bg-muted px-1.5 text-[10px] leading-4 text-muted-foreground">{t('news.source')}</span>
        </Tooltip>
      )}
      <span className="flex-1" />
      {savedVisible && (
        <Tooltip content={t(savedVisible === 'worker' ? 'news.saved.hint' : 'news.savedLocal.hint')}>
          <span tabIndex={0} data-testid="news-saved" data-kind={savedVisible}
            className={cn('rounded-md border px-1.5 text-[10px] leading-4', savedVisible === 'worker' ? 'border-success/40 bg-success/10 text-success' : 'border-warning/40 bg-warning/10 text-warning')}>
            {savedVisible === 'worker' ? '✓ ' : ''}{t(savedVisible === 'worker' ? 'news.saved' : 'news.savedLocal')}
          </span>
        </Tooltip>
      )}
    </div>
  );

  if (!connected) {
    return (
      <>
        {header}
        <Note icon={<WifiOff size={15} />} title={t('news.state.offline.title')} body={t('news.state.offline.body')}
          action={<PillButton label={t('news.state.connect')} hint={t('news.state.connect.hint')} testid="news-connect" onClick={() => useConnectionDialogStore.getState().show()} />} />
      </>
    );
  }

  return (
    <>
      {header}
      <div className="flex flex-col gap-1.5 border-b border-border px-2.5 pb-2" data-testid="news-filters">
        <div className="flex items-center gap-1.5">
          <span className="w-14 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{t('news.imp.label')}</span>
          <div className="flex flex-1 flex-wrap gap-1">
            {IMPACTS.map((i) => (
              <Toggle key={i} testid={`news-imp-${i}`} pressed={filter.impacts.includes(i)} label={t(`news.imp.${i}` as MessageKey)} hint={t(`news.imp.${i}.hint` as MessageKey)}
                dot={{ high: 'bg-danger', moderate: 'bg-warning', low: 'bg-muted-foreground' }[i]} onClick={() => setFilter(toggleImpact(filter, i))} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-14 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{t('news.day.label')}</span>
          <div className="flex flex-1 flex-wrap gap-1">
            {[...SINGLE_DAYS, ...RANGE_DAYS].map((d: NewsDay) => (
              <Toggle key={d} testid={`news-day-${d}`} pressed={filter.days.includes(d)} disabled={rangeOn && !isRange(d)}
                label={t(`news.day.${d}` as MessageKey)} hint={t(`news.day.${d}.hint` as MessageKey)} onClick={() => setFilter(toggleDay(filter, d))} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-14 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{t('news.ccy.label')}</span>
          <Tooltip content={t('news.ccy.summary.hint')} className="min-w-0 flex-1">
            <span tabIndex={0} data-testid="news-ccy-summary" className="min-w-0 flex-1 truncate font-mono text-[10px] font-semibold text-muted-foreground">{ccys.join(' ') || '–'}</span>
          </Tooltip>
          <LinkButton testid="news-ccy-edit" expanded={ccyOpen} label={t(ccyOpen ? 'news.ccy.done' : 'news.ccy.edit')} hint={t('news.ccy.edit.hint')} onClick={() => setCcyOpen((o) => !o)} />
        </div>
        {ccyOpen && (
          <>
            <div className="grid grid-cols-5 gap-1" data-testid="news-ccy-list">
              {ccyList.map((c) => (
                <Toggle key={c} testid={`news-ccy-${c}`} pressed={ccys.includes(c)} label={c} hint={t('news.ccy.item.hint')}
                  onClick={() => setFilter({ ...filter, currencies: ccys.includes(c) ? ccys.filter((x) => x !== c) : [...ccys, c] })} />
              ))}
            </div>
            <div className="flex flex-wrap gap-3 pl-[3.875rem]">
              <LinkButton testid="news-ccy-all" label={t('news.ccy.all')} hint={t('news.ccy.all.hint')} onClick={() => setFilter({ ...filter, currencies: ccyList })} />
              <LinkButton testid="news-ccy-clear" label={t('news.ccy.clear')} hint={t('news.ccy.clear.hint')} onClick={() => setFilter({ ...filter, currencies: [] })} />
              <LinkButton testid="news-ccy-fill" label={t('news.ccy.fill')} hint={t('news.ccy.fill.hint')} onClick={() => setFilter({ ...filter, currencies: derivedCurrencies.length ? derivedCurrencies : KNOWN_CURRENCIES })} />
            </div>
          </>
        )}
      </div>

      {body}

      <NewsAlerts />
    </>
  );
}
