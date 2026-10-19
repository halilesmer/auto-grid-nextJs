'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InfoHint } from '@/components/ui/tooltip';
import { useFormat, useT, type MessageKey } from '@/i18n';
import type { Deviation, SymbolRow, TradeLite } from '@/lib/backtest/liveCompare';

/** Mehr Zeilen zeigt die Detailansicht je Liste nicht; Zähler und Summen stehen oben */
const DETAIL_LIMIT = 500;
const CHECKS = ['count', 'entry', 'price', 'profit'] as const;
const CHECK_OK = { count: 'countOk', entry: 'entryOk', price: 'priceOk', profit: 'profitOk' } as const;

function TradeList({ trades, testId }: { trades: TradeLite[]; testId: string }) {
  const fmt = useFormat();
  const t = useT();
  return (
    <ul className="space-y-1 text-xs" data-testid={testId}>
      {trades.slice(0, DETAIL_LIMIT).map((trade, i) => (
        <li key={i} className="font-mono">
          {t(`backtest.live.side.${trade.side}` as MessageKey)} {trade.magic ?? '—'} · {trade.entryTime === null ? '—' : fmt.mt5DateTime(trade.entryTime)} → {fmt.mt5DateTime(trade.exitTime)} · {fmt.number(trade.net, { maximumFractionDigits: 2 })}
        </li>
      ))}
    </ul>
  );
}

