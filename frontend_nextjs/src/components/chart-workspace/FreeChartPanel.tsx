'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import SymbolAutoComplete from '@/components/SymbolAutoComplete';
import { ChartCore } from '@/components/analysis/chart/ChartCore';
import { TimeframeSelect } from '@/components/analysis/chart/TimeframeSelect';
import { AnalysisSettingsPanel } from '@/components/analysis/AnalysisSettingsPanel';
import { Badge } from '@/components/ui/badge';
import { formatOffset } from '@/components/analysis/BrokerClockNotice';
import { LicenseInfo } from '@/components/analysis/LicenseInfo';
import { DataQualityBanner } from '@/components/analysis/DataQualityBanner';
import { ChartPage } from '@/components/chart-page/ChartPage';
import { ChartNotice, ChartOverlays } from '@/components/chart-page/ChartOverlays';
import { ChartTopBar, type ChartChrome } from '@/components/chart-page/ChartTopBar';
import { Alert } from '@/components/ui/alert';
import { InfoHint } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { useMarketRates } from '@/hooks/useMarketRates';
import { useTrendPath } from '@/hooks/useTrendPath';
import { TrendToggle } from './TrendToggle';
import { useSymbolDetails } from '@/hooks/useSymbolDetails';
import { useT } from '@/i18n';
import { buildChartData, TIMEFRAME_SEC, type Timeframe } from '@/lib/analysis/candles';
import { workspaceKey } from '@/lib/chart-workspace/settings';
import { brokerNow } from '@/lib/serverTime';
import { useConnectionStore } from '@/store/useConnectionStore';
import { useBotRuntimeStore, useWebSocketManager, useSettingsStore } from '@/store';
import { useAnalysisPrefsStore } from '@/store/useAnalysisPrefsStore';

/** Die Bedienung liegt oben auf dem Chart: die Kerzen beginnen darunter (wie auf /formasyon) */
const controlMargins = (width: number) => ({ top: width < 640 ? 0.4 : 0.3, bottom: 0.12 });

export function FreeChartPanel({ accountId, symbol, onSymbol, timeframe, onTimeframe, range, offsetSec, clockReady, chrome }: {
  accountId: string; symbol: string | null; onSymbol: (symbol: string) => void; timeframe: Timeframe; onTimeframe: (tf: Timeframe) => void;
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
  const request = useMemo(() => accepted && clockReady ? { accountId, symbol: accepted, timeframe, ...range } : null, [accepted, clockReady, accountId, timeframe, range]);
  const rates = useMarketRates(request, now);
  const data = useMemo(() => rates.data ? buildChartData(rates.data.bars, rates.data.missing, TIMEFRAME_SEC[timeframe], now()) : null, [rates.data, timeframe, now]);
  const live = useMemo(() => {
    const last = rates.data?.bars.at(-1);
    if (!isConnected || offsetSec === null || !accepted || !metrics.symbol || metrics.symbol.toUpperCase() !== accepted.toUpperCase() || rates.data?.liveFrom == null || metrics.market_open === false || !last || metrics.price <= 0 || Math.abs(metrics.price / last.close - 1) >= .2) return null;
    return { price: metrics.price, nowSec: brokerNow(offsetSec) };
  }, [isConnected, offsetSec, accepted, metrics.symbol, metrics.price, metrics.market_open, rates.data]);
  const prefs = useAnalysisPrefsStore();
  const trend = useTrendPath({ accountId, symbol: accepted, timeframe, range, offsetSec, clockReady }, prefs.showTrend, prefs.trend, now);
  useEffect(() => { useAnalysisPrefsStore.persist.rehydrate(); }, []);
  const symbolField = (
    <div className="flex min-w-0 flex-1 items-center gap-1 sm:w-44 sm:flex-none" data-tooltip-exempt>
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
    {rates.data && data && <ChartNotice><DataQualityBanner missing={data.missing} clipped={rates.data.clipped} dbFull={rates.data.dbFull} loadedFrom={rates.data.from} /></ChartNotice>}
    {rates.loading && <p className="rounded-lg bg-background/95 p-2 text-sm text-muted-foreground">{t('analysis.chart.loading')}</p>}
  </>;
  return <ChartPage
    title={t('analysis.title')}
    testId="chart-page"
      surfaceBelowNav
    panelShown={false}
    panel={null}
    notices={null}
    topBar={<ChartTopBar
      selectors={<>{chrome.account}{chrome.mode}{symbolField}</>}
      timeframes={<TimeframeSelect value={timeframe} onChange={onTimeframe} />}
      actions={<>{chrome.range}{chrome.view}<LicenseInfo /><AnalysisSettingsPanel /></>}
    />}
    surface={<div className="absolute inset-0" data-testid="free-chart-panel">
      {data && accepted && <ChartCore key={accepted} workspace={{ key: workspaceKey({ source, view: 'analysis', mode: 'free', account: accountId, symbol: accepted }), symbol: accepted, view: 'free', syncIdentity: { source, account: accountId, symbol: accepted } }}
        workspaceOverlays={<div className="space-y-3"><Switch label={t('analysis.settings.pauses')} hint={t('analysis.settings.pauses.hint')} checked={prefs.showPauses} onChange={v => prefs.setPref('showPauses', v)} /><Switch label={t('analysis.settings.gaps')} hint={t('analysis.settings.gaps.hint')} checked={prefs.showGaps} onChange={v => prefs.setPref('showGaps', v)} /></div>}
        data={data} timeframeSec={TIMEFRAME_SEC[timeframe]} digits={rates.data?.digits ?? null} viewKey={`${accountId}|${accepted}|${timeframe}|${range.from}|${range.to}`}
        band={null} lines={[]} markers={[]} showPauses={prefs.showPauses} showGaps={prefs.showGaps} showRsi live={live} trendPath={trend} toolbarActions={<TrendToggle timeframe={timeframe} size="xs" />} clockNow={offsetSec === null || rates.data?.liveFrom == null ? null : now()}
        marginsFor={controlMargins} overlayLayout fullscreenOfPage />}
    </div>}
    floating={<ChartOverlays notices={notices} />}
  />;
}
