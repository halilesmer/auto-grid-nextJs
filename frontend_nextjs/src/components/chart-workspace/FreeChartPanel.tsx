'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import SymbolAutoComplete from '@/components/SymbolAutoComplete';
import { ChartView } from '@/components/chart-page/ChartView';
import { TimeframeSelect } from '@/components/analysis/chart/TimeframeSelect';
import { Badge } from '@/components/ui/badge';
import { formatOffset } from '@/components/analysis/BrokerClockNotice';
import { LicenseInfo } from '@/components/analysis/LicenseInfo';
import { DataQualityBanner } from '@/components/analysis/DataQualityBanner';
import { ChartPage } from '@/components/chart-page/ChartPage';
import { ChartNotice, ChartOverlays } from '@/components/chart-page/ChartOverlays';
import { ChartTopBar, type ChartChrome } from '@/components/chart-page/ChartTopBar';
import { Alert } from '@/components/ui/alert';
import { InfoHint } from '@/components/ui/tooltip';
import { useMarketRates } from '@/hooks/useMarketRates';
import { useSignalBars } from '@/hooks/useSignalBars';
import { useTrendPath } from '@/hooks/useTrendPath';
import { TrendToggle } from './TrendToggle';
import { useSymbolDetails } from '@/hooks/useSymbolDetails';
import { useT } from '@/i18n';
import { buildChartData, CHART_TIMEFRAME_SEC, CHART_TIMEFRAMES, dataTimeframeOf, type Bar, type ChartTimeframe } from '@/lib/analysis/candles';
import { barEnd, calendarFromDaily, isCalendarTimeframe, liveCalendarBar, periodStart } from '@/lib/analysis/calendarBars';
import { DAY_SEC } from '@/lib/serverTime';
import { workspaceKey } from '@/lib/chart-workspace/settings';
import { brokerNow } from '@/lib/serverTime';
import { useConnectionStore } from '@/store/useConnectionStore';
import { useBotRuntimeStore, useWebSocketManager, useSettingsStore } from '@/store';
import { useAnalysisPrefsStore } from '@/store/useAnalysisPrefsStore';

