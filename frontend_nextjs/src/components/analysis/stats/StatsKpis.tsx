'use client';

import type { ReactNode } from 'react';
import { InfoHint } from '@/components/ui/tooltip';
import { useFormat, useT, type MessageKey } from '@/i18n';
import type { TradeStats } from '@/lib/analysis/stats';
import { cn } from '@/lib/utils';

function Tile({ id, label, value, sub, tone }: { id: string; label: MessageKey; value: ReactNode; sub?: ReactNode; tone?: number | null }) {
  const t = useT();
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card px-3 py-2.5" data-testid={`stat-${id}`}>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span className="truncate">{t(label)}</span>
        <InfoHint hint={t(`${label}.hint` as MessageKey)} />
      </div>
      <div
        className={cn(
          'mt-1 truncate font-mono text-base font-semibold tabular-nums',
          tone === undefined || tone === null || tone === 0 ? 'text-foreground' : tone > 0 ? 'text-success' : 'text-danger',
        )}
        data-testid={`stat-${id}-value`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 truncate font-mono text-xs tabular-nums text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Kennzahl-Kacheln (ANA-09); Beträge in Kontowährung, Vorzeichen + Farbe */
export function StatsKpis({ stats, currency }: { stats: TradeStats; currency: string | null }) {
  const t = useT();
  const fmt = useFormat();
  const money = (v: number | null) =>
    v === null
      ? '—'
      : `${v > 0 ? '+' : ''}${fmt.number(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ''}`;
  const pct = (v: number | null) => (v === null ? '—' : fmt.number(v, { style: 'percent', maximumFractionDigits: 1 }));
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5" data-testid="stats-kpis">
      <Tile id="net" label="analysis.stats.kpi.net" value={money(stats.net)} tone={stats.net} />
      <Tile
        id="trades"
        label="analysis.stats.kpi.trades"
        value={`${fmt.number(stats.trades)} / ${fmt.number(stats.positions)}`}
        sub={t('analysis.stats.kpi.winsLosses', { wins: stats.wins, losses: stats.losses, flat: stats.flat })}
      />
      <Tile id="win-rate" label="analysis.stats.kpi.winRate" value={pct(stats.winRate)} />
      <Tile
        id="profit-factor"
        label="analysis.stats.kpi.profitFactor"
        value={stats.profitFactor === null ? '—' : fmt.number(stats.profitFactor, { maximumFractionDigits: 2 })}
      />
      <Tile id="avg" label="analysis.stats.kpi.avg" value={money(stats.avg)} tone={stats.avg} />
      <Tile id="gross" label="analysis.stats.kpi.gross" value={money(stats.grossProfit)} sub={money(stats.grossLoss)} />
      <Tile id="best" label="analysis.stats.kpi.best" value={money(stats.best)} sub={money(stats.worst)} />
      <Tile id="cycles" label="analysis.stats.kpi.cycles" value={fmt.number(stats.cycles)} />
      <Tile
        id="max-drawdown"
        label="analysis.stats.kpi.maxDrawdown"
        value={money(stats.maxDrawdown > 0 ? -stats.maxDrawdown : 0)}
        tone={-stats.maxDrawdown}
      />
    </div>
  );
}
