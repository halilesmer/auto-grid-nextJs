'use client';

import { useCallback, useMemo, useState } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';

import { Alert } from '@/components/ui/alert';
import AnimatedTabs from '@/components/ui/animated-tabs';
import { Card, CardHeader } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { InfoHint } from '@/components/ui/tooltip';
import { useDealsHistory } from '@/hooks/useDealsHistory';
import { useSetupLabel } from '@/hooks/useSetupLabel';
import { useFormat, useT, type MessageKey } from '@/i18n';
import { balanceCurve, drawdownCurve, realizedCurve } from '@/lib/analysis/curves';
import { breakdown, inScope, type BreakdownKind, type StatsScope } from '@/lib/analysis/groupings';
import { computeStats } from '@/lib/analysis/stats';
import { pairTrades } from '@/lib/analysis/tradePairing';
import { brokerNow } from '@/lib/serverTime';
import { groupBySymbol, setupNumbers } from '@/lib/symbolSetups';
import type { ZoneSettings } from '@/store/types';
import { TradesTable } from '../TradesTable';
import { BreakdownTable } from './BreakdownTable';
import { CurveChart } from './CurveChart';
import { StatsKpis } from './StatsKpis';

interface StatsTabProps {
  accountId: string;
  zones: ZoneSettings[] | null;
  /** Setup (Zone) aus der Adresse: Vorauswahl des Umfangs */
  zoneId: string | null;
  /** MT5-Sekunden, halb offen; from null = alles */
  range: { from: number | null; to: number };
  offsetSec: number | null;
  clockReady: boolean;
}

interface ScopeItem {
  key: string;
  scope: StatsScope;
  label: string;
}

type CurveKind = 'realized' | 'balance' | 'drawdown';

function scopeKey(s: StatsScope) {
  if (s.kind === 'account') return 'account';
  if (s.kind === 'symbol') return `symbol:${s.symbol}`;
  return `zone:${s.magic}`;
}

/** Aufteilungen je Umfang; die erste ist die Vorauswahl (Konto je Symbol, Symbol je Setup, Setup je Wochentag) */
const BREAKDOWNS: Record<StatsScope['kind'], BreakdownKind[]> = {
  account: ['symbol', 'zone', 'weekday', 'hour'],
  symbol: ['zone', 'weekday', 'hour'],
  zone: ['weekday', 'hour'],
};

/**
 * Statistik-Tab (ANA-09, ANA-14): Kennzahlen, Kurven und Aufteilung der im Zeitraum geschlossenen Trades für
 * das ganze Konto, ein Symbol (Vergleich seiner Setups) oder ein Setup. Setup über das Register.
 */
