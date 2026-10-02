'use client';

import { Crosshair, History, Loader2 } from 'lucide-react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { useFormat, useT } from '@/i18n';
import type { Trade } from '@/lib/analysis/tradePairing';
import type { DealsMissing } from '@/services/historyApi';
import { cn } from '@/lib/utils';

/** So viele Zeilen werden gezeigt (neueste zuerst), der Rest gezählt */
const MAX_ROWS = 500;
/** DEAL_REASON_*: wie wurde geschlossen */
const REASON_KEYS = {
  4: 'analysis.trades.reason.sl',
  5: 'analysis.trades.reason.tp',
  6: 'analysis.trades.reason.so',
} as const;

interface TradesTableProps {
  trades: Trade[];
  /** Einstiege in diesem Zeitraum, die (noch) nicht geschlossen sind */
  openEntries: number;
  /** Trades anderer Zonen, manuelle und andere Symbole im Zeitraum (nicht in dieser Liste) */
  otherTrades: number;
  /** Beginn des Zeitraums (MT5-Zeit): früher eröffnete Trades werden markiert */
  from: number;
  digits: number | null;
  currency: string | null;
  loading: boolean;
  error: string | null;
  missing: DealsMissing[];
  onFocus: (trade: Trade) => void;
}

/**
 * Trade-Archiv der Zone (ANA-08): Ausstiege im Zeitraum, neueste zuerst. Teilschließung, Umkehr und
 * Close By sind gekennzeichnet; Trades aus der Zeit vor dem Zonen-Register heißen „Zone unbekannt“.
 * Lücken im Archiv (Konto beschäftigt, MT5-Fehler) stehen als Pflicht-Hinweis darüber.
 */
export function TradesTable({
  trades,
  openEntries,
  otherTrades,
  from,
  digits,
  currency,
  loading,
  error,
  missing,
  onFocus,
}: TradesTableProps) {
  const t = useT();
  const fmt = useFormat();
  const rows = [...trades].reverse().slice(0, MAX_ROWS);
  const money = (v: number) =>
    `${v > 0 ? '+' : ''}${fmt.number(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ''}`;
  const price = (v: number) => fmt.price(v, digits ?? 5);

  return (
    <Card data-testid="trades-archive">
      <CardHeader
        icon={<History size={16} />}
        title={t('analysis.trades.title')}
        description={t('analysis.trades.subtitle')}
        actions={
          loading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label={t('analysis.trades.loading')} />
          ) : undefined
        }
      />
      <div className="space-y-3 px-5 pb-5 pt-4">
        {error && (
          <Alert tone="danger" title={t('analysis.trades.loadFailed')}>
            {error}
          </Alert>
        )}
        {missing.length > 0 && (
          <div data-testid="trades-missing">
            <Alert tone="warning" title={t('analysis.trades.missing.title')}>
              <ul className="space-y-0.5 font-mono text-xs tabular-nums">
                {missing.map((m) => (
                  <li key={`${m.from}-${m.to}-${m.reason}`}>
                    {fmt.mt5DateTime(m.from)} – {fmt.mt5DateTime(m.to)} ·{' '}
                    {t(m.reason === 'busy' ? 'analysis.data.reason.busy' : 'analysis.data.reason.error')}
                  </li>
                ))}
              </ul>
            </Alert>
          </div>
        )}

        {!loading && !error && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="trades-empty">
            {t('analysis.trades.empty')}
          </p>
        ) : rows.length > 0 ? (
          <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
            <table className="w-full min-w-[46rem] text-xs">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t('analysis.trades.col.closed')}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t('analysis.trades.col.side')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t('analysis.trades.col.volume')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t('analysis.trades.col.entry')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t('analysis.trades.col.exit')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t('analysis.trades.col.net')}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t('analysis.trades.col.zone')}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t('analysis.trades.col.notes')}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    <span className="sr-only">{t('analysis.trades.focus')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {rows.map((tr) => {
                  const reasonKey =
                    tr.exitReason !== null ? REASON_KEYS[tr.exitReason as keyof typeof REASON_KEYS] : undefined;
                  return (
                    <tr
                      key={tr.id}
                      data-testid="trade-row"
                      data-zone={tr.zone.kind}
                      data-partial={tr.partial || undefined}
                      data-reversal={tr.reversal || undefined}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="whitespace-nowrap px-3 py-1.5 text-foreground">{fmt.mt5DateTime(tr.exitTime)}</td>
                      <td
                        className={cn('px-3 py-1.5 font-semibold', tr.side === 'buy' ? 'text-success' : 'text-danger')}
                      >
                        {tr.side === 'buy' ? 'BUY' : 'SELL'}
                      </td>
                      <td className="px-3 py-1.5 text-right text-foreground">
                        {fmt.number(tr.volume, { maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">
                        {tr.entryPrice !== null ? price(tr.entryPrice) : '–'}
                      </td>
                      <td className="px-3 py-1.5 text-right text-foreground">{price(tr.exitPrice)}</td>
                      <td
                        className={cn(
                          'whitespace-nowrap px-3 py-1.5 text-right font-semibold',
                          tr.net > 0 ? 'text-success' : tr.net < 0 ? 'text-danger' : 'text-muted-foreground',
                        )}
                        data-testid="trade-net"
                      >
                        {money(tr.net)}
                      </td>
                      <td className="px-3 py-1.5 font-sans" data-testid="trade-zone">
                        {tr.zone.kind === 'zone' ? (
                          <span className="text-foreground">{tr.zone.label ?? `#${tr.zone.magic}`}</span>
                        ) : (
                          <Badge tone="warning" hint={t('analysis.trades.unknownZone.hint')}>
                            {t('analysis.trades.unknownZone')}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-1.5 font-sans">
                        <div className="flex flex-wrap gap-1">
                          {reasonKey && <Badge hint={t(`${reasonKey}.hint`)}>{t(reasonKey)}</Badge>}
                          {tr.partial && (
                            <Badge tone="info" hint={t('analysis.trades.partial.hint')}>
                              {t('analysis.trades.partial')}
                            </Badge>
                          )}
                          {tr.reversal && (
                            <Badge tone="info" hint={t('analysis.trades.reversal.hint')}>
                              {t('analysis.trades.reversal')}
                            </Badge>
                          )}
                          {tr.closeBy && (
                            <Badge hint={t('analysis.trades.closeBy.hint')}>{t('analysis.trades.closeBy')}</Badge>
                          )}
                          {tr.entryTime === null ? (
                            <Badge tone="warning" hint={t('analysis.trades.noEntry.hint')}>
                              {t('analysis.trades.noEntry')}
                            </Badge>
                          ) : (
                            tr.entryTime < from && (
                              <Badge
                                hint={t('analysis.trades.openedBefore.hint', {
                                  at: fmt.mt5DateTime(tr.entryTime),
                                })}
                              >
                                {t('analysis.trades.openedBefore')}
                              </Badge>
                            )
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          hint={t('analysis.trades.focus.hint')}
                          aria-label={t('analysis.trades.focus')}
                          onClick={() => onFocus(tr)}
                        >
                          <Crosshair size={13} />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground" data-testid="trades-summary">
          {t('analysis.trades.summary', {
            trades: trades.length,
            open: openEntries,
            other: otherTrades,
          })}
          {trades.length > MAX_ROWS ? ` ${t('analysis.trades.more', { n: trades.length - MAX_ROWS })}` : ''}
        </p>
      </div>
    </Card>
  );
}
