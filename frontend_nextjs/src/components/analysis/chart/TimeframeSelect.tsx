'use client';

import { Tooltip } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { useEffect, useRef } from 'react';
import { isCalendarTimeframe } from '@/lib/analysis/calendarBars';
import { type ChartTimeframe } from '@/lib/analysis/candles';
import { cn } from '@/lib/utils';
import { CountBadge } from '@/components/formation/FormationForms';

/** Zeitrahmen der Kerzen; steht in der Adresse (?tf=). `options`: die neun Zeiteinheiten M1 … MN (Punkt am Knopf: Kalenderzeitrahmen W1 und MN). */
export function TimeframeSelect<T extends ChartTimeframe>({ value, onChange, options, counts, flat = false }: {
  value: T;
  onChange: (tf: T) => void;
  options: readonly T[];
  /** Formation hits per timeframe (1107-A21): a badge on the button; a timeframe that is not in the object has no formation search */
  counts?: Partial<Record<T, number>>;
  /** No frame: the buttons stand like the other buttons of the top bar (the one chart, row 2 is 28 px high) */
  flat?: boolean;
}) {
  const t = useT();
  const active = useRef<HTMLButtonElement | null>(null);
  // On a narrow screen the row scrolls; keep the chosen button in view
  useEffect(() => { active.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }, [value]);
  return (
    <div
      role="radiogroup"
      aria-label={t('analysis.chart.timeframe')}
      data-testid="timeframe-select"
      className={cn('flex max-w-full items-center gap-0.5 overflow-x-auto short:[&_button]:h-6', !flat && 'rounded-lg border border-border bg-muted/50 p-0.5')}
    >
      {options.map((tf) => {
        const selected = tf === value;
        const calendar = isCalendarTimeframe(tf);
        const count = counts?.[tf];
        let hint = t('analysis.chart.timeframe.option.hint', { tf });
        if (count !== undefined) hint = t('formation.tf.option.hint', { tf, count });
        else if (calendar) hint = `${hint} ${t('analysis.chart.timeframe.calendar.hint')}`;
        return (
          <Tooltip key={tf} content={hint} role="presentation">
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
              {count !== undefined && <CountBadge count={count} active={false} />}
              {calendar && <span aria-hidden className="absolute right-0.5 top-0.5 size-1 rounded-full bg-info" />}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
