'use client';

import { useMemo, useState } from 'react';
import { BreakdownTable } from '@/components/analysis/stats/BreakdownTable';
import { InputField } from '@/components/ui/InputField';
import { Switch } from '@/components/ui/switch';
import { InfoHint } from '@/components/ui/tooltip';
import { useFormat, useT, type MessageKey } from '@/i18n';
import { breakdown } from '@/lib/analysis/groupings';
import { computeStats, type TradeStats } from '@/lib/analysis/stats';
import { aggregateBlock, aggregateEquity, type ComparisonRun } from '@/lib/backtest/comparison';
import type { BacktestSetup, SetupRun } from '@/store/useBacktestStore';
import { EquityOverlay } from './EquityOverlay';
import { SETUP_COLORS } from './SetupCards';

const METRICS: { key: keyof TradeStats; label: MessageKey; kind?: 'money' | 'percent' }[] = [
  { key: 'net', label: 'analysis.stats.kpi.net', kind: 'money' },
  { key: 'trades', label: 'analysis.stats.col.trades' },
  { key: 'positions', label: 'analysis.stats.col.positions' },
  { key: 'winRate', label: 'analysis.stats.kpi.winRate', kind: 'percent' },
  { key: 'profitFactor', label: 'analysis.stats.kpi.profitFactor' },
  { key: 'avg', label: 'analysis.stats.kpi.avg', kind: 'money' },
  { key: 'grossProfit', label: 'backtest.compare.grossProfit', kind: 'money' },
  { key: 'grossLoss', label: 'backtest.compare.grossLoss', kind: 'money' },
  { key: 'best', label: 'backtest.compare.best', kind: 'money' },
  { key: 'worst', label: 'backtest.compare.worst', kind: 'money' },
  { key: 'cycles', label: 'analysis.stats.kpi.cycles' },
  { key: 'maxDrawdown', label: 'analysis.stats.kpi.maxDrawdown', kind: 'money' },
];
const SUMMARY = ['realized', 'openResult', 'endEquity', 'maxDrawdown', 'openPositions', 'commission', 'swap', 'spreadInfo'] as const;
const SUMMARY_LABELS: Record<typeof SUMMARY[number], MessageKey> = {
  realized: 'backtest.summary.realized', openResult: 'backtest.summary.open', endEquity: 'backtest.summary.endEquity',
  maxDrawdown: 'backtest.summary.maxDrawdown', openPositions: 'backtest.summary.openPositions',
  commission: 'backtest.summary.commission', swap: 'backtest.summary.swap', spreadInfo: 'backtest.summary.spread',
};