export function StatsTab({ accountId, zones, zoneId, range, offsetSec, clockReady }: StatsTabProps) {
  const t = useT();
  const fmt = useFormat();
  const from = range.from ?? 0;

  const request = useMemo(
    () => (clockReady ? { accountId, from, to: range.to } : null),
    [accountId, from, range.to, clockReady],
  );
  const nowSec = useCallback(
    () => (offsetSec !== null ? brokerNow(offsetSec) : Date.now() / 1000),
    [offsetSec],
  );
  const deals = useDealsHistory(request, range.to > nowSec());
  const pairing = useMemo(
    () => (deals.data ? pairTrades(deals.data.deals, deals.data.zones, offsetSec) : null),
    [deals.data, offsetSec],
  );
  const currency = deals.data?.account?.currency ?? null;

  const setupNo = useMemo(() => setupNumbers(zones ?? []), [zones]);
  const zoneLabel = useSetupLabel(zones, deals.data?.zones);

  const scopes: ScopeItem[] = useMemo(() => {
    const items: ScopeItem[] = [{ key: 'account', scope: { kind: 'account' }, label: t('analysis.stats.scope.account') }];
    for (const group of groupBySymbol(zones ?? [])) {
      // Nur gespeicherte Setups (mit Magic) haben Trades
      const saved = group.zones.flatMap((zone) => (zone.magic === undefined ? [] : [{ id: zone.id, magic: zone.magic }]));
      if (saved.length === 0) continue;
      const symbol = group.symbol || '—';
      const ss: StatsScope = { kind: 'symbol', symbol: group.symbol };
      items.push({ key: scopeKey(ss), scope: ss, label: t('analysis.stats.scope.symbol', { symbol, n: saved.length }) });
      for (const { id, magic } of saved) {
        const zs: StatsScope = { kind: 'zone', magic };
        items.push({ key: scopeKey(zs), scope: zs, label: t('analysis.stats.scope.zone', { n: setupNo.get(id) ?? 0, symbol }) });
      }
    }
    return items;
  }, [zones, setupNo, t]);

  const urlZone = zones?.find((z) => z.id === zoneId);
  const defaultKey = urlZone?.magic !== undefined ? `zone:${urlZone.magic}` : 'account';
  // Eine eigene Wahl gilt nur, solange oben dieselbe Zone gewählt ist; ein Zonenwechsel dort setzt den Umfang zurück
  const [choice, setChoice] = useState<{ zoneId: string | null; key: string } | null>(null);
  const chosen = choice?.zoneId === zoneId ? choice.key : null;
  const current = scopes.find((s) => s.key === (chosen ?? defaultKey)) ?? scopes[0];
  const scope = current.scope;

  const breakdownKinds = BREAKDOWNS[scope.kind];
  const [breakdownChoice, setBreakdownChoice] = useState<{ scope: string; kind: BreakdownKind } | null>(null);
  const kind = breakdownChoice?.scope === current.key ? breakdownChoice.kind : breakdownKinds[0];
  const [curve, setCurve] = useState<CurveKind>('realized');

  const view = useMemo(() => {
    if (!pairing) return null;
    const trades = pairing.trades.filter((tr) => tr.exitTime >= from && tr.exitTime < range.to && inScope(tr, scope));
    const realized = realizedCurve(trades, from);
    return {
      trades,
      stats: computeStats(trades),
      openedBefore: trades.filter((tr) => tr.entryTime !== null && tr.entryTime < from).length,
      realized,
      drawdown: drawdownCurve(realized),
    };
  }, [pairing, from, range.to, scope]);
  const groups = useMemo(() => (view ? breakdown(view.trades, kind) : []), [view, kind]);
  const balance = useMemo(
    () =>
      deals.data
        ? balanceCurve(deals.data.deals, deals.data.account?.balance ?? null, { from, to: range.to }, deals.data.missing.length, nowSec())
        : null,
    [deals.data, from, range.to, nowSec],
  );

  const groupLabel = (key: string) => {
    if (key === 'unknown') return t('analysis.trades.unknownZone');
    if (key === 'manual') return t('analysis.stats.group.manual');
    if (key === 'other') return t('analysis.stats.group.other');
    if (kind === 'weekday') return t(`analysis.stats.weekday.${key}` as MessageKey);
    if (kind === 'hour') return `${key.padStart(2, '0')}:00`;
    if (kind === 'symbol') return key.slice(2) || '—';
    return zoneLabel(Number(key.split(':')[1]));
  };

  const breakdownTabs = breakdownKinds.map((k) => ({ id: k, label: t(`analysis.stats.by.${k}`), hint: t(`analysis.stats.by.${k}.hint`) }));
  const curveTabs = (['realized', 'balance', 'drawdown'] as const).map((k) => ({
    id: k,
    label: t(`analysis.stats.curve.${k}`),
    hint: t(`analysis.stats.curve.${k}.hint`),
  }));

  return (
    <div className="space-y-4" data-testid="stats-tab">
      <div data-tooltip-scope className="flex min-w-0 items-center gap-1.5 sm:w-96" data-testid="stats-scope">
        <div className="min-w-0 flex-1">
          <Combobox
            items={scopes}
            value={current.key}
            onChange={(key) => setChoice({ zoneId, key })}
            getKey={(s) => s.key}
            getLabel={(s) => s.label}
            filter={(s, q) => s.label.toLowerCase().includes(q)}
            placeholder={t('analysis.stats.scope')}
            searchPlaceholder={t('analysis.stats.scope')}
            emptyMessage={t('analysis.zone.empty')}
            aria-label={t('analysis.stats.scope')}
          />
        </div>
        <InfoHint hint={t('analysis.stats.scope.hint')} />
      </div>

      {deals.error && (
        <Alert tone="danger" title={t('analysis.trades.loadFailed')}>
          {deals.error}
        </Alert>
      )}
      {deals.data && deals.data.missing.length > 0 && (
        <div data-testid="stats-missing">
          <Alert tone="warning" title={t('analysis.trades.missing.title')}>
            <ul className="space-y-0.5 font-mono text-xs tabular-nums">
              {deals.data.missing.map((m) => (
                <li key={`${m.from}-${m.to}-${m.reason}`}>
                  {fmt.mt5DateTime(m.from)} – {fmt.mt5DateTime(m.to)} ·{' '}
                  {t(m.reason === 'busy' ? 'analysis.data.reason.busy' : 'analysis.data.reason.error')}
                </li>
              ))}
            </ul>
          </Alert>
        </div>
      )}

      {!view ? (
        deals.loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {t('analysis.trades.loading')}
          </div>
        )
      ) : (
        <>
          <StatsKpis stats={view.stats} currency={currency} />
          {view.stats.trades === 0 && (
            <p className="text-sm text-muted-foreground" data-testid="stats-empty">
              {t('analysis.stats.empty')}
            </p>
          )}
          {view.openedBefore > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="stats-opened-before">
              {t('analysis.stats.openedBefore', { n: view.openedBefore })}
            </p>
          )}

          <Card data-testid="stats-curves">
            <CardHeader icon={<BarChart3 size={16} />} title={t('analysis.stats.curves')} />
            <div className="space-y-3 px-5 pb-5 pt-4">
              <div className="overflow-x-auto">
                <AnimatedTabs tabs={curveTabs} activeTab={curve} onChange={(id) => setCurve(id as CurveKind)} layoutId="stats-curve" variant="segment" />
              </div>
              {curve === 'balance' && balance?.ok && (
                <>
                  <CurveChart points={balance.points} base={balance.points[0]?.value ?? 0} testId="curve-balance" />
                  <p className="text-xs text-muted-foreground">{t('analysis.stats.curve.balance.scope')}</p>
                </>
              )}
              {curve === 'balance' && balance && !balance.ok && (
                <p className="text-sm text-muted-foreground" data-testid="curve-balance-off" data-reason={balance.reason}>
                  {t(`analysis.stats.curve.balance.${balance.reason}`)}
                </p>
              )}
              {curve !== 'balance' && (
                <CurveChart
                  points={curve === 'realized' ? view.realized : view.drawdown}
                  base={0}
                  testId={`curve-${curve}`}
                />
              )}
              <p className="text-xs text-muted-foreground" data-testid="curve-equity-note">
                {t('analysis.stats.curve.equity')}
              </p>
            </div>
          </Card>

          <Card data-testid="stats-breakdown">
            <CardHeader icon={<BarChart3 size={16} />} title={t('analysis.stats.breakdown')} />
            <div className="space-y-3 px-5 pb-5 pt-4">
              <div className="overflow-x-auto">
                <AnimatedTabs
                  tabs={breakdownTabs}
                  activeTab={kind}
                  onChange={(id) => setBreakdownChoice({ scope: current.key, kind: id as BreakdownKind })}
                  layoutId="stats-breakdown"
                  variant="segment"
                />
              </div>
              {groups.length > 0 && <BreakdownTable groups={groups} label={groupLabel} currency={currency} />}
            </div>
          </Card>

          <TradesTable
            accountId={accountId}
            variant="scope"
            trades={view.trades}
            openEntries={0}
            otherTrades={0}
            from={from}
            digits={null}
            currency={currency}
            loading={deals.loading}
            error={null}
            missing={[]}
            setupLabel={zoneLabel}
          />
        </>
      )}
    </div>
  );
}
