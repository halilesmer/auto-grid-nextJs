'use client';

import { useFormat, useT } from '@/i18n';
import type { Group } from '@/lib/analysis/groupings';
import { cn } from '@/lib/utils';
import { signTone } from './StatsKpis';

/** Zeilen je Gruppe: Positionen, Trades, Trefferquote, Netto, Profitfaktor, Ø Trade, max. Drawdown (Setup-Vergleich, ANA-14) */
export function BreakdownTable({ groups, label, currency }: { groups: Group[]; label: (key: string) => string; currency: string | null }) {
  const t = useT();
  const fmt = useFormat();
  // Ø Trade und Drawdown ohne Währung: sie steht schon in der Netto-Spalte, die Tabelle bleibt so schmaler.
  // Auf 2 Stellen gerundet, damit −0,003 oder −0 als „0,00“ erscheint, nicht als „-0,00“.
  const signed = (v: number) => {
    const rounded = Math.round(v * 100) / 100 || 0;
    return `${rounded > 0 ? '+' : ''}${fmt.number(rounded, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[42rem] text-xs" data-testid="breakdown-table">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium">{t('analysis.stats.col.group')}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{t('analysis.stats.col.positions')}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{t('analysis.stats.col.trades')}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{t('analysis.stats.col.winRate')}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{t('analysis.stats.col.net')}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{t('analysis.stats.col.pf')}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{t('analysis.stats.col.avg')}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{t('analysis.stats.col.maxDd')}</th>
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
                  signTone(stats.net, 'text-muted-foreground'),
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
              <td className={cn('whitespace-nowrap px-3 py-1.5 text-right', signTone(stats.avg, ''))} data-testid="breakdown-avg">
                {stats.avg === null ? '—' : signed(stats.avg)}
              </td>
              <td className={cn('whitespace-nowrap px-3 py-1.5 text-right', signTone(-stats.maxDrawdown, ''))} data-testid="breakdown-max-dd">
                {signed(-stats.maxDrawdown)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
