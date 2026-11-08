'use client';

import type { MessageKey } from '@/i18n';
import { useT } from '@/i18n';
import { TradesTable } from '@/components/analysis/TradesTable';
import { FloatingCard } from '@/components/chart-page/FloatingCard';
import { LiveStats } from '@/components/chart/LiveStats';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { FieldLabel } from '@/components/ui/tooltip';
import type { MarketRates } from '@/hooks/useMarketRates';
import type { LegendLayer, useSetupLayers } from '@/hooks/useSetupLayers';
import { ZoneSelect } from '@/components/analysis/ZoneSelect';
import type { ChartTimeframe, Timeframe } from '@/lib/analysis/candles';
import type { LevelsUnavailable } from '@/lib/analysis/levels';
import { useAnalysisPrefsStore, type AnalysisPrefs } from '@/store/useAnalysisPrefsStore';
import type { ZoneSettings } from '@/store/types';

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

function orderCountKey(orderType: string) {
  if (orderType === 'BUY') return 'zone.fractal.buyOrderCount' as const;
  if (orderType === 'SELL') return 'zone.fractal.sellOrderCount' as const;
  return 'zone.fractal.orderCount' as const;
}

function zoneKindKey({ isFractal, isBreakout }: { isFractal: boolean; isBreakout: boolean }): MessageKey {
  if (isFractal) return 'zone.section.fractal';
  if (isBreakout) return 'chart.zone.breakout';
  return 'chart.zone.sliding';
}

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
    ['chart.zone.maxPositions', 'zone.fractal.maxPositions.hint', zone.max_positions],
  ];
  const count = zone.fractal_order_count ?? 1;
  if (zone.order_type === 'BOTH' && !zone.sync_buy_sell) {
    fields.push(['chart.zone.sellLot', 'zone.field.sellLot.hint', zone.sell_lot_size]);
    // Getrennt: BUY / SELL
    fields.push(['zone.fractal.orderCount', 'zone.fractal.orderCount.hint', `${count} / ${zone.sell_fractal_order_count ?? count}`]);
  } else {
    const key = orderCountKey(zone.order_type);
    fields.push([key, `${key}.hint`, count]);
  }
  return fields;
}

function ZoneInfo({ zone }: { zone: ZoneSettings }) {
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
    <div className="space-y-2" data-testid="zone-info">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{t(zoneKindKey({ isFractal, isBreakout: zone.is_breakout }))}</span>
        <div className="flex gap-2">
          <Badge tone="info" hint={t('zone.field.orderType.hint')}>{zone.order_type}</Badge>
          <Badge tone={zone.is_active ? 'success' : 'neutral'} hint={zone.is_active ? t('chart.zone.active.hint') : t('chart.zone.inactive.hint')}>
            {zone.is_active ? t('chart.zone.active') : t('chart.zone.inactive')}
          </Badge>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {fields.map(([labelKey, hintKey, value]) => (
          <Field key={labelKey} label={t(labelKey)} hint={t(hintKey)} value={value} />
        ))}
      </div>
    </div>
  );
}

const LEVELS_UNAVAILABLE: Record<LevelsUnavailable, MessageKey> = {
  fractal: 'analysis.chart.levels.fractal',
  noSymbolInfo: 'analysis.chart.levels.noSymbolInfo',
  noPrice: 'analysis.chart.levels.noPrice',
};

/** Schalter der Setup-Ebenen (Menü „Ebenen“): dieselben Werte wie die Legende */
export function SetupSwitches({ idPrefix, legendLayers, prefs }: { idPrefix: string; legendLayers: LegendLayer[]; prefs: AnalysisPrefs }) {
  const t = useT();
  const setPref = useAnalysisPrefsStore((s) => s.setPref);
  return (
    <>
      {legendLayers.map(l => <Switch key={l.pref} id={`${idPrefix}-${l.id}`} label={t(l.label)} hint={t(l.hint)} checked={prefs[l.pref]} disabled={l.disabled} onChange={v => setPref(l.pref, v)} />)}
      <Switch id={`${idPrefix}-zone-card`} label={t('analysis.settings.zoneCard')} hint={t('analysis.settings.zoneCard.hint')} checked={prefs.showZoneCard} onChange={v => setPref('showZoneCard', v)} />
      <p className="border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">{t('analysis.settings.fixed')}</p>
    </>
  );
}

interface SetupCardTabsProps {
  accountId: string;
  zone: ZoneSettings;
  timeframe: ChartTimeframe;
  onTimeframe: (tf: Timeframe) => void;
  prefs: AnalysisPrefs;
  data: MarketRates | null;
  layers: ReturnType<typeof useSetupLayers>;
  /** All setups of the symbol: with more than one, the tab "Overview" has a select (1107-A21.2) */
  setups?: ZoneSettings[];
  onSetup?: (zoneId: string) => void;
  /** Flips to true once a formation is drawn: the card closes (it would cover the drawing) */
  collapseSignal?: boolean;
}

