'use client';

import { Tooltip } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { useEffect, useRef } from 'react';
import { isCalendarTimeframe } from '@/lib/analysis/calendarBars';
import { type ChartTimeframe } from '@/lib/analysis/candles';
import { cn } from '@/lib/utils';
import { CountBadge } from '@/components/formation/FormationForms';

/**
 * Zeitrahmen der Kerzen; steht in der Adresse (?tf=). `options`: die neun Zeiteinheiten M1 … MN (Punkt am Knopf: Kalenderzeitrahmen W1 und MN).
 * Darstellung (Entwurf 4 vom 14.11.): eine Gruppe mit einem Rahmen und aneinanderliegenden Feldern; das gewählte Feld hat Akzentfüllung,
 * volle Textfarbe und eine 2-px-Linie in `primary` am unteren Rand, damit die Auswahl auch im dunklen Thema sofort auffällt.
 */
export function TimeframeSelect<T extends ChartTimeframe>({ value, onChange, options, counts }: {
  value: T;
  onChange: (tf: T) => void;
  options: readonly T[];
  /** Formation hits per timeframe (1107-A21): a badge on the button; a timeframe that is not in the object has no formation search */
  counts?: Partial<Record<T, number>>;
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
      className="flex h-7 max-w-full items-stretch overflow-x-auto rounded-lg border border-border bg-card short:h-6 [&>span+span]:border-l [&>span+span]:border-border [&>span]:grow"

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
                'relative flex w-full min-w-8 cursor-pointer items-center justify-center px-1 font-mono text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-w-9 sm:px-1.5',
                selected
                  ? 'bg-accent text-accent-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary'
                  : 'text-muted-foreground hover:text-foreground',
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