export function FreeChartPanel({ accountId, symbol, onSymbol, timeframe, onTimeframe, range, offsetSec, clockReady, chrome }: {
  accountId: string; symbol: string | null; onSymbol: (symbol: string) => void; timeframe: ChartTimeframe; onTimeframe: (tf: ChartTimeframe) => void;
  range: { from: number | null; to: number }; offsetSec: number | null; clockReady: boolean; chrome: ChartChrome;
}) {
  const t = useT();
  const { isConnected } = useWebSocketManager(accountId);
  const metrics = useBotRuntimeStore(s => s.metrics);
  const details = useSymbolDetails(accountId), source = useConnectionStore(s => s.baseUrl);
  const isLoading = useSettingsStore(s => s.isLoadingSymbols);
  const symbolsError = useSettingsStore(s => s.symbolsError);
  const [ready, setReady] = useState(false), [input, setInput] = useState(symbol ?? '');
  // The symbol hook clears the old account in its effect. Do not request candles from stale symbols on the first frame.
  useEffect(() => { const frame = requestAnimationFrame(() => setReady(true)); return () => cancelAnimationFrame(frame); }, []);
  useEffect(() => { const frame = requestAnimationFrame(() => setInput(symbol ?? '')); return () => cancelAnimationFrame(frame); }, [symbol]);
  const selected = ready && symbol ? details[symbol.toUpperCase()] : null;
  const accepted = selected?.name === symbol ? symbol : null;
  const now = useCallback(() => offsetSec === null ? Date.now() / 1000 : brokerNow(offsetSec), [offsetSec]);
  // W1 and MN are built from D1 in the browser (1107-A4.2). The request starts at a week or month start, so the first candle is whole.
  const calendar = isCalendarTimeframe(timeframe) ? timeframe : null;
  const askRange = useMemo(() => calendar && range.from !== null ? { ...range, from: periodStart(calendar, range.from) } : range, [calendar, range]);
  const request = useMemo(() => accepted && clockReady ? { accountId, symbol: accepted, timeframe: dataTimeframeOf(timeframe), ...askRange } : null, [accepted, clockReady, accountId, timeframe, askRange]);
  const d1 = useMarketRates(request, now);
  const ratesData = useMemo(() => {
    if (!calendar || !d1.data) return d1.data;
    const bars: Bar[] = calendarFromDaily(calendar, d1.data.bars, d1.data.missing, d1.data.from);
    const liveFrom = d1.data.liveFrom === null ? null : periodStart(calendar, d1.data.liveFrom);
    return { ...d1.data, bars, liveFrom };
  }, [d1.data, calendar]);
  const rates = { data: ratesData, loading: d1.loading, error: d1.error };
  // Left edge of the chart (1107-A4.3): a pill shows while a page loads and where loading ends. Not shown while more pages wait.
  const endOfData = d1.data?.older === 'range' || d1.data?.older === 'history' || d1.data?.older === 'limit' ? d1.data.older : null;
  const olderEdge = d1.loadingOlder ? 'loading' as const : endOfData;
  const tfSec = CHART_TIMEFRAME_SEC[timeframe];
  const data = useMemo(() => {
    if (!rates.data) return null;
    if (!calendar) return buildChartData(rates.data.bars, rates.data.missing, tfSec, now());
    // No gap slots on W1 and MN: the missing D1 ranges show in the banner only.
    return buildChartData(rates.data.bars, [], tfSec, now());
  }, [rates.data, calendar, tfSec, now]);
  const dailyMissing = useMemo(() => calendar && d1.data ? buildChartData(d1.data.bars, d1.data.missing, DAY_SEC, now()).missing : null, [calendar, d1.data, now]);
  const signalBars = useSignalBars(rates.data, timeframe, offsetSec, now);
  const live = useMemo(() => {
    const last = rates.data?.bars.at(-1);
    if (!isConnected || offsetSec === null || !accepted || !metrics.symbol || metrics.symbol.toUpperCase() !== accepted.toUpperCase() || rates.data?.liveFrom == null || metrics.market_open === false || !last || metrics.price <= 0 || Math.abs(metrics.price / last.close - 1) >= .2) return null;
    return { price: metrics.price, nowSec: brokerNow(offsetSec) };
  }, [isConnected, offsetSec, accepted, metrics.symbol, metrics.price, metrics.market_open, rates.data]);
  // ChartCore aligns the running candle to fixed seconds. That does not fit a week or month, so for W1 and MN the price goes into the last candle here.
  const calendarLive = useMemo(() => {
    if (!calendar || !live || !rates.data) return null;
    return liveCalendarBar(calendar, rates.data.bars.at(-1) ?? null, live.price, live.nowSec);
  }, [calendar, live, rates.data]);
  const shown = useMemo(() => {
    if (!data || !calendarLive) return data;
    return buildChartData([...rates.data!.bars.slice(0, -1), calendarLive], [], tfSec, now());
  }, [data, calendarLive, rates.data, tfSec, now]);
  const prefs = useAnalysisPrefsStore();
  const trend = useTrendPath({ accountId, symbol: accepted, timeframe, range, offsetSec, clockReady }, prefs.showTrend, prefs.trend, now);
  useEffect(() => { useAnalysisPrefsStore.persist.rehydrate(); }, []);
  const symbolField = (
    <div className="flex min-w-0 flex-1 items-center gap-1 @max-[30rem]/formation-main:w-34 @max-[30rem]/formation-main:max-w-full @max-[30rem]/formation-main:flex-none sm:w-44 sm:max-w-full sm:flex-none" data-tooltip-exempt data-testid="chart-symbol">
      <SymbolAutoComplete key={`${accountId}:${symbol}`} aria-label={t('cw.symbol')} value={input} onChange={setInput} preserveCase symbolDetails={ready ? details : {}} onCommit={value => { const found = details[value.toUpperCase()]; if (found) { setInput(found.name); onSymbol(found.name); } }} />
      {/* Der Hinweis sitzt am (i): ein Tooltip am Eingabefeld läge beim Tippen über der Liste */}
      <InfoHint hint={t('cw.chooseSymbol.hint')} />
    </div>
  );
  const notices = <>
    {offsetSec !== null && <ChartNotice><Badge tone="info" hint={t('analysis.clock.badge.hint')} data-testid="broker-clock">{t('analysis.clock.badge', { offset: formatOffset(offsetSec) })}</Badge></ChartNotice>}
    {chrome.notices}
    {!symbol && <ChartNotice><Alert tone="info" title={t('cw.chooseSymbol')} /></ChartNotice>}
    {symbolsError && <ChartNotice><Alert tone="warning" title={symbolsError} /></ChartNotice>}
    {symbol && ready && !isLoading && !accepted && <ChartNotice><Alert tone="warning" title={t('cw.invalidSymbol')} /></ChartNotice>}
    {rates.error && <ChartNotice><Alert tone="danger" title={rates.error} /></ChartNotice>}
    {trend.error && <ChartNotice><Alert tone="danger" title={trend.error} /></ChartNotice>}
    {rates.data && data && <ChartNotice><DataQualityBanner missing={dailyMissing ?? data.missing} clipped={rates.data.clipped} dbFull={rates.data.dbFull} loadedFrom={rates.data.from} calendar={calendar !== null} scroll allHistory={range.from === null} limit={rates.data.older === 'limit'} /></ChartNotice>}
    {rates.loading && <p className="rounded-lg bg-background/95 p-2 text-sm text-muted-foreground">{t('analysis.chart.loading')}</p>}
  </>;
  return <ChartPage
    title={t('nav.chart')}
    testId="chart-page"
    panelShown={false}
    panel={null}
    notices={null}
    topBar={<ChartTopBar
      account={chrome.account}
      mode={chrome.mode}
      target={symbolField}
      timeframes={<TimeframeSelect value={timeframe} onChange={onTimeframe} options={CHART_TIMEFRAMES} />}
      range={chrome.range}
      view={chrome.view}
      tools={<LicenseInfo />}
    />}
    surface={<div className="absolute inset-0" data-testid="free-chart-panel">
      {shown && accepted && <ChartView key={accepted} workspace={{ key: workspaceKey({ source, view: 'analysis', mode: 'free', account: accountId, symbol: accepted }), symbol: accepted, view: 'free', syncIdentity: { source, account: accountId, symbol: accepted } }}
        signalBars={signalBars} timeframe={timeframe}
        data={shown ?? data!} timeframeSec={tfSec} until={calendar ? barEnd(calendar, (shown ?? data!).bars.at(-1)?.time ?? 0) : undefined} digits={rates.data?.digits ?? null} viewKey={`${accountId}|${accepted}|${timeframe}|${range.from}|${range.to}`}
        band={null} lines={[]} markers={[]} live={calendar ? null : live} trendPath={trend} toolbarActions={<TrendToggle timeframe={timeframe} size="xs" />} clockNow={calendar || offsetSec === null || rates.data?.liveFrom == null ? null : now()}
        onNeedOlder={d1.loadOlder} olderEdge={olderEdge}
        fullscreenOfPage />}
    </div>}
    floating={<ChartOverlays notices={notices} />}
  />;
}
