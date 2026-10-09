'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { EMPTY_RUN, MAX_SETUPS, useBacktestStore, type BacktestSetup, type SetupRun } from '@/store/useBacktestStore';

export const SETUP_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--info)'];

export function SetupCards({ setups, runs, activeId, onEdit, onPreset, onTransfer }: {
  setups: BacktestSetup[]; runs: Record<string, SetupRun>; activeId: string | null; onEdit: (id: string) => void; onPreset: (setup: BacktestSetup) => void; onTransfer: (setup: BacktestSetup) => void;
}) {
  const t = useT();
  const fmt = useFormat();
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="bt-setups">
    {setups.map((setup, index) => {
      const run = runs[setup.id] ?? EMPTY_RUN;
      const { zone, form } = setup;
      const draftRange = 'custom' in setup.range ? `${setup.range.custom.from} – ${setup.range.custom.to}` : t(`analysis.range.preset.${setup.range.preset}`);
      const range = run.context ? `${fmt.mt5DateTime(run.context.params.from)} – ${fmt.mt5DateTime(run.context.params.to)}`
        : draftRange;
      const tone = { idle: 'info', running: 'info', error: 'danger', done: 'success' } as const;
      return <article key={setup.id} data-testid="bt-setup" data-setup-id={setup.id}
        className={cn('min-w-0 space-y-3 rounded-xl border bg-card p-3', activeId === setup.id ? 'border-primary' : 'border-border')}>
        <Button variant="ghost" hint={t('backtest.setups.select.hint')} onClick={() => useBacktestStore.getState().select(setup.id)} aria-pressed={activeId === setup.id}>
          <span className="mr-2 size-2 rounded-full" style={{ background: SETUP_COLORS[index] }} />
          {t('analysis.zone.option', { n: index + 1, symbol: zone.symbol || '—' })}
        </Button>
        <div className="flex flex-wrap gap-1.5">
          <Badge hint={t('backtest.setups.badge.hint')}>{run.context?.params.dataTimeframe ?? form.timeframe} · {zone.entry_mode === 'fractal' ? t('zone.section.fractal') : t('zone.section.grid')}</Badge>
          <Badge hint={t('backtest.field.spread.hint')}>{t('backtest.field.spread')}: {t(`backtest.spread.${form.spreadMode}`)}{form.spreadMode !== 'candle' ? ` ${fmt.number(form.spreadPoints)}` : ''}</Badge>
          {zone.entry_mode === 'fractal' ? (
            <>
              <Badge hint={t('zone.fractal.timeframe.hint')}>{zone.fractal_timeframe}</Badge>
              <Badge hint={t(zone.fractal_tp_by_money ? 'zone.fractal.tpMoney.hint' : 'zone.fractal.rr.hint')}>
                {t(zone.fractal_tp_by_money ? 'zone.fractal.tpMoney' : 'zone.fractal.rr')}: {fmt.number(zone.fractal_tp_by_money ? zone.fractal_tp_money ?? 0 : zone.fractal_rr ?? 2)}
              </Badge>
              <Badge hint={t('zone.field.lot.hint')}>{t('zone.field.lot')}: {fmt.number(zone.lot_size, { maximumFractionDigits: 8 })}</Badge>
            </>
          ) : (
            <>
              <Badge hint={t(zone.step_by_loss ? 'zone.field.gridStepLoss.hint' : 'zone.field.gridStep.hint')}>
                {t('backtest.setups.parameters', { step: fmt.number(zone.grid_step), tp: fmt.number(zone.take_profit), lot: fmt.number(zone.lot_size, { maximumFractionDigits: 8 }) })}
              </Badge>
              {zone.order_type === 'BOTH' && !zone.sync_buy_sell && <Badge hint={t('backtest.setups.badge.hint')}>
                {t('zone.section.sellGrid')} · {t('backtest.setups.parameters', { step: fmt.number(zone.sell_grid_step), tp: fmt.number(zone.sell_take_profit), lot: fmt.number(zone.sell_lot_size, { maximumFractionDigits: 8 }) })}
              </Badge>}
            </>
          )}
          <Badge hint={t('backtest.setups.badge.hint')}>{range}</Badge>
          <Badge tone={tone[run.status]} hint={t('backtest.setups.status.hint')}>
            {t(`backtest.setups.status.${run.status}`)}{run.progress ? ` · ${t(run.progress.phase === 'load' ? 'backtest.progress.load' : 'backtest.progress.run', { pct: Math.round(run.progress.fraction * 100) })}` : ''}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={run.status === 'running'} hint={t('backtest.setups.edit.hint')} onClick={() => onEdit(setup.id)}>{t('backtest.setups.edit')}</Button>
          <Button size="sm" disabled={setups.length >= MAX_SETUPS} hint={t('backtest.setups.duplicate.hint')}
            onClick={() => useBacktestStore.getState().add(setup)}>{t('backtest.setups.duplicate')}</Button>
          <Button size="sm" disabled={!zone.symbol} hint={t('backtest.presets.save.hint')} onClick={() => onPreset(setup)}>{t('backtest.presets.save')}</Button>
          <Button size="sm" disabled={!zone.symbol} hint={t('backtest.transfer.apply.hint')} onClick={() => onTransfer(setup)}>{t('backtest.transfer.title')}</Button>
          <Button size="sm" variant="ghost" hint={t('backtest.setups.remove.hint')} onClick={() => useBacktestStore.getState().remove(setup.id)}>{t('backtest.setups.remove')}</Button>
        </div>
      </article>;
    })}
  </div>;
}
