'use client';

import { useFormat, useT } from '@/i18n';
import type { Group } from '@/lib/analysis/groupings';
import { cn } from '@/lib/utils';

/** Zeilen je Gruppe: Positionen, Trades, Trefferquote, Netto, Profitfaktor */
export function BreakdownTable({ groups, label, currency }: { groups: Group[]; label: (key: string) => string; currency: string | null }) {
  const t = useT();
  const fmt = useFormat();
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[32rem] text-xs" data-testid="breakdown-table">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium">{t('analysis.stats.col.group')}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{t('analysis.stats.col.positions')}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{t('analysis.stats.col.trades')}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{t('analysis.stats.col.winRate')}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{t('analysis.stats.col.net')}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{t('analysis.stats.col.pf')}</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {groups.map(({ key, stats }) => (
            <tr key={key} data-testid="breakdown-row" data-key={key} className="border-b border-border last:border-b-0">
              <td className="px-3 py-1.5 font-sans text-foreground" data-testid="breakdown-label">{label(key)}</td>
              <td className="px-3 py-1.5 text-right">{fmt.number(stats.positions)}</td>
              <td className="px-3 py-1.5 text-right">{fmt.number(stats.trades)}</td>
              <td className="px-3 py-1.5 text-right">
                {stats.winRate === null ? '—' : fmt.number(stats.winRate, { style: 'percent', maximumFractionDigits: 1 })}
              </td>
              <td
                className={cn(
                  'whitespace-nowrap px-3 py-1.5 text-right font-semibold',
                  stats.net > 0 ? 'text-success' : stats.net < 0 ? 'text-danger' : 'text-muted-foreground',
                )}
                data-testid="breakdown-net"
              >
                {stats.net > 0 ? '+' : ''}
                {fmt.number(stats.net, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {currency ? ` ${currency}` : ''}
              </td>
              <td className="px-3 py-1.5 text-right">
                {stats.profitFactor === null ? '—' : fmt.number(stats.profitFactor, { maximumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
