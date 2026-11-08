'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { useFormat, useT, type MessageKey } from '@/i18n';
import { arrowOf, formatNewsValue, isSoon, minutesUntil, sectorKey, timeModeOf, type NewsEvent } from '@/lib/news';
import { cn } from '@/lib/utils';

const BARS: Record<string, { n: number; tone: string; key: MessageKey }> = {
  high: { n: 3, tone: 'bg-danger', key: 'news.impact.high' },
  moderate: { n: 2, tone: 'bg-warning', key: 'news.impact.moderate' },
  low: { n: 1, tone: 'bg-muted-foreground', key: 'news.impact.low' },
};

/** 90 dk → "1 sa 30 dk"; 24 saati aşan süreler yalnız saat. */
export function useDuration() {
  const t = useT();
  return (minutes: number) => {
    const m = Math.abs(minutes);
    const h = Math.floor(m / 60);
    if (!h) return t('news.dur.m', { m });
    return m % 60 && h < 24 ? `${t('news.dur.h', { h })} ${t('news.dur.m', { m: m % 60 })}` : t('news.dur.h', { h });
  };
}

export default function NewsRow({ event: e, nowMs }: { event: NewsEvent; nowMs: number }) {
  const t = useT();
  const f = useFormat();
  const dur = useDuration();
  const mode = timeModeOf(e);
  const minutes = minutesUntil(e, nowMs);
  const past = Date.parse(e.time) < nowMs;
  const soon = isSoon(e, nowMs);
  const bars = BARS[e.importance ?? ''];
  const arrow = arrowOf(e);
  const ccy = e.currency ?? '';
  const fmt = (v: number | null) => formatNewsValue(v, e, f.number);

  let arrowHint = '';
  if (arrow) {
    const good = arrow.dir === 'up';
    const sector = sectorKey(e.sector);
    const comment = sector
      ? `\n${t('news.comment', { x: t(`news.sector.${sector}.${good ? 'good' : 'bad'}` as MessageKey), c: ccy, tone: t(good ? 'news.tone.good' : 'news.tone.bad') })}`
      : '';
    if (arrow.released) {
      const imp = t(good ? 'news.arrow.positive' : 'news.arrow.negative');
      arrowHint = e.forecast != null
        ? t('news.arrow.post', { c: ccy, imp, a: fmt(e.actual) ?? '–', f: fmt(e.forecast) ?? '–' })
        : t('news.arrow.post.nofc', { c: ccy, imp, a: fmt(e.actual) ?? '–' });
    } else if (e.forecast != null && e.prev != null) {
      arrowHint = t('news.arrow.pre', { f: fmt(e.forecast) ?? '–', p: fmt(e.prev) ?? '–', cmp: t(e.forecast > e.prev ? 'news.cmp.higher' : 'news.cmp.lower') });
    } else {
      arrowHint = t('news.arrow.pre.noval');
    }
    arrowHint += comment;
  }

  const timeText = mode === 'time' ? f.clock(e.time) : t(mode === 'tentative' ? 'news.time.tentative' : 'news.time.allday');
  const countdown = mode !== 'time' ? '' : t(past ? 'news.ago' : 'news.in', { t: dur(minutes) });
  const actualTone = { positive: 'text-success font-bold', negative: 'text-danger font-bold' }[e.impact_type ?? ''] ?? '';

  const cell = (label: MessageKey, hint: MessageKey, text: string | null, extra?: string, tone?: string, testid?: string) => (
    <div className="flex min-w-0 items-baseline gap-1 whitespace-nowrap">
      <Tooltip content={t(hint)}>
        <span className="cursor-help text-[9px] uppercase tracking-wide text-muted-foreground">{t(label)}</span>
      </Tooltip>
      <span data-testid={testid} className={cn('text-[11px]', text == null && 'text-muted-foreground', tone)}>{text ?? '–'}</span>
      {extra && <small className="text-[9px] text-muted-foreground">{extra}</small>}
    </div>
  );

  return (
    <div
      data-testid="news-row"
      data-event-id={e.id ?? undefined}
      data-soon={soon ? 'true' : undefined}
      className={cn('flex flex-col gap-0.5 border-t border-border px-2.5 py-1.5 first:border-t-0', soon && 'bg-warning/10 shadow-[inset_2px_0_0_var(--warning)]')}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn('text-[11px] font-bold tabular-nums', past && 'text-muted-foreground')} data-testid="news-time">{timeText}</span>
        <span className="rounded border border-border bg-muted px-1 font-mono text-[10px] font-semibold">{ccy}</span>
        {bars && (
          <span className="inline-flex items-center" role="img" aria-label={t(bars.key)} data-impact={e.importance ?? undefined}>
            <span className="flex gap-[1.5px]" aria-hidden="true">
              {[1, 2, 3].map((i) => <span key={i} className={cn('block h-2 w-[2.5px] rounded-[1px]', i <= bars.n ? bars.tone : 'bg-border')} />)}
            </span>
          </span>
        )}
        {arrow && (
          <Tooltip content={arrowHint}>
            <span
              tabIndex={0}
              role="img"
              aria-label={arrowHint.split('\n')[0]}
              data-testid="news-arrow"
              data-dir={arrow.dir}
              data-released={arrow.released ? 'true' : 'false'}
              className={cn('inline-flex cursor-help', arrow.dir === 'up' ? 'text-success' : 'text-danger', !arrow.released && 'opacity-60')}
            >
              {arrow.dir === 'up' ? <ArrowUp size={12} strokeWidth={3} aria-hidden="true" /> : <ArrowDown size={12} strokeWidth={3} aria-hidden="true" />}
            </span>
          </Tooltip>
        )}
        <span className="ml-auto whitespace-nowrap text-[10px] tabular-nums text-muted-foreground" data-testid="news-countdown">{countdown}</span>
      </div>
      <div className="line-clamp-2 text-[11px]">{e.title}</div>
      <div className="grid grid-cols-3 gap-1.5 tabular-nums">
        {cell('news.col.act', 'news.col.act.hint', fmt(e.actual), undefined, actualTone, 'news-actual')}
        {cell('news.col.fcst', 'news.col.fcst.hint', fmt(e.forecast))}
        {cell('news.col.prev', 'news.col.prev.hint', fmt(e.prev), e.revised_prev != null ? t('news.rev', { v: fmt(e.revised_prev) ?? '' }) : undefined)}
      </div>
    </div>
  );
}
