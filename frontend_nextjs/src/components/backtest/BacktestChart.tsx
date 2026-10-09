'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, RotateCcw, Square } from 'lucide-react';

import { ChartCore, type OverlayLine, type TradeLinkLine, type TradeMarker } from '@/components/analysis/chart/ChartCore';
import { TradesTable } from '@/components/analysis/TradesTable';
import AnimatedTabs from '@/components/ui/animated-tabs';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { useFormat, useT } from '@/i18n';
import { buildChartData, TIMEFRAME_SEC, type Timeframe } from '@/lib/analysis/candles';
import type { Excursion } from '@/lib/analysis/excursions';
import type { RunResult } from '@/lib/backtest/runner';
import type { RunContext } from '@/store/useBacktestStore';
import { useBacktestStore } from '@/store/useBacktestStore';
import type { ZoneSettings } from '@/store/types';
import { zoneLevels } from '@/lib/analysis/levels';

const DISPLAY_TFS: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];
type ReplaySpeed = '1' | '5' | '10' | 'max';
const EMPTY_BARS: { time: number; open: number; high: number; low: number; close: number }[] = [];

function makeBalanceCurve(result: RunResult, cursor: number | null) {
  const sorted = [...result.trades].sort((a, b) => a.exitTime - b.exitTime || a.exitTicket - b.exitTicket);
  let at = 0;
  let value = result.summary.startCapital;
  const points = result.equity.map((point) => {
    while (at < sorted.length && sorted[at].exitTime <= point.time) {
      value += sorted[at].net;
      at += 1;
    }
    return { time: point.time, value };
  });
  return points.filter((point) => cursor === null || point.time < cursor);
}