/** Schwebende Setup-Karte: Reiter „Genel bakış“ (Live-Werte, Zone, Hinweise) und „İşlemler“ (Trade-Archiv) */
export function SetupCardTabs({ accountId, zone, timeframe, onTimeframe, prefs, data, layers, setups, onSetup, collapseSignal }: SetupCardTabsProps) {
  const t = useT();
  const { history, dealsRequest, deals, positions, orders, levels, marketHours, botRunning, streamMatches, symbolMismatch, streamSymbol } = layers;
  const { isFractalZone, fractalTf, setupLabel, focusTrade } = layers;

  const overview = (
    <div className="space-y-3" data-testid="chart-card-overview">
      {setups && setups.length > 1 && onSetup && (
        <div className="space-y-1" data-testid="chart-card-setup-select">
          <p className="text-[11px] font-medium text-muted-foreground">{t('chart.card.setupSelect')}</p>
          <ZoneSelect zones={setups} value={zone.id} onChange={onSetup} />
        </div>
      )}
      <LiveStats digits={streamMatches ? (data?.digits ?? undefined) : undefined} />
      {symbolMismatch && (
        <Alert tone="warning" title={t('chart.zone.mismatch.title')}>
          {t('chart.zone.mismatch.text', { stream: streamSymbol, symbol: zone.symbol })}
        </Alert>
      )}
      {prefs.showZoneCard && <ZoneInfo zone={zone} />}
      {marketHours && (
        <Badge hint={t('analysis.chart.hours.hint')} data-testid="market-hours">
          {t('analysis.chart.hours', { hours: marketHours })}
        </Badge>
      )}
      {prefs.showLevels && levels?.unavailable && (
        <p className="text-xs text-muted-foreground" data-testid="levels-note">
          {t(LEVELS_UNAVAILABLE[levels.unavailable])}
        </p>
      )}
      {isFractalZone && prefs.showFractals && timeframe !== fractalTf && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid="fractal-tf-note">
          <span>{t('analysis.chart.fractals.otherTf', { tf: fractalTf })}</span>
          <Button size="sm" variant="outline" hint={t('analysis.chart.fractals.switch.hint', { tf: fractalTf })} onClick={() => onTimeframe(fractalTf)}>
            {t('analysis.chart.fractals.switch', { tf: fractalTf })}
          </Button>
        </div>
      )}
      {(prefs.showTrades || prefs.showOrders) && (
        <p className="text-xs text-muted-foreground" data-testid="trades-note">
          {!botRunning && t('analysis.chart.trades.botStopped')}
          {botRunning && zone.magic === undefined && t('analysis.chart.trades.noMagic')}
          {botRunning &&
            zone.magic !== undefined &&
            t('analysis.chart.trades.count', { positions: positions.length, orders: orders.length })}
        </p>
      )}
    </div>
  );

  return (
    <FloatingCard
      collapseSignal={collapseSignal}
      title={t('chart.zone.title', { n: layers.setupNo, symbol: zone.symbol || '—' })}
      tabs={[
        { id: 'overview', label: t('chart.card.overview'), hint: t('chart.card.overview.hint'), content: overview },
        {
          id: 'trades',
          label: t('chart.card.trades'),
          hint: t('chart.card.trades.hint'),
          wide: true,
          content: dealsRequest && (
            <TradesTable
              accountId={accountId}
              variant="zone"
              trades={history?.trades ?? []}
              openEntries={history?.openEntries ?? 0}
              otherTrades={history?.otherTrades ?? 0}
              from={dealsRequest.from}
              digits={data?.digits ?? null}
              currency={deals.data?.account?.currency ?? null}
              loading={deals.loading}
              error={deals.error}
              missing={deals.data?.missing ?? []}
              setupLabel={setupLabel}
              onFocus={focusTrade}
            />
          ),
        },
      ]}
    />
  );
}

/** The card of a symbol without a setup (1107-A21.11): the tab "Overview" says so; the tab "Trades" has nothing to show */
export function NoSetupCard({ symbol }: { symbol: string }) {
  const t = useT();
  return (
    <FloatingCard
      // Only a note: it starts closed, so it does not cover the chart
      defaultOpen={false}
      title={symbol}
      tabs={[{ id: 'overview', label: t('chart.card.overview'), hint: t('chart.card.overview.hint'), content: <p className="text-xs text-muted-foreground" data-testid="chart-card-no-setup">{t('chart.card.noSetup', { symbol })}</p> }]}
    />
  );
}
