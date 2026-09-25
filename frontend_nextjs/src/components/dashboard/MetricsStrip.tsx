'use client';

import type { ReactNode } from 'react';
import { Activity, Clock, Layers, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { AnimateDigits } from '@/components/ui/animate-digits';
import { StatusDot } from '@/components/ui/status-dot';
import { FieldLabel } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useBotRuntimeStore, useSettingsStore } from '@/store';
import { getSymbolConfig } from '@/utils/zoneHelpers';
import { useFormat, useT } from '@/i18n';

interface MetricProps {
  label: string;
  /** Pflicht (hooks/RULES.md §5): was die Kennzahl bedeutet. */
  hint: string;
  icon: ReactNode;
  value: string;
  valueClassName?: string;
  footer?: ReactNode;
  accent?: string;
  testId: string;
}

function Metric({ label, hint, icon, value, valueClassName, footer, accent, testId }: MetricProps) {
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
        <FieldLabel label={label} hint={hint} className="text-xs font-medium" />
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
  const t = useT();
  const { money: formatMoney, price: formatPrice } = useFormat();
  const firstSymbol = useSettingsStore((s) => s.settings?.ZONES?.[0]?.symbol);
  const symbolDetails = useSettingsStore((s) => s.symbolDetails);
  const priceDigits = firstSymbol ? getSymbolConfig(firstSymbol, symbolDetails).precision : undefined;
  const liveData = useBotRuntimeStore((s) => s.liveData);
  const isConnecting = useBotRuntimeStore((s) => s.isConnecting);

  const profitPositive = liveData.profit > 0;
  const profitNegative = liveData.profit < 0;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric
        label={t('metrics.price')}
        hint={t('metrics.price.hint')}
        testId="metric-price"
        icon={<Activity size={14} />}
        value={formatPrice(liveData.current_price, priceDigits)}
        footer={
          <span className="flex items-center gap-1.5">
            <StatusDot tone={liveData.market_open ? 'success' : 'danger'} pulse={liveData.market_open} />
            {liveData.market_open ? t('metrics.marketOpen') : t('metrics.marketClosed')}
          </span>
        }
      />
      <Metric
        label={t('metrics.profit')}
        hint={t('metrics.profit.hint')}
        testId="metric-profit"
        icon={profitNegative ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
        value={formatMoney(liveData.profit, true)}
        valueClassName={cn(profitPositive && 'text-success', profitNegative && 'text-danger')}
        accent={profitNegative ? 'bg-danger/20' : 'bg-success/20'}
        footer={
          isConnecting
            ? t('metrics.connecting')
            : liveData.mt5_connected
              ? t('metrics.live')
              : t('metrics.engineStopped')
        }
      />
      <Metric
        label={t('metrics.positions')}
        hint={t('metrics.positions.hint')}
        testId="metric-positions"
        icon={<Layers size={14} />}
        value={String(liveData.open_positions)}
        accent="bg-info/20"
        footer={t('metrics.positions.footer')}
      />
      <Metric
        label={t('metrics.pending')}
        hint={t('metrics.pending.hint')}
        testId="metric-pending"
        icon={<Clock size={14} />}
        value={String(liveData.pending_orders)}
        accent="bg-secondary/25"
        footer={
          <span className="flex items-center gap-1.5">
            <Wallet size={12} /> {t('metrics.pending.footer')}
          </span>
        }
      />
    </div>
  );
}
