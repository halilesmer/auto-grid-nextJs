'use client';

import { Tooltip } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { useEffect, useRef } from 'react';
import { isCalendarTimeframe } from '@/lib/analysis/calendarBars';
import { type ChartTimeframe } from '@/lib/analysis/candles';
import { cn } from '@/lib/utils';

/** Zeitrahmen der Kerzen; steht in der Adresse (?tf=). `options`: Setup M1 … D1, Frei zusätzlich W1 und MN (Punkt am Knopf: Kalenderzeitrahmen). */
export function TimeframeSelect<T extends ChartTimeframe>({ value, onChange, options }: { value: T; onChange: (tf: T) => void; options: readonly T[] }) {
  const t = useT();
  const active = useRef<HTMLButtonElement | null>(null);
  // On a narrow screen the row scrolls; keep the chosen button in view
  useEffect(() => { active.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }, [value]);
  return (
    <div
      role="radiogroup"
      aria-label={t('analysis.chart.timeframe')}
      data-testid="timeframe-select"
      className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-muted/50 p-0.5 short:[&_button]:h-6"
    >
      {options.map((tf) => {
        const selected = tf === value;
        const calendar = isCalendarTimeframe(tf);
        return (
          <Tooltip key={tf} content={calendar ? `${t('analysis.chart.timeframe.option.hint', { tf })} ${t('analysis.chart.timeframe.calendar.hint')}` : t('analysis.chart.timeframe.option.hint', { tf })} role="presentation">
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              ref={selected ? active : undefined}
              data-testid={`timeframe-${tf}`}
              onClick={() => onChange(tf)}
              className={cn(
                'relative flex h-7 min-w-8 cursor-pointer items-center justify-center rounded-md px-1 sm:min-w-9 sm:px-1.5 font-mono text-[11px] font-semibold transition-colors',
                selected ? 'border border-border bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tf}
              {calendar && <span aria-hidden className="absolute right-0.5 top-0.5 size-1 rounded-full bg-info" />}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