export function BacktestChart({
  result,
  context,
  requestBars,
  onReplayCursorChange,
}: {
  result: RunResult;
  context: RunContext;
  requestBars: (timeframe: Timeframe, from: number, to: number) => void;
  onReplayCursorChange: (time: number | null) => void;
}) {
  const t = useT();
  const fmt = useFormat();
  const chartData = useBacktestStore((s) => s.runs[context.setupId]?.chartData);
  const [timeframe, setTimeframe] = useState<Timeframe>(context.params.dataTimeframe);
  const [speed, setSpeed] = useState<ReplaySpeed>('1');
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [focus, setFocus] = useState<{ time: number; seq: number } | null>(null);

  useEffect(() => {
    requestBars(timeframe, context.params.from, context.params.to);
  }, [timeframe, context.params.from, context.params.to, requestBars]);

  const compatibleTfs = DISPLAY_TFS.filter((tf) => TIMEFRAME_SEC[tf] >= TIMEFRAME_SEC[context.params.dataTimeframe]);
  const activeData = chartData?.timeframe === timeframe ? chartData : null;
  const bars = activeData?.bars ?? EMPTY_BARS;
  const tfSec = TIMEFRAME_SEC[timeframe];

  // Der Replay-Zeitpunkt bleibt auch beim Laden eines anderen Zeitrahmens erhalten.
  const visibleCount = cursor === null ? bars.length : bars.filter((bar) => bar.time + tfSec <= cursor).length;
  const replayIndex = cursor === null ? null : visibleCount - 1;

  useEffect(() => {
    if (!playing || bars.length === 0) return;
    const current = visibleCount - 1;
    const next = Math.min(bars.length - 1, current + (speed === 'max' ? 100 : Number(speed)));
    const timer = window.setTimeout(() => {
      setCursor(bars[next].time + tfSec);
      onReplayCursorChange(bars[next].time + tfSec);
      if (next >= bars.length - 1) setPlaying(false);
    }, speed === 'max' ? 100 : 1000);
    return () => window.clearTimeout(timer);
  }, [playing, speed, bars, visibleCount, tfSec, onReplayCursorChange]);

  const visibleBars = useMemo(() => bars.slice(0, visibleCount), [bars, visibleCount]);
  const chart = useMemo(
    () => buildChartData(visibleBars, activeData?.missing ?? [], tfSec, cursor ?? context.params.to),
    [visibleBars, activeData?.missing, tfSec, cursor, context.params.to],
  );

  const trades = useMemo(
    () => result.trades.filter((trade) => cursor === null || trade.exitTime < cursor),
    [result.trades, cursor],
  );
  const readyExcursions = useMemo(() => {
    const out: Record<string, Excursion> = {};
    for (const trade of trades) {
      const excursion = result.excursions[trade.id];
      if (excursion) out[trade.id] = excursion;
    }
    return out;
  }, [trades, result.excursions]);
  const visibleTimes = useMemo(() => new Set(visibleBars.map((bar) => bar.time)), [visibleBars]);
  const markers = useMemo<TradeMarker[]>(() => {
    const out: TradeMarker[] = [];
    for (const trade of result.trades) {
      if (cursor !== null && trade.entryTime !== null && trade.entryTime >= cursor) continue;
      const entry = trade.entryTime === null ? null : Math.floor(trade.entryTime / tfSec) * tfSec;
      if (entry !== null && trade.entryPrice !== null && visibleTimes.has(entry)) {
        out.push({
          key: `${trade.id}-entry`,
          time: entry,
          price: trade.entryPrice ?? 0,
          kind: trade.side === 'buy' ? 'entryBuy' : 'entrySell',
          tone: trade.side === 'buy' ? 'up' : 'down',
        });
      }
      if (cursor !== null && trade.exitTime >= cursor) continue;
      const exit = Math.floor(trade.exitTime / tfSec) * tfSec;
      if (visibleTimes.has(exit)) {
        let text: string | undefined;
        if (trade.exitReason === 4) text = t('backtest.chart.sl');
        else if (trade.exitReason === 5) text = t('backtest.chart.tp');
        out.push({
          key: `${trade.id}-exit`,
          time: exit,
          price: trade.exitPrice,
          kind: 'exit',
          tone: trade.net >= 0 ? 'up' : 'down',
          text,
        });
      }
    }
    return out;
  }, [result.trades, cursor, tfSec, visibleTimes, t]);
  const links = useMemo<TradeLinkLine[]>(
    () =>
      trades.flatMap((trade) =>
        trade.entryTime === null || trade.entryPrice === null
          ? []
          : [{
              key: trade.id,
              from: { time: trade.entryTime, price: trade.entryPrice },
              to: { time: trade.exitTime, price: trade.exitPrice },
              tone: trade.net >= 0 ? 'up' : 'down',
            }],
      ),
    [trades],
  );

  const lastPrice = visibleBars.at(-1)?.close ?? null;
  const zone = context.params.zone as unknown as ZoneSettings;
  const band = useMemo(
    () => Number.isFinite(zone.min_price) && Number.isFinite(zone.max_price) ? { min: zone.min_price, max: zone.max_price } : null,
    [zone],
  );
  const levels = useMemo(
    () => zoneLevels(zone, lastPrice, [], { [context.params.symbol.name.toUpperCase()]: context.params.symbol }, { point: context.params.symbol.point, digits: context.params.symbol.digits }),
    [zone, lastPrice, context.params.symbol],
  );
  const lines = useMemo<OverlayLine[]>(() => [
    ...(band ? [
      { key: 'zone-min', price: band.min, title: t('backtest.chart.zone.min'), tone: 'muted' as const, style: 'dashed' as const },
      { key: 'zone-max', price: band.max, title: t('backtest.chart.zone.max'), tone: 'muted' as const, style: 'dashed' as const },
    ] : []),
    ...levels.buy.map((price, i) => ({ key: `buy-${i}`, price, title: t('backtest.chart.level.buy'), tone: 'up' as const, style: 'dotted' as const })),
    ...levels.sell.map((price, i) => ({ key: `sell-${i}`, price, title: t('backtest.chart.level.sell'), tone: 'down' as const, style: 'dotted' as const })),
  ], [band, levels, t]);

  const balance = useMemo(() => makeBalanceCurve(result, cursor), [result, cursor]);
  const equity = useMemo(() => result.equity.filter((point) => cursor === null || point.time < cursor), [result.equity, cursor]);

  const tfTabs = compatibleTfs.map((tf) => ({ id: tf, label: tf, hint: t('backtest.chart.timeframe.hint', { tf }) }));
  const speedTabs = (['1', '5', '10', 'max'] as const).map((item) => ({
    id: item,
    label: item === 'max' ? t('backtest.chart.speed.max') : `${item}×`,
    hint: t('backtest.chart.speed.hint', { speed: item === 'max' ? t('backtest.chart.speed.max') : `${item}×` }),
  }));
  const first = bars[0];
  const ended = replayIndex !== null && replayIndex >= bars.length - 1;

  return (
    <div className="space-y-4" data-testid="bt-chart" data-timeframe={timeframe} data-bars={visibleBars.length} data-replay-index={replayIndex ?? 'all'}>
      <Card>
        <CardHeader title={t('backtest.chart.title')} description={t('backtest.chart.subtitle')} />
        <div className="space-y-4 px-5 pb-5 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="max-w-full overflow-x-auto">
              <AnimatedTabs tabs={tfTabs} activeTab={timeframe} onChange={(id) => { setTimeframe(id as Timeframe); setPlaying(false); }} layoutId={`bt-tf-${result.path}`} variant="segment" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="icon-sm"
                hint={t(playing ? 'backtest.chart.pause.hint' : 'backtest.chart.play.hint')}
                aria-label={t(playing ? 'backtest.chart.pause' : 'backtest.chart.play')}
                disabled={!first || bars.length < 2}
                onClick={() => {
                  if (playing) { setPlaying(false); return; }
                  if (ended || replayIndex === null) {
                    if (first) { setCursor(first.time + tfSec); onReplayCursorChange(first.time + tfSec); }
                  }
                  setPlaying(true);
                }}
              >
                {playing ? <Pause size={14} /> : <Play size={14} />}
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                hint={t('backtest.chart.restart.hint')}
                aria-label={t('backtest.chart.restart')}
                disabled={!first}
                onClick={() => { setPlaying(false); if (first) { setCursor(first.time + tfSec); onReplayCursorChange(first.time + tfSec); } }}
              >
                <RotateCcw size={14} />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                hint={t('backtest.chart.finish.hint')}
                aria-label={t('backtest.chart.finish')}
                disabled={cursor === null}
                onClick={() => { setPlaying(false); setCursor(null); onReplayCursorChange(null); }}
              >
                <Square size={14} />
              </Button>
              <div className="max-w-[16rem] overflow-x-auto">
                <AnimatedTabs tabs={speedTabs} activeTab={speed} onChange={(id) => setSpeed(id as ReplaySpeed)} layoutId={`bt-speed-${result.path}`} variant="segment" />
              </div>
            </div>
          </div>
          {activeData?.clipped && <Alert tone="info" title={t('backtest.chart.clipped')} />}
          {cursor !== null && <p className="text-xs text-muted-foreground" data-testid="bt-replay-time">{t('backtest.chart.replayAt', { time: fmt.mt5DateTime(cursor) })}</p>}
          {!activeData && <p className="py-16 text-center text-sm text-muted-foreground">{t('backtest.chart.loading')}</p>}
          {activeData && visibleBars.length === 0 && <p className="py-16 text-center text-sm text-muted-foreground">{t('backtest.chart.empty')}</p>}
          {activeData && visibleBars.length > 0 && (
            <>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label={t('backtest.chart.curves.hint')}>
                <span className="text-success">● {t('backtest.chart.equity')}</span>
                <span className="text-info">● {t('backtest.chart.balance')}</span>
              </div>
              <ChartCore
                data={chart}
                timeframeSec={tfSec}
                digits={context.params.symbol.digits}
                viewKey={`${result.path}-${timeframe}-${context.params.from}-${context.params.to}`}
                band={band}
                lines={lines}
                showPauses={true}
                showRsi={false}
                live={null}
                markers={markers}
                links={links}
                focus={focus}
                equity={equity}
                balance={balance}
                followTail={cursor !== null}
              />
            </>
          )}
        </div>
      </Card>
      <TradesTable
        accountId={context.params.accountId}
        variant="zone"
        trades={trades}
        openEntries={0}
        otherTrades={0}
        from={context.params.from}
        digits={context.params.symbol.digits}
        currency={context.currency}
        loading={false}
        error={null}
        missing={[]}
        setupLabel={() => context.params.zoneLabel ?? context.params.symbol.name}
        readyExcursions={readyExcursions}
        onFocus={(trade) => setFocus({ time: trade.exitTime, seq: (focus?.seq ?? 0) + 1 })}
      />
    </div>
  );
}
