'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import SymbolAutoComplete from '@/components/SymbolAutoComplete';
import { ChartCore } from '@/components/analysis/chart/ChartCore';
import { TimeframeSelect } from '@/components/analysis/chart/TimeframeSelect';
import { Badge } from '@/components/ui/badge';
import { formatOffset } from '@/components/analysis/BrokerClockNotice';
import { LicenseInfo } from '@/components/analysis/LicenseInfo';
import { DataQualityBanner } from '@/components/analysis/DataQualityBanner';
import { Alert } from '@/components/ui/alert';
import { InputField } from '@/components/ui/InputField';
import { Switch } from '@/components/ui/switch';
import { useMarketRates } from '@/hooks/useMarketRates';
import { useSymbolDetails } from '@/hooks/useSymbolDetails';
import { useT } from '@/i18n';
import { buildChartData, TIMEFRAME_SEC, type Timeframe } from '@/lib/analysis/candles';
import { workspaceKey } from '@/lib/chart-workspace/settings';
import { brokerNow } from '@/lib/serverTime';
import { useConnectionStore } from '@/store/useConnectionStore';
import { useBotRuntimeStore, useWebSocketManager, useSettingsStore } from '@/store';
import { useAnalysisPrefsStore } from '@/store/useAnalysisPrefsStore';

export function FreeChartPanel({ accountId, symbol, onSymbol, timeframe, onTimeframe, range, offsetSec, clockReady }: {
  accountId: string; symbol: string | null; onSymbol: (symbol: string) => void; timeframe: Timeframe; onTimeframe: (tf: Timeframe) => void;
  range: { from: number | null; to: number }; offsetSec: number | null; clockReady: boolean;
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
  useEffect(() => { useAnalysisPrefsStore.persist.rehydrate(); }, []);
  return <div className="min-w-0 space-y-4" data-testid="free-chart-panel">
    <div className="flex flex-wrap items-end gap-3">{offsetSec !== null && <Badge tone="info" hint={t('analysis.clock.badge.hint')} data-testid="broker-clock">{t('analysis.clock.badge', { offset: formatOffset(offsetSec) })}</Badge>}<LicenseInfo /><InputField label={t('cw.symbol')} hint={t('cw.chooseSymbol.hint')} className="w-full sm:w-80"><SymbolAutoComplete key={`${accountId}:${symbol}`} value={input} onChange={setInput} preserveCase symbolDetails={ready ? details : {}} onCommit={value => { const found = details[value.toUpperCase()]; if (found) { setInput(found.name); onSymbol(found.name); } }} /></InputField><TimeframeSelect value={timeframe} onChange={onTimeframe} /></div>
    {!symbol && <Alert tone="info" title={t('cw.chooseSymbol')} />}
    {symbolsError && <Alert tone="warning" title={symbolsError} />}
    {symbol && ready && !isLoading && !accepted && <Alert tone="warning" title={t('cw.invalidSymbol')} />}
    {rates.error && <Alert tone="danger" title={rates.error} />}
    {rates.data && data && <DataQualityBanner missing={data.missing} clipped={rates.data.clipped} dbFull={rates.data.dbFull} loadedFrom={rates.data.from} />}
    {data && accepted && <ChartCore key={accepted} workspace={{ key: workspaceKey({ source, view: 'analysis', mode: 'free', account: accountId, symbol: accepted }), symbol: accepted, view: 'free', syncIdentity: { source, account: accountId, symbol: accepted } }}
      workspaceOverlays={<div className="space-y-3"><Switch label={t('analysis.settings.pauses')} hint={t('analysis.settings.pauses.hint')} checked={prefs.showPauses} onChange={v => prefs.setPref('showPauses', v)} /><Switch label={t('analysis.settings.gaps')} hint={t('analysis.settings.gaps.hint')} checked={prefs.showGaps} onChange={v => prefs.setPref('showGaps', v)} /></div>}
      data={data} timeframeSec={TIMEFRAME_SEC[timeframe]} digits={rates.data?.digits ?? null} viewKey={`${accountId}|${accepted}|${timeframe}|${range.from}|${range.to}`}
      band={null} lines={[]} markers={[]} showPauses={prefs.showPauses} showGaps={prefs.showGaps} showRsi live={live} clockNow={offsetSec === null || rates.data?.liveFrom == null ? null : now()} />}
    {rates.loading && <p className="text-sm text-muted-foreground">{t('analysis.chart.loading')}</p>}
  </div>;
}
