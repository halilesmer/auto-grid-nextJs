'use client';

import { useT } from '@/i18n';
import { CHART_TIMEFRAMES } from '@/lib/analysis/candles';

/**
 * Platzhalter der Kopfleiste, solange die Kontoliste lädt (1119-A9.1, Entwurf B). Sie haben dieselben Maße wie das Symbolfeld
 * (`w-44`, `h-7`) und die Zeiteinheiten (`TimeframeSelect`), damit beim Laden kein Element rückt. Sie sind keine Bedienelemente
 * (kein Knopf, kein Eingabefeld): ein Screenreader hört nur „lädt“ (`aria-busy`).
 */
export function SymbolPlaceholder() {
  const t = useT();
  return <div role="status" aria-busy="true" aria-label={t('chart.loading.symbol')} data-testid="chart-topbar-symbol-loading" className="h-7 w-44 min-w-0 max-w-full animate-pulse rounded-full bg-muted short:h-6" />;
}

export function TimeframesPlaceholder() {
  const t = useT();
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t('chart.loading.timeframes')}
      data-testid="chart-topbar-timeframes-loading"
      className="flex h-7 max-w-full items-stretch overflow-hidden rounded-lg border border-border bg-card short:h-6 [&>span+span]:border-l [&>span+span]:border-border [&>span]:grow"
    >
      {CHART_TIMEFRAMES.map((tf) => (
        <span key={tf} aria-hidden="true" className="relative flex w-full min-w-8 animate-pulse items-center justify-center px-1 font-mono text-[11px] font-semibold text-muted-foreground/40 sm:min-w-9 sm:px-1.5">{tf}</span>
      ))}
    </div>
  );
}
