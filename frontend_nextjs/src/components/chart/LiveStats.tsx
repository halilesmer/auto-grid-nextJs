'use client';

import { FieldLabel } from '@/components/ui/tooltip';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { useBotRuntimeStore, useSettingsStore } from '@/store';
import { getSymbolConfig } from '@/utils/zoneHelpers';

/** Kennzahlen aus dem Live-Stream (Preis, RSI, P/L, Positionen): /formasyon und Chart-Tab der Analyse. */
export function LiveStats({ digits }: { digits?: number } = {}) {
  const t = useT();
  const fmt = useFormat();
  const metrics = useBotRuntimeStore((s) => s.metrics);
  const symbolDetails = useSettingsStore((s) => s.symbolDetails);

  const profit = metrics.profit ?? 0;
  // Nachkommastellen: vom Aufrufer (z. B. aus /rates), sonst aus den Symbolinfos
  const priceDigits = digits ?? (metrics.symbol ? getSymbolConfig(metrics.symbol, symbolDetails).precision : undefined);
  const stats = [
    {
      id: 'price',
      label: t('chart.stat.price'),
      hint: t('chart.stat.price.hint'),
      value: typeof metrics.price === 'number' ? fmt.price(metrics.price, priceDigits) : '--',
      className: 'text-foreground',
    },
    {
      id: 'rsi',
      label: t('chart.stat.rsi'),
      hint: t('chart.stat.rsi.hint'),
      value: metrics.rsi ? fmt.number(metrics.rsi, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--',
      className: 'text-info',
    },
    {
      id: 'pl',
      label: t('chart.stat.pl'),
      hint: t('chart.stat.pl.hint'),
      value: fmt.money(profit),
      className: profit > 0 ? 'text-success' : profit < 0 ? 'text-danger' : 'text-foreground',
    },
    {
      id: 'positions',
      label: t('chart.stat.positions'),
      hint: t('chart.stat.positions.hint'),
      value: metrics.open_positions ?? 0,
      className: 'text-foreground',
    },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {stats.map((s) => (
        <div key={s.id} data-testid={`chart-stat-${s.id}`} className="rounded-md border border-border bg-muted/50 px-3 py-1.5">
          <FieldLabel label={s.label} hint={s.hint} className="text-[11px] font-medium text-muted-foreground" />
          <div className={cn('font-mono text-sm font-semibold tabular-nums', s.className)}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}
