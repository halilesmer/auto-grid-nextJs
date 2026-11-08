'use client';

import { useCallback, useMemo } from 'react';
import { Loader2 } from 'lucide-react';

import { ChartView } from '@/components/chart-page/ChartView';
import { TimeframeSelect } from '@/components/analysis/chart/TimeframeSelect';
import { formatOffset } from '@/components/analysis/BrokerClockNotice';
import { ChartPage } from '@/components/chart-page/ChartPage';
import { ChartNotice, ChartOverlays } from '@/components/chart-page/ChartOverlays';
import { ChartTopBar, type ChartChrome } from '@/components/chart-page/ChartTopBar';
import { LicenseInfo } from '@/components/analysis/LicenseInfo';
import { DataQualityBanner } from '@/components/analysis/DataQualityBanner';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { InfoHint, Tooltip } from '@/components/ui/tooltip';
import { SetupCardTabs, SetupSwitches } from '@/components/chart/SetupCardTabs';
import { useMarketRates } from '@/hooks/useMarketRates';
import { useSetupLayers } from '@/hooks/useSetupLayers';
import { useSignalBars } from '@/hooks/useSignalBars';
import { useTrendPath } from '@/hooks/useTrendPath';
import { TrendToggle } from '@/components/chart-workspace/TrendToggle';
import { buildChartData, TIMEFRAMES, TIMEFRAME_SEC, type Timeframe } from '@/lib/analysis/candles';
import { brokerNow } from '@/lib/serverTime';
import { cn } from '@/lib/utils';
import { useConnectionStore } from '@/store/useConnectionStore';
import { workspaceKey } from '@/lib/chart-workspace/settings';
import { useAnalysisPrefsStore, type AnalysisPrefs } from '@/store/useAnalysisPrefsStore';
import type { ZoneSettings } from '@/store/types';
import { useT } from '@/i18n';

interface ZoneChartPanelProps {
  accountId: string;
  /** Zone aus der URL (?zone=); null = keine gewählt */
  zoneId: string | null;
  /** Zonen des gewählten Kontos; null = werden noch geladen */
  zones: ZoneSettings[] | null;
  timeframe: Timeframe;
  onTimeframe: (tf: Timeframe) => void;
  /** Gewählter Zeitraum in MT5-Sekunden, halb offen; from null = „alles“ */
  range: { from: number | null; to: number };
  /** Gemessener Abstand der Brokeruhr zu UTC; null = unsicher (keine Live-Kerze) */
  offsetSec: number | null;
  /** Antwort der Brokeruhr da (auch „unsicher“): erst dann steht der Zeitraum fest, vorher kein Abruf */
  clockReady: boolean;
  prefs: AnalysisPrefs;
  chrome: ChartChrome;
}

/** Legendeneintrag als Schalter: blendet sein Element im Chart ein/aus (dieselben Werte wie im Menü „Ebenen“) */
function LegendToggle({
  items,
  hint,
  active,
  onToggle,
  testId,
}: {
  /** Ein Schalter kann mehrere Symbole tragen (Einstieg, Ausstieg, unbekannt sind eine Trade-Zeichnung) */
  items: { swatch: string; label: string }[];
  hint: string;
  active: boolean;
  onToggle: () => void;
  testId: string;
}) {
  return (
    // max-w-full: der Anker ist sonst shrink-0, und der Sammelknopf (Einstieg/Ausstieg/unbekannt) könnte bei 375 px nicht umbrechen
    <Tooltip content={hint} className="max-w-full">
      <button
        type="button"
        aria-pressed={active}
        onClick={onToggle}
        data-testid={testId}
        className={cn(
          'inline-flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          !active && 'opacity-50 line-through',
        )}
      >
        {items.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5">
            <span className={item.swatch} aria-hidden />
            {item.label}
          </span>
        ))}
      </button>
    </Tooltip>
  );
}

