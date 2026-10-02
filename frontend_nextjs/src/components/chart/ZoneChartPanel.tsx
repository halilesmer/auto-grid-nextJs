'use client';

import { useCallback, useMemo } from 'react';
import { CandlestickChart, Layers, Loader2 } from 'lucide-react';

import { ChartCore, type OverlayLine } from '@/components/analysis/chart/ChartCore';
import { TimeframeSelect } from '@/components/analysis/chart/TimeframeSelect';
import { DataQualityBanner } from '@/components/analysis/DataQualityBanner';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { FieldLabel, InfoHint } from '@/components/ui/tooltip';
import { LiveStats } from '@/components/chart/LiveStats';
import { useLiveTrades } from '@/hooks/useLiveTrades';
import { useMarketRates } from '@/hooks/useMarketRates';
import { useSymbolDetails } from '@/hooks/useSymbolDetails';
import { buildChartData, TIMEFRAME_SEC, type Timeframe } from '@/lib/analysis/candles';
import { zoneLevels, type LevelsUnavailable, type ZoneLevels } from '@/lib/analysis/levels';
import { brokerNow } from '@/lib/serverTime';
import { useBotRuntimeStore, useWebSocketManager } from '@/store';
import type { AnalysisPrefs } from '@/store/useAnalysisPrefsStore';
import type { ZoneSettings } from '@/store/types';
import { useT, type MessageKey } from '@/i18n';

