'use client';

import type { ReactNode } from 'react';
import { Activity, Clock, Layers, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { AnimateDigits } from '@/components/ui/animate-digits';
import { StatusDot } from '@/components/ui/status-dot';
import { cn } from '@/lib/utils';
import { useBotRuntimeStore } from '@/store';

function formatMoney(value: number, signed = false): string {
  const abs = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (value < 0) return `-$${abs}`;
  return signed && value > 0 ? `+$${abs}` : `$${abs}`;
}

interface MetricProps {
  label: string;
  icon: ReactNode;
  value: string;
  valueClassName?: string;
  footer?: ReactNode;
  accent?: string;
  testId: string;
}

function Metric({ label, icon, value, valueClassName, footer, accent, testId }: MetricProps) {
  return (
    <div
      data-testid={testId}
      // Zielwert für Tests: die Ziffern-Animation zeigt während des Wechsels alte + neue Zeichen
      data-value={value}
      className="group relative overflow-hidden rounded-xl border border-border bg-card/80 p-4 backdrop-blur-sm transition-colors hover:border-foreground/15"
    >
      <div
        className={cn(
          'pointer-events-none absolute -right-8 -top-8 size-24 rounded-full opacity-0 blur-2xl transition-opacity group-hover:opacity-100',
          accent ?? 'bg-primary/20',
        )}
      />
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs font-medium">{label}</span>
        <span className="opacity-70">{icon}</span>
      </div>
      <AnimateDigits
        value={value}
        gap={0}
        className={cn('mt-2 font-mono text-2xl font-semibold tracking-tight text-foreground', valueClassName)}
        enterBlur={6}
        enterY={14}
        animationDelay={40}
      />
      {footer && <div className="mt-1.5 text-xs text-muted-foreground">{footer}</div>}
    </div>
  );
}

export default function MetricsStrip() {
  const liveData = useBotRuntimeStore((s) => s.liveData);
  const isConnecting = useBotRuntimeStore((s) => s.isConnecting);

  const profitPositive = liveData.profit > 0;
  const profitNegative = liveData.profit < 0;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric
        label="Price"
        testId="metric-price"
        icon={<Activity size={14} />}
        value={formatMoney(liveData.current_price)}
        footer={
          <span className="flex items-center gap-1.5">
            <StatusDot tone={liveData.market_open ? 'success' : 'danger'} pulse={liveData.market_open} />
            Market {liveData.market_open ? 'open' : 'closed'}
          </span>
        }
      />
      <Metric
        label="Floating P/L"
        testId="metric-profit"
        icon={profitNegative ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
        value={formatMoney(liveData.profit, true)}
        valueClassName={cn(profitPositive && 'text-success', profitNegative && 'text-danger')}
        accent={profitNegative ? 'bg-danger/20' : 'bg-success/20'}
        footer={
          isConnecting
            ? 'Connecting…'
            : liveData.mt5_connected
              ? 'Live from MT5'
              : 'Engine stopped'
        }
      />
      <Metric
        label="Open Positions"
        testId="metric-positions"
        icon={<Layers size={14} />}
        value={String(liveData.open_positions)}
        accent="bg-info/20"
        footer="Filled grid levels"
      />
      <Metric
        label="Pending Orders"
        testId="metric-pending"
        icon={<Clock size={14} />}
        value={String(liveData.pending_orders)}
        accent="bg-secondary/25"
        footer={
          <span className="flex items-center gap-1.5">
            <Wallet size={12} /> Waiting at broker
          </span>
        }
      />
    </div>
  );
}