/**
 * Chart-Tab der Analyse-Seite (ANA-05/06/11): MT5-Kerzen der Zone im gewählten Zeitraum und
 * Zeitrahmen, fehlende Bereiche markiert, Marktpausen. Die Setup-Ebenen kommen aus `useSetupLayers`,
 * der Karteninhalt aus `SetupCardTabs`; dieses Panel holt nur die Kerzen und setzt die Seite zusammen.
 */
export default function ZoneChartPanel({
  accountId,
  zoneId,
  zones,
  timeframe,
  onTimeframe,
  range,
  offsetSec,
  clockReady,
  prefs,
  chrome,
}: ZoneChartPanelProps) {
  const t = useT();
  const source = useConnectionStore(s => s.baseUrl);
  const index = zoneId && zones ? zones.findIndex((z) => z.id === zoneId) : -1;
  const zone = index >= 0 && zones ? zones[index] : null;
  const symbol = zone?.symbol?.toUpperCase().trim() || null;
  const tfSec = TIMEFRAME_SEC[timeframe];

  const nowSec = useCallback(
    () => (offsetSec !== null ? brokerNow(offsetSec) : Date.now() / 1000),
    [offsetSec],
  );
  const request = useMemo(
    () => (symbol && clockReady ? { accountId, symbol, timeframe, from: range.from, to: range.to } : null),
    [accountId, symbol, clockReady, timeframe, range.from, range.to],
  );
  // Neue Auswahl: Ansicht neu ausrichten, ein alter Sprung zu einem Trade gilt nicht mehr
  const viewKey = request ? `${request.accountId}|${request.symbol}|${request.timeframe}|${request.from}|${request.to}` : '';
  const rates = useMarketRates(request, nowSec);
  const data = rates.data;
  const signalBars = useSignalBars(data, timeframe, offsetSec, nowSec);
  const showTrend = useAnalysisPrefsStore((st) => st.showTrend);
  // Setup rechnet mit der angewendeten Einstellung; nur der Modus Formation zeigt einen offenen Entwurf (R1-10)
  const trendSettings = useAnalysisPrefsStore((st) => st.trend);
  const trend = useTrendPath({ accountId, symbol, timeframe, range, offsetSec, clockReady }, showTrend, trendSettings, nowSec);

  // Fehlende Bereiche enden jetzt (Brokeruhr); ohne sichere Uhr bei UTC jetzt: die Zukunft fehlt nie
  const chart = useMemo(() => {
    if (!data) return null;
    const clipAt = offsetSec !== null ? brokerNow(offsetSec, data.loadedAt) : data.loadedAt / 1000;
    return buildChartData(data.bars, data.missing, tfSec, clipAt);
  }, [data, tfSec, offsetSec]);

  const layers = useSetupLayers({ accountId, zone, zones, symbol, timeframe, range, offsetSec, clockReady, nowSec, data, chart, viewKey, prefs });
  const setPref = useAnalysisPrefsStore((s) => s.setPref);
  const { legend, isChartEmpty } = layers;
  const zoneMissing = Boolean(zoneId && zones && !zone);

  const notices = (
    <>
      {offsetSec !== null && (
        <ChartNotice>
          <Badge tone="info" hint={t('analysis.clock.badge.hint')} data-testid="broker-clock">
            {t('analysis.clock.badge', { offset: formatOffset(offsetSec) })}
          </Badge>
        </ChartNotice>
      )}
      {chrome.notices}
      {zoneMissing && (
        <ChartNotice>
          <Alert tone="info" title={t('chart.zone.notFound')}>
            {t('chart.zone.notFound.withAccount')}
          </Alert>
        </ChartNotice>
      )}
      {zone && rates.error && (
        <ChartNotice>
          <Alert tone="danger" title={t('analysis.chart.loadFailed')}>
            {rates.error}
          </Alert>
        </ChartNotice>
      )}
      {zone && trend.error && (
        <ChartNotice>
          <Alert tone="danger" title={t('analysis.chart.loadFailed')}>
            {trend.error}
          </Alert>
        </ChartNotice>
      )}
      {zone && data && chart && (
        <ChartNotice>
          <DataQualityBanner missing={chart.missing} clipped={data.clipped} dbFull={data.dbFull} loadedFrom={data.from} />
        </ChartNotice>
      )}
      {zone && data && chart && data.bars.length === 0 && chart.missing.length === 0 && (
        <ChartNotice>
          <Alert tone="info" title={t('analysis.chart.empty.title')}>
            {t('analysis.chart.empty.text')}
          </Alert>
        </ChartNotice>
      )}
      {zone && rates.loading && (
        <p className="rounded-lg bg-background/95 p-2" role="status">
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label={t('analysis.chart.loading')} />
        </p>
      )}
    </>
  );

  const card = zone && (
    <SetupCardTabs accountId={accountId} zone={zone} timeframe={timeframe} onTimeframe={onTimeframe} prefs={prefs} data={data} layers={layers} />
  );

  return (
    <ChartPage
      title={t('nav.chart')}
      testId="chart-page"
      panelShown={false}
      panel={null}
      notices={null}
      topBar={
        <ChartTopBar
          account={chrome.account}
          mode={chrome.mode}
          target={chrome.zone}
          timeframes={<TimeframeSelect value={timeframe} onChange={onTimeframe} options={TIMEFRAMES} />}
          range={chrome.range}
          view={chrome.view}
          tools={<LicenseInfo />}
          extra={
            zone && (
              <div className="flex min-w-0 items-center gap-x-4 text-[11px] text-muted-foreground @max-[30rem]/formation-main:flex-wrap @max-[30rem]/formation-main:gap-x-2 @max-[30rem]/formation-main:gap-y-0.5" data-testid="chart-key">
                {legend.map((entry) => (
                  <LegendToggle
                    key={entry.pref}
                    items={entry.items}
                    hint={t(entry.hint)}
                    active={prefs[entry.pref]}
                    onToggle={() => setPref(entry.pref, !prefs[entry.pref])}
                    testId={`chart-key-${entry.pref}`}
                  />
                ))}
                <InfoHint hint={t('analysis.chart.key.hint')} />
              </div>
            )
          }
        />
      }
      surface={
        <div className="absolute inset-0">
          {zone && isChartEmpty && (
            // Keine einzige Kerze: lightweight-charts kann reine Leerstellen nicht verteilen. Eine Fläche
            // statt eines leeren Charts; der Grund steht im Hinweis darüber
            <div
              data-testid="analysis-chart-empty"
              className="absolute inset-y-0 left-[52px] right-0 flex items-center justify-center bg-[repeating-linear-gradient(135deg,transparent_0_9px,color-mix(in_oklab,var(--muted-foreground)_22%,transparent)_9px_10px)] text-sm font-medium text-muted-foreground"
            >
              {t('analysis.chart.noData')}
            </div>
          )}
          {zone && chart && !isChartEmpty && (
            <ChartView
              key={`${accountId}|${symbol}`}
              workspace={{ key: workspaceKey({ source, view: 'analysis', mode: 'setup', account: accountId, symbol: symbol ?? '' }), symbol: symbol ?? '', view: 'analysis', syncIdentity: { source, account: accountId, symbol: symbol ?? '' } }}
              signalBars={signalBars}
              timeframe={timeframe}
              modeTitle={t('cw.layers.setup')}
              modeLayers={<SetupSwitches idPrefix="layer" legendLayers={layers.legendLayers} prefs={prefs} />}
              clockNow={offsetSec !== null && data?.liveFrom != null ? nowSec() : null}
              data={chart}
              timeframeSec={tfSec}
              digits={data?.digits ?? null}
              viewKey={viewKey}
              band={layers.band}
              lines={layers.lines}
              live={layers.live}
              markers={layers.markers}
              links={layers.links}
              fractals={layers.fractals}
              trendPath={trend}
              toolbarActions={<TrendToggle timeframe={timeframe} size="xs" />}
              notes={layers.notes}
              focus={layers.focus}
              fullscreenOfPage
            />
          )}
          {zone && !chart && (
            <div className="absolute inset-0 animate-pulse bg-muted/40" data-testid="analysis-chart-loading" />
          )}
        </div>
      }
      floating={<ChartOverlays notices={notices}>{card}</ChartOverlays>}
    />
  );
}