'use client';

import { Tooltip } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { TIMEFRAMES, type Timeframe } from '@/lib/analysis/candles';
import { cn } from '@/lib/utils';

/** Zeitrahmen der Kerzen (M1 … D1); steht in der Adresse (?tf=). */
export function TimeframeSelect({ value, onChange }: { value: Timeframe; onChange: (tf: Timeframe) => void }) {
  const t = useT();
  return (
    <div
      role="radiogroup"
      aria-label={t('analysis.chart.timeframe')}
      data-testid="timeframe-select"
      className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-muted/50 p-0.5"
    >
      {TIMEFRAMES.map((tf) => {
        const active = tf === value;
        return (
          <Tooltip key={tf} content={t('analysis.chart.timeframe.option.hint', { tf })} role="presentation">
            <button
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={`timeframe-${tf}`}
              onClick={() => onChange(tf)}
              className={cn(
                'flex h-7 min-w-9 cursor-pointer items-center justify-center rounded-md px-1.5 font-mono text-[11px] font-semibold transition-colors',
                active ? 'border border-border bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tf}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