export function SetupComparison({ setups, runs }: { setups: BacktestSetup[]; runs: Record<string, SetupRun> }) {
  const t = useT();
  const fmt = useFormat();
  const [hidden, setHidden] = useState<string[]>([]);
  const [aggregate, setAggregate] = useState(false);
  const [breakdownId, setBreakdownId] = useState('');
  const [kind, setKind] = useState<'setup' | 'weekday' | 'hour'>('setup');
  const rows = useMemo(() => setups.flatMap((setup, i): ComparisonRun[] => {
    const run = runs[setup.id];
    if (run?.status !== 'done' || !run.context) return [];
    return (run.results ?? []).map((result) => ({
      id: `${setup.id}-${run.runId}-${result.path}`, setupId: setup.id, result, context: run.context!, color: SETUP_COLORS[i],
      label: `${t('analysis.zone.option', { n: i + 1, symbol: run.context!.params.symbol.name })} · ${t(`backtest.result.path.${result.path}`)}`,
    }));
  }), [setups, runs, t]);
  const stats = useMemo(() => rows.map((row) => computeStats(row.result.trades)), [rows]);
  const selected = useMemo(() => rows.filter((row) => !hidden.includes(row.id)), [rows, hidden]);
  const block = aggregateBlock(selected);
  const sameCurrency = selected.length > 0 && Boolean(selected[0].context.currency) && selected.every((r) => r.context.currency === selected[0].context.currency);
  const curves = useMemo(() => {
    const lines = selected.map((r) => ({ id: r.id, label: r.label, color: r.color, points: r.result.equity, dashed: r.result.path === 'highFirst' }));
    if (aggregate && !block) lines.push({ id: 'sum', label: t('backtest.compare.aggregate'), color: 'var(--foreground)', points: aggregateEquity(selected), dashed: false });
    return lines;
  }, [selected, aggregate, block, t]);
  const chosen = rows.find((r) => r.id === breakdownId) ?? rows[0];
  const groups = useMemo(() => {
    if (!chosen) return [];
    if (kind === 'setup') return rows.map((row, i) => ({ key: row.id, stats: stats[i] }));
    return breakdown(chosen.result.trades, kind);
  }, [chosen, kind, rows, stats]);
  const groupLabel = (key: string) => {
    if (kind === 'setup') {
      const row = rows.find((row) => row.id === key);
      return row ? `${row.label} · ${row.context.currency ?? '—'}` : key;
    }
    if (kind === 'weekday') return t(`analysis.stats.weekday.${key}` as MessageKey);
    return `${key.padStart(2, '0')}:00`;
  };
  if (rows.length === 0) return null;
  const metricHint = (metric: typeof METRICS[number]): MessageKey => {
    if (metric.key === 'trades' || metric.key === 'positions') return 'analysis.stats.kpi.trades.hint';
    if (metric.key === 'grossProfit' || metric.key === 'grossLoss') return 'analysis.stats.kpi.gross.hint';
    if (metric.key === 'best' || metric.key === 'worst') return 'analysis.stats.kpi.best.hint';
    return `${metric.label}.hint` as MessageKey;
  };
  const number = (n: number | null, currency?: string | null, percent = false) => n === null ? '—'
    : `${fmt.number(n, { ...(percent ? { style: 'percent' as const } : {}), maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ''}`;
  return <section className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-4" data-testid="bt-comparison">
    <h2 className="text-lg font-semibold">{t('backtest.compare.title')}</h2>
    <p className="text-xs text-muted-foreground">{t('backtest.compare.notes')}</p>
    <div className="overflow-x-auto">
      <table className="w-full text-xs" data-testid="bt-comparison-table">
        <thead><tr><th scope="col" className="p-2 text-left">{t('backtest.compare.metric')}</th>{rows.map((row) => <th scope="col" className="min-w-52 p-2 text-right" key={row.id}>{row.label}</th>)}</tr></thead>
        <tbody>
          <tr><th scope="row" className="p-2 text-left">{t('analysis.range')}</th>{rows.map((r) => <td key={r.id} className="p-2 text-right">{fmt.mt5DateTime(r.context.params.from)} – {fmt.mt5DateTime(r.context.params.to)}</td>)}</tr>
          <tr><th scope="row" className="p-2 text-left">{t('backtest.field.data')}</th>{rows.map((r) => <td key={r.id} className="p-2 text-right">{r.context.sourceLabel} · {r.context.params.dataTimeframe}</td>)}</tr>
          {METRICS.map((metric) => <tr className="border-t border-border" key={metric.key}>
            <th scope="row" className="p-2 text-left font-medium">{t(metric.label)} <InfoHint hint={t(metricHint(metric))} /></th>
            {rows.map((row, i) => <td className="p-2 text-right font-mono" key={row.id}>{number(metric.key === 'maxDrawdown' ? -stats[i].maxDrawdown : stats[i][metric.key], metric.kind === 'money' ? row.context.currency : null, metric.kind === 'percent')}</td>)}
          </tr>)}
          {SUMMARY.map((key) => <tr className="border-t border-border" key={key}>
            <th scope="row" className="p-2 text-left font-medium">{t(SUMMARY_LABELS[key])} <InfoHint hint={t(`${SUMMARY_LABELS[key]}.hint` as MessageKey)} /></th>
            {rows.map((row) => <td className="p-2 text-right font-mono" key={row.id}>{number(key === 'maxDrawdown' ? -row.result.summary[key] : row.result.summary[key], key === 'openPositions' ? null : row.context.currency)}</td>)}
          </tr>)}
        </tbody>
      </table>
    </div>
    <h3 className="font-semibold">{t('backtest.compare.overlay')}</h3>
    <div className="flex flex-wrap gap-3">{rows.map((row) => <div key={row.id} className="border-l-4 pl-2" style={{ borderColor: row.color }}>
      <Switch label={row.label} hint={t('backtest.compare.select.hint')} checked={!hidden.includes(row.id)}
        onChange={(on) => setHidden((old) => on ? old.filter((id) => id !== row.id) : [...old, row.id])} />
    </div>)}</div>
    <Switch label={t('backtest.compare.aggregate')} checked={aggregate && !block} disabled={Boolean(block)}
      hint={t(block ? `backtest.compare.block.${block}.hint` : 'backtest.compare.aggregate.hint')} onChange={setAggregate} />
    {block && <p className="text-xs text-muted-foreground">{t(`backtest.compare.block.${block}.hint`)}</p>}
    {sameCurrency ? <EquityOverlay curves={curves} /> : <p className="text-xs text-muted-foreground">{t('backtest.compare.block.currency.hint')}</p>}
    <div className="flex flex-wrap gap-3">
      <InputField label={t('backtest.compare.breakdownRun')} hint={t('backtest.compare.breakdownRun.hint')}>
        <select className="input-s" value={chosen?.id ?? ''} onChange={(e) => setBreakdownId(e.target.value)}>
          {rows.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
        </select>
      </InputField>
      <InputField label={t('analysis.stats.breakdown')} hint={t('backtest.compare.breakdown.hint')}>
        <select className="input-s" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="setup">{t('backtest.compare.bySetup')}</option>
          <option value="weekday">{t('analysis.stats.by.weekday')}</option>
          <option value="hour">{t('analysis.stats.by.hour')}</option>
        </select>
      </InputField>
    </div>
    <BreakdownTable groups={groups} currency={kind === 'setup' ? null : chosen.context.currency}
      label={groupLabel} />
  </section>;
}