function Field({ label, hint, value }: { label: string; hint: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-muted/50 px-3 py-2">
      <FieldLabel label={label} hint={hint} className="text-[11px] font-medium text-muted-foreground" />
      <div className="font-mono text-sm font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

const SL_MODE_KEYS: Record<string, MessageKey> = {
  atr: 'zone.fractal.slMode.atr',
  sar: 'zone.fractal.slMode.sar',
  opposite_fractal: 'zone.fractal.slMode.opposite',
  buffer: 'zone.fractal.slMode.buffer',
};

/** Fraktal-Zone: Grid-Abstand/TP/SL/Ebenen gelten nicht, stattdessen die Fraktal-Einstellungen */
function fractalFields(zone: ZoneSettings, t: ReturnType<typeof useT>): [MessageKey, MessageKey, string | number][] {
  const fields: [MessageKey, MessageKey, string | number][] = [
    ['chart.zone.priceRange', 'chart.zone.priceRange.hint', `${zone.min_price} – ${zone.max_price}`],
    ['zone.fractal.timeframe', 'zone.fractal.timeframe.hint', zone.fractal_timeframe ?? 'H4'],
    [
      'zone.fractal.orderMode',
      'zone.fractal.orderMode.hint',
      t(zone.fractal_order_mode === 'rebound' ? 'zone.fractal.orderMode.rebound' : 'zone.fractal.orderMode.breakout'),
    ],
    ['chart.zone.lot', 'zone.field.lot.hint', zone.lot_size],
    ['zone.fractal.slMode', 'zone.fractal.slMode.hint', t(SL_MODE_KEYS[zone.fractal_sl_mode ?? 'atr'] ?? SL_MODE_KEYS.atr)],
    zone.fractal_tp_by_money || zone.fractal_use_sl === false
      ? ['zone.fractal.tpMoney', 'zone.fractal.tpMoney.hint', t('chart.zone.profitValue', { value: zone.fractal_tp_money ?? 10 })]
      : ['zone.fractal.rr', 'zone.fractal.rr.hint', zone.fractal_rr ?? 2],
    ['chart.zone.maxPositions', 'zone.breakout.maxPositions.hint', zone.max_positions],
  ];
  const count = zone.fractal_order_count ?? 1;
  if (zone.order_type === 'BOTH' && !zone.sync_buy_sell) {
    fields.push(['chart.zone.sellLot', 'zone.field.sellLot.hint', zone.sell_lot_size]);
    // Getrennt: BUY / SELL
    fields.push(['zone.fractal.orderCount', 'zone.fractal.orderCount.hint', `${count} / ${zone.sell_fractal_order_count ?? count}`]);
  } else {
    const key =
      zone.order_type === 'BUY'
        ? 'zone.fractal.buyOrderCount'
        : zone.order_type === 'SELL'
          ? 'zone.fractal.sellOrderCount'
          : 'zone.fractal.orderCount';
    fields.push([key, `${key}.hint`, count]);
  }
  return fields;
}

function ZoneInfoCard({ zone, index }: { zone: ZoneSettings; index: number }) {
  const t = useT();
  const isFractal = zone.entry_mode === 'fractal';
  const showSell = zone.order_type === 'BOTH' && !zone.sync_buy_sell;
  // „Abstand nach Verlust“: Grid-Abstände, TP und SL sind $-Beträge
  const dist = (v: number) => (zone.step_by_loss ? t('chart.zone.lossValue', { value: v }) : v);
  // [Label, Hinweis, Wert]: die Hinweise sind dieselben wie in den Feldern der Zonenkarte
  const fields: [MessageKey, MessageKey, string | number][] = isFractal ? fractalFields(zone, t) : [
    ['chart.zone.priceRange', 'chart.zone.priceRange.hint', `${zone.min_price} – ${zone.max_price}`],
    ['chart.zone.gridStep', zone.step_by_loss ? 'zone.field.gridStepLoss.hint' : 'zone.field.gridStep.hint', dist(zone.grid_step)],
    ['chart.zone.lot', 'zone.field.lot.hint', zone.lot_size],
    ['chart.zone.takeProfit', zone.step_by_loss ? 'zone.field.takeProfitLoss.hint' : 'zone.field.takeProfit.hint', dist(zone.take_profit)],
    ['chart.zone.stopLoss', zone.step_by_loss ? 'zone.field.stopLossLoss.hint' : 'zone.field.stopLoss.hint', dist(zone.stop_loss)],
    ['chart.zone.levels', 'chart.zone.levels.hint', `${zone.levels_below} / ${zone.levels_above}`],
    ['chart.zone.maxPositions', 'zone.breakout.maxPositions.hint', zone.max_positions],
  ];
  if (showSell && !isFractal) {
    fields.push(
      ['chart.zone.sellGrid', zone.step_by_loss ? 'zone.field.sellGridLoss.hint' : 'zone.field.sellGrid.hint', dist(zone.sell_grid_step)],
      ['chart.zone.sellLot', 'zone.field.sellLot.hint', zone.sell_lot_size],
      ['chart.zone.sellTakeProfit', zone.step_by_loss ? 'zone.field.sellTakeProfitLoss.hint' : 'zone.field.sellTakeProfit.hint', dist(zone.sell_take_profit)],
      ['chart.zone.sellStopLoss', zone.step_by_loss ? 'zone.field.sellStopLossLoss.hint' : 'zone.field.sellStopLoss.hint', dist(zone.sell_stop_loss)],
    );
  }

  return (
    <Card>
      <CardHeader
        icon={<Layers size={16} />}
        title={t('chart.zone.title', { n: index + 1, symbol: zone.symbol || '—' })}
        description={
          isFractal ? t('zone.section.fractal') : zone.is_breakout ? t('chart.zone.breakout') : t('chart.zone.sliding')
        }
        actions={
          <div className="flex gap-2">
            <Badge tone="info" hint={t('zone.field.orderType.hint')}>{zone.order_type}</Badge>
            <Badge tone={zone.is_active ? 'success' : 'neutral'} hint={zone.is_active ? t('chart.zone.active.hint') : t('chart.zone.inactive.hint')}>
              {zone.is_active ? t('chart.zone.active') : t('chart.zone.inactive')}
            </Badge>
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-2 px-5 pb-5 pt-4 sm:grid-cols-4">
        {fields.map(([labelKey, hintKey, value]) => (
          <Field key={labelKey} label={t(labelKey)} hint={t(hintKey)} value={value} />
        ))}
      </div>
    </Card>
  );
}

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
}

/** MT5 ORDER_TYPE_* → Kurzname wie im Terminal */
const ORDER_TYPES: Record<number, string> = {
  0: 'BUY',
  1: 'SELL',
  2: 'BUY LIMIT',
  3: 'SELL LIMIT',
  4: 'BUY STOP',
  5: 'SELL STOP',
  6: 'BUY STOP LIMIT',
  7: 'SELL STOP LIMIT',
};
const isBuyOrder = (type: number) => type % 2 === 0;

const LEVELS_UNAVAILABLE: Record<LevelsUnavailable, MessageKey> = {
  fractal: 'analysis.chart.levels.fractal',
  noSymbolInfo: 'analysis.chart.levels.noSymbolInfo',
  noPrice: 'analysis.chart.levels.noPrice',
};

function LegendItem({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={swatch} aria-hidden />
      {label}
    </span>
  );
}

/**
 * Chart-Tab der Analyse-Seite (ANA-05/06/11): MT5-Kerzen der Zone im gewählten Zeitraum und
 * Zeitrahmen, fehlende Bereiche markiert, Marktpausen, Zonenband, Stufen, offene Positionen und
 * Orders des laufenden Bots, RSI. Die Zonen kommen von der Seite (nur die des gewählten Kontos).
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
}: ZoneChartPanelProps) {
  const t = useT();
  const index = zoneId && zones ? zones.findIndex((z) => z.id === zoneId) : -1;
  const zone = index >= 0 && zones ? zones[index] : null;
  const symbol = zone?.symbol?.toUpperCase().trim() || null;
  const tfSec = TIMEFRAME_SEC[timeframe];

  // Live-Preis (laufende Kerze) und Positionen/Orders des laufenden Bots
  const { isConnected } = useWebSocketManager(accountId);
  useLiveTrades(accountId);
  const symbolDetails = useSymbolDetails(zone?.step_by_loss ? accountId : null);
  const metrics = useBotRuntimeStore((s) => s.metrics);
  const liveData = useBotRuntimeStore((s) => s.liveData);

  const nowSec = useCallback(
    () => (offsetSec !== null ? brokerNow(offsetSec) : Date.now() / 1000),
    [offsetSec],
  );
  const request = useMemo(
    () => (symbol && clockReady ? { accountId, symbol, timeframe, from: range.from, to: range.to } : null),
    [accountId, symbol, clockReady, timeframe, range.from, range.to],
  );
  const rates = useMarketRates(request, nowSec);
  const data = rates.data;

  // Fehlende Bereiche enden jetzt (Brokeruhr); ohne sichere Uhr bei UTC jetzt: die Zukunft fehlt nie
  const chart = useMemo(() => {
    if (!data) return null;
    const clipAt = offsetSec !== null ? brokerNow(offsetSec, data.loadedAt) : data.loadedAt / 1000;
    return buildChartData(data.bars, data.missing, tfSec, clipAt);
  }, [data, tfSec, offsetSec]);

  // Live-Preis nur für dieses Konto und Symbol, bei offenem Markt und sicherer Uhr
  const streamMatches = Boolean(
    symbol &&
      metrics.symbol?.toUpperCase() === symbol &&
      (!metrics.account_id || String(metrics.account_id) === accountId),
  );
  const lastClose = data && data.bars.length > 0 ? data.bars[data.bars.length - 1].close : null;
  // Zusätzliche Sicherung: ein Preis weit weg vom letzten Schlusskurs gehört zu einem anderen Symbol
  const plausible = lastClose !== null && metrics.price > 0 && Math.abs(metrics.price / lastClose - 1) < 0.2;
  const live = useMemo(
    () =>
      isConnected && streamMatches && plausible && offsetSec !== null && data?.liveFrom != null && metrics.market_open !== false
        ? { price: metrics.price, nowSec: brokerNow(offsetSec) }
        : null,
    [isConnected, streamMatches, plausible, offsetSec, data?.liveFrom, metrics.market_open, metrics.price],
  );
  // Der Stream zeigt die erste Zone des Kontos: bei anderem Symbol gehören die Live-Werte nicht zu dieser Zone
  const symbolMismatch = Boolean(symbol && metrics.symbol && metrics.symbol.toUpperCase() !== symbol);
  // Stufen gelten für den aktuellen Kurs: Live-Preis, sonst der Schluss der laufenden Kerze; bei einem
  // Zeitraum in der Vergangenheit keine Stufen (sie lägen um einen alten Kurs)
  const currentPrice = streamMatches && plausible ? metrics.price : data?.liveFrom != null ? lastClose : null;

  const botRunning = liveData.bot_running === true;
  const positions = useMemo(
    () => (botRunning && zone ? (liveData.positions ?? []).filter((p) => p.magic === zone.magic && p.symbol.toUpperCase() === symbol) : []),
    [botRunning, zone, symbol, liveData.positions],
  );
  const orders = useMemo(
    () => (botRunning && zone ? (liveData.orders ?? []).filter((o) => o.magic === zone.magic && o.symbol.toUpperCase() === symbol) : []),
    [botRunning, zone, symbol, liveData.orders],
  );

  const pricePoint = data?.point && data.digits != null ? { point: data.point, digits: data.digits } : null;
  // Stufen ändern sich nur, wenn der Preis den Anker verschiebt: als Text vergleichen, sonst würden alle
  // Linien bei jedem Tick neu gezeichnet
  const levelsJson = JSON.stringify(zone ? zoneLevels(zone, currentPrice, positions, symbolDetails, pricePoint) : null);
  const levels = useMemo(() => JSON.parse(levelsJson) as ZoneLevels | null, [levelsJson]);

  const rawLines = useMemo<OverlayLine[]>(() => {
    if (!zone) return [];
    const out: OverlayLine[] = [];
    if (prefs.showZoneLines) {
      out.push(
        { key: 'zone-max', price: zone.max_price, title: t('chart.zone.lineMax'), tone: 'primary', style: 'dashed', axisLabel: true },
        { key: 'zone-min', price: zone.min_price, title: t('chart.zone.lineMin'), tone: 'primary', style: 'dashed', axisLabel: true },
      );
    }
    if (prefs.showLevels && levels) {
      levels.buy.forEach((p, i) => out.push({ key: `lvl-b-${i}`, price: p, title: '', tone: 'up', style: 'dotted' }));
      levels.sell.forEach((p, i) => out.push({ key: `lvl-s-${i}`, price: p, title: '', tone: 'down', style: 'dotted' }));
    }
    if (prefs.showTrades) {
      for (const p of positions) {
        if (p.price_open === null) continue;
        const buy = p.type === 0;
        const tone = buy ? 'up' : 'down';
        out.push({ key: `pos-${p.ticket}`, price: p.price_open, title: `${buy ? 'BUY' : 'SELL'} ${p.volume ?? ''}`.trim(), tone, style: 'solid', width: 2, axisLabel: true });
        if (p.tp > 0) out.push({ key: `pos-tp-${p.ticket}`, price: p.tp, title: 'TP', tone: 'up', style: 'dotted' });
        if (p.sl > 0) out.push({ key: `pos-sl-${p.ticket}`, price: p.sl, title: 'SL', tone: 'down', style: 'dotted' });
      }
      for (const o of orders) {
        if (o.price_open === null) continue;
        const name = ORDER_TYPES[o.type] ?? String(o.type);
        out.push({ key: `ord-${o.ticket}`, price: o.price_open, title: `${name} ${o.volume ?? ''}`.trim(), tone: isBuyOrder(o.type) ? 'up' : 'down', style: 'dashed', axisLabel: true });
      }
    }
    return out;
  }, [zone, levels, positions, orders, prefs.showZoneLines, prefs.showLevels, prefs.showTrades, t]);
  // Positionen/Orders kommen alle 5 s als neue Liste: nur bei echter Änderung neu zeichnen
  const linesJson = JSON.stringify(rawLines);
  const lines = useMemo(() => JSON.parse(linesJson) as OverlayLine[], [linesJson]);

  const band = zone && prefs.showZoneLines ? { min: zone.min_price, max: zone.max_price } : null;
  const marketHours = index >= 0 ? liveData.zone_market_hours?.[String(index)] : undefined;
  const viewKey = request ? `${request.accountId}|${request.symbol}|${request.timeframe}|${request.from}|${request.to}` : '';

  return (
    <div className="space-y-5">
      {zoneId && zones && !zone && (
        <Alert tone="info" title={t('chart.zone.notFound')}>
          {t('chart.zone.notFound.withAccount')}
        </Alert>
      )}
      {zone && prefs.showZoneCard && <ZoneInfoCard zone={zone} index={index} />}
      {zone && (
        <Card data-testid="analysis-chart-card">
          <CardHeader
            icon={<CandlestickChart size={16} />}
            title={t('analysis.chart.title', { symbol: zone.symbol || '—' })}
            description={t('analysis.chart.subtitle')}
            actions={rates.loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label={t('analysis.chart.loading')} /> : undefined}
          />
          <div className="space-y-3 px-5 pb-5 pt-4">
            <LiveStats />
            {symbolMismatch && (
              <Alert tone="warning" title={t('chart.zone.mismatch.title')}>
                {t('chart.zone.mismatch.text', { stream: metrics.symbol ?? '', symbol: zone.symbol })}
              </Alert>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TimeframeSelect value={timeframe} onChange={onTimeframe} />
              <div className="flex flex-wrap items-center gap-2">
                {marketHours && (
                  <Badge hint={t('analysis.chart.hours.hint')} data-testid="market-hours">
                    {t('analysis.chart.hours', { hours: marketHours })}
                  </Badge>
                )}
                <Badge tone="info" hint={t('analysis.chart.brokerTime.hint')}>
                  {t('analysis.range.brokerTime')}
                </Badge>
              </div>
            </div>

            {rates.error && (
              <Alert tone="danger" title={t('analysis.chart.loadFailed')}>
                {rates.error}
              </Alert>
            )}
            {data && chart && (
              <DataQualityBanner missing={chart.missing} clipped={data.clipped} dbFull={data.dbFull} loadedFrom={data.from} />
            )}
            {data && chart && data.bars.length === 0 && chart.missing.length === 0 && (
              <Alert tone="info" title={t('analysis.chart.empty.title')}>
                {t('analysis.chart.empty.text')}
              </Alert>
            )}

            {chart && data && data.bars.length === 0 ? (
              // Keine einzige Kerze: lightweight-charts kann reine Leerstellen nicht verteilen. Eine Fläche
              // statt eines leeren Charts; der Grund steht im Hinweis darüber
              <div
                data-testid="analysis-chart-empty"
                className="flex h-[360px] items-center justify-center rounded-lg border border-dashed border-muted-foreground/40 bg-[repeating-linear-gradient(135deg,transparent_0_9px,color-mix(in_oklab,var(--muted-foreground)_22%,transparent)_9px_10px)] text-sm font-medium text-muted-foreground sm:h-[480px]"
              >
                {t('analysis.chart.noData')}
              </div>
            ) : chart ? (
              <ChartCore
                data={chart}
                timeframeSec={tfSec}
                digits={data?.digits ?? null}
                viewKey={viewKey}
                band={band}
                lines={lines}
                showPauses={prefs.showPauses}
                showRsi={prefs.showRsi}
                live={live}
              />
            ) : (
              <div className="h-[360px] animate-pulse rounded-lg bg-muted/40 sm:h-[480px]" data-testid="analysis-chart-loading" />
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground" data-testid="chart-key">
              <LegendItem swatch="inline-block h-3 w-4 rounded-sm border border-muted-foreground/40 bg-[repeating-linear-gradient(135deg,transparent_0_3px,var(--muted-foreground)_3px_4px)] opacity-60" label={t('analysis.chart.key.noData')} />
              {prefs.showPauses && <LegendItem swatch="inline-block h-3 border-l border-dashed border-muted-foreground" label={t('analysis.chart.key.pause')} />}
              {prefs.showZoneLines && <LegendItem swatch="inline-block h-3 w-4 rounded-sm border-y border-dashed border-primary bg-primary/10" label={t('analysis.chart.key.band')} />}
              {prefs.showLevels && <LegendItem swatch="inline-block w-4 border-t border-dotted border-success" label={t('analysis.chart.key.levels')} />}
              {prefs.showTrades && <LegendItem swatch="inline-block w-4 border-t-2 border-success" label={t('analysis.chart.key.positions')} />}
              {prefs.showTrades && <LegendItem swatch="inline-block w-4 border-t border-dashed border-danger" label={t('analysis.chart.key.orders')} />}
              <InfoHint hint={t('analysis.chart.key.hint')} />
            </div>

            {prefs.showLevels && levels?.unavailable && (
              <p className="text-xs text-muted-foreground" data-testid="levels-note">
                {t(LEVELS_UNAVAILABLE[levels.unavailable])}
              </p>
            )}
            {prefs.showTrades && (
              <p className="text-xs text-muted-foreground" data-testid="trades-note">
                {!botRunning
                  ? t('analysis.chart.trades.botStopped')
                  : zone.magic === undefined
                    ? t('analysis.chart.trades.noMagic')
                    : t('analysis.chart.trades.count', { positions: positions.length, orders: orders.length })}
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
