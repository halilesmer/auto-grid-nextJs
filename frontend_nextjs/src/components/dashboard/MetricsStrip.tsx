'use client';

import type { ReactNode } from 'react';
import { Clock, Layers, TrendingDown, TrendingUp } from 'lucide-react';
import { AnimateDigits } from '@/components/ui/animate-digits';
import { FieldLabel } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useBotRuntimeStore } from '@/store';
import { useFormat, useT, type MessageKey } from '@/i18n';

interface MetricProps {
  label: string;
  /** Pflicht (hooks/RULES.md §5): was die Kennzahl bedeutet. */
  hint: string;
  icon: ReactNode;
  value: string;
  valueClassName?: string;
  /** Dynamischer Zustand (z. B. Motor gestoppt); statische Erklärungen stehen im Hinweis. */
  status?: ReactNode;
  accent?: string;
  testId: string;
  className?: string;
}

function Metric({ label, hint, icon, value, valueClassName, status, accent, testId, className }: MetricProps) {
  return (
    <div
      data-testid={testId}
      // Zielwert für Tests: die Ziffern-Animation zeigt während des Wechsels alte + neue Zeichen
      data-value={value}
      className={cn(
        'group relative flex h-9 min-w-0 items-center gap-1.5 overflow-hidden rounded-lg border border-border bg-card/80 px-2.5 sm:h-10 sm:gap-2 sm:rounded-xl sm:px-3 backdrop-blur-sm transition-colors hover:border-foreground/15',
        className,
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute -right-8 -top-8 size-24 rounded-full opacity-0 blur-2xl transition-opacity group-hover:opacity-100',
          accent ?? 'bg-primary/20',
        )}
      />
      <span className="hidden shrink-0 text-muted-foreground opacity-70 sm:inline-flex">{icon}</span>
      <span data-slot="metric-label" className="flex min-w-0 items-center text-muted-foreground">
        <FieldLabel label={label} hint={hint} className="min-w-0 text-xs font-medium [&>span:first-child]:truncate" />
      </span>
      {status && (
        <span data-testid={`${testId}-status`} className="min-w-0 truncate text-xs text-muted-foreground">
          {status}
        </span>
      )}
      <span data-slot="metric-value" className="ml-auto shrink-0">
        <AnimateDigits
        value={value}
        gap={0}
        className={cn('font-mono text-base font-semibold sm:text-lg tracking-tight text-foreground', valueClassName)}
        enterBlur={6}
        enterY={14}
        animationDelay={40}
      />
      </span>
    </div>
  );
}

function engineStatusKey({ isConnecting, mt5Connected }: { isConnecting: boolean; mt5Connected: boolean }): MessageKey {
  if (isConnecting) return 'metrics.connecting';
  if (mt5Connected) return 'metrics.live';
  return 'metrics.engineStopped';
}

export default function MetricsStrip() {
  const t = useT();
  const { money: formatMoney } = useFormat();
  const liveData = useBotRuntimeStore((s) => s.liveData);
  const isConnecting = useBotRuntimeStore((s) => s.isConnecting);

  const profitPositive = liveData.profit > 0;
  const profitNegative = liveData.profit < 0;

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
      <Metric
        label={t('metrics.profit')}
        hint={t('metrics.profit.hint')}
        testId="metric-profit"
        icon={profitNegative ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
        value={formatMoney(liveData.profit, true)}
        valueClassName={cn(profitPositive && 'text-success', profitNegative && 'text-danger')}
        accent={profitNegative ? 'bg-danger/20' : 'bg-success/20'}
        className="col-span-2 lg:col-span-1"
        status={t(engineStatusKey({ isConnecting, mt5Connected: Boolean(liveData.mt5_connected) }))}
      />
      <Metric
        label={t('metrics.positions')}
        hint={t('metrics.positions.hint')}
        testId="metric-positions"
        icon={<Layers size={14} />}
        value={String(liveData.open_positions)}
        accent="bg-info/20"
      />
      <Metric
        label={t('metrics.pending')}
        hint={t('metrics.pending.hint')}
        testId="metric-pending"
        icon={<Clock size={14} />}
        value={String(liveData.pending_orders)}
        accent="bg-secondary/25"
      />
    </div>
  );
}