function Detail({ row, currency }: { row: SymbolRow; currency: string | null }) {
  const t = useT();
  const fmt = useFormat();
  const price = (value: number | null) => (value === null ? '—' : fmt.number(value, { maximumFractionDigits: 8 }));
  const time = (value: number | null) => (value === null ? '—' : fmt.mt5DateTime(value));
  return (
    <div className="space-y-3 border-t border-border p-3" data-testid="lc-detail">
      <p className="text-xs text-muted-foreground">
        {t('backtest.live.detail.spread', { value: fmt.number(row.spreadPrice, { maximumFractionDigits: 8 }) })}
        {row.commissionPerLot != null && <> · {t('backtest.live.detail.commission', { value: fmt.number(row.commissionPerLot, { maximumFractionDigits: 2 }) })}</>}
        {' · '}{t('backtest.live.detail.magics', { list: row.magics.join(', ') })}
      </p>
      {row.pairs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="lc-pairs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="p-1.5">{t('backtest.live.pair.magic')}</th>
                <th className="p-1.5">{t('backtest.live.pair.entry')}</th>
                <th className="p-1.5 text-right">{t('backtest.live.pair.entryPrice')}</th>
                <th className="p-1.5 text-right">{t('backtest.live.pair.exitPrice')}</th>
                <th className="p-1.5 text-right">{t('backtest.live.pair.profit')}{currency ? ` (${currency})` : ''}</th>
                <th className="p-1.5">{t('backtest.live.pair.deviation')}</th>
              </tr>
            </thead>
            <tbody>
              {row.pairs.slice(0, DETAIL_LIMIT).map((pair, i) => (
                <tr key={i} className="border-t border-border align-top" data-testid="lc-pair" data-ok={pair.deviations.length === 0}>
                  <td className="p-1.5 font-mono">{pair.magic ?? '—'}</td>
                  <td className="p-1.5 font-mono">
                    <div>{time(pair.live.entryTime)}</div>
                    <div className="text-muted-foreground">{time(pair.backtest.entryTime)}</div>
                  </td>
                  <td className="p-1.5 text-right font-mono">
                    <div>{price(pair.live.entryPrice)}</div>
                    <div className="text-muted-foreground">{price(pair.backtest.entryPrice)}</div>
                  </td>
                  <td className="p-1.5 text-right font-mono">
                    <div>{price(pair.live.exitPrice)}</div>
                    <div className="text-muted-foreground">{price(pair.backtest.exitPrice)}</div>
                  </td>
                  <td className="p-1.5 text-right font-mono">
                    <div>{fmt.number(pair.live.net, { maximumFractionDigits: 2 })}</div>
                    <div className="text-muted-foreground">{fmt.number(pair.backtest.net, { maximumFractionDigits: 2 })}</div>
                  </td>
                  <td className="p-1.5">
                    {pair.deviations.length === 0 ? '—' : pair.deviations.map((d: Deviation) => t(`backtest.live.deviation.${d}` as MessageKey)).join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-muted-foreground">{t('backtest.live.pair.legend')}</p>
        </div>
      )}
      {[row.pairs, row.unmatchedLive, row.unmatchedBacktest].some((list) => list.length > DETAIL_LIMIT) && (
        <p className="text-xs text-muted-foreground">{t('backtest.live.truncated', { limit: DETAIL_LIMIT })}</p>
      )}
      {row.unmatchedLive.length > 0 && (
        <div>
          <p className="text-xs font-medium">{t('backtest.live.unmatched.live', { count: row.unmatchedLive.length })}</p>
          <TradeList trades={row.unmatchedLive} testId="lc-unmatched-live" />
        </div>
      )}
      {row.unmatchedBacktest.length > 0 && (
        <div>
          <p className="text-xs font-medium">{t('backtest.live.unmatched.backtest', { count: row.unmatchedBacktest.length })}</p>
          <TradeList trades={row.unmatchedBacktest} testId="lc-unmatched-backtest" />
        </div>
      )}
    </div>
  );
}

/** Tabelle je Symbol: Live gegen Backtest, die vier Prüfungen und das Ergebnis; Details je Symbol aufklappbar */
export function ReportTable({ rows, currency }: { rows: SymbolRow[]; currency: string | null }) {
  const t = useT();
  const fmt = useFormat();
  const [open, setOpen] = useState<string | null>(null);
  const money = (value: number) => fmt.number(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (value: number | null) => (value === null ? '—' : `${value > 0 ? '+' : ''}${fmt.number(value, { maximumFractionDigits: 2 })} %`);
  const pair = (a: number, b: number) => <span className="font-mono">{a} / {b}</span>;
  return (
    <div className="space-y-2" data-testid="lc-table">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th scope="col" className="p-2">{t('backtest.live.col.symbol')}</th>
              <th scope="col" className="p-2 text-right">{t('backtest.live.col.trades')} <InfoHint hint={t('backtest.live.col.trades.hint')} /></th>
              <th scope="col" className="p-2 text-right">{t('backtest.live.col.net')}{currency ? ` (${currency})` : ''} <InfoHint hint={t('backtest.live.col.net.hint')} /></th>
              <th scope="col" className="p-2 text-right">{t('backtest.live.col.delta')} <InfoHint hint={t('backtest.live.col.delta.hint')} /></th>
              <th scope="col" className="p-2 text-right">{t('backtest.live.col.drawdown')} <InfoHint hint={t('backtest.live.col.drawdown.hint')} /></th>
              <th scope="col" className="p-2 text-right">{t('backtest.live.col.open')} <InfoHint hint={t('backtest.live.col.open.hint')} /></th>
              {CHECKS.map((check) => (
                <th key={check} scope="col" className="p-2 text-center">{t(`backtest.live.check.${check}` as MessageKey)} <InfoHint hint={t(`backtest.live.check.${check}.hint` as MessageKey)} /></th>
              ))}
              <th scope="col" className="p-2 text-center">{t('backtest.live.col.result')}</th>
              <th scope="col" className="relative p-2"><span className="sr-only">{t('backtest.live.col.details')}</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <FragmentRow key={row.symbol} row={row} shown={open === row.symbol} onToggle={() => setOpen(open === row.symbol ? null : row.symbol)}
                money={money} pct={pct} pair={pair} currency={currency} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">{t('backtest.live.table.legend')}</p>
    </div>
  );
}

function FragmentRow({ row, shown, onToggle, money, pct, pair, currency }: {
  row: SymbolRow; shown: boolean; onToggle: () => void; money: (v: number) => string; pct: (v: number | null) => string;
  pair: (a: number, b: number) => React.ReactNode; currency: string | null;
}) {
  const t = useT();
  return (
    <>
      <tr className="border-t border-border" data-testid="lc-row" data-symbol={row.symbol} data-passed={row.passed}>
        <th scope="row" className="p-2 text-left font-medium">{row.symbol}</th>
        <td className="p-2 text-right">{pair(row.live.trades, row.backtest.trades)}</td>
        <td className="p-2 text-right"><span className="font-mono">{money(row.live.net)} / {money(row.backtest.net)}</span></td>
        <td className="p-2 text-right font-mono">{pct(row.profitDeltaPercent)}</td>
        <td className="p-2 text-right"><span className="font-mono">{money(row.live.maxDrawdown)} / {money(row.backtest.maxDrawdown)}</span></td>
        <td className="p-2 text-right">{pair(row.live.openPositions, row.backtest.openPositions)}</td>
        {CHECKS.map((check) => (
          <td key={check} className="p-2 text-center" data-check={check} data-ok={row[CHECK_OK[check]]}>{row[CHECK_OK[check]] ? '✓' : '✗'}</td>
        ))}
        <td className="p-2 text-center">
          <Badge tone={row.passed ? 'success' : 'danger'} hint={t(row.passed ? 'backtest.live.result.pass.hint' : 'backtest.live.result.fail.hint')}>
            {t(row.passed ? 'backtest.live.result.pass' : 'backtest.live.result.fail')}
          </Badge>
        </td>
        <td className="p-2 text-right">
          <Button size="sm" variant="ghost" aria-expanded={shown} hint={t('backtest.live.details.hint')} onClick={onToggle}>
            {t(shown ? 'backtest.live.details.hide' : 'backtest.live.details.show')}
          </Button>
        </td>
      </tr>
      {shown && (
        <tr>
          <td colSpan={11} className="p-0"><Detail row={row} currency={currency} /></td>
        </tr>
      )}
    </>
  );
}
