'use client';

import { useMemo } from 'react';
import { Layers } from 'lucide-react';

import ChartViewer, { type ChartPriceLine } from '@/components/ChartViewer';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { FieldLabel } from '@/components/ui/tooltip';
import { useBotRuntimeStore } from '@/store';
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
  /** Zone aus der URL (?zone=); null = keine gewählt */
  zoneId: string | null;
  /** Zonen des gewählten Kontos; null = werden noch geladen */
  zones: ZoneSettings[] | null;
  showZoneLines: boolean;
  showZoneCard: boolean;
}

/**
 * Chart-Tab der Analyse-Seite: Einstellungen der gewählten Zone und ihre min/max-Preise im Chart.
 * Die Zonen kommen von der Seite (nur die des gewählten Kontos, siehe useAccountSettings).
 */
export default function ZoneChartPanel({ zoneId, zones, showZoneLines, showZoneCard }: ZoneChartPanelProps) {
  const t = useT();
  const streamSymbol = useBotRuntimeStore((s) => s.metrics.symbol);

  const index = zoneId && zones ? zones.findIndex((z) => z.id === zoneId) : -1;
  const zone = index >= 0 && zones ? zones[index] : null;

  // Akış başka bir sembolü gösteriyorsa bu bölgenin fiyat seviyeleri grafikte anlamsız olur
  const symbolMismatch = Boolean(
    zone && streamSymbol && streamSymbol.toUpperCase() !== zone.symbol.toUpperCase(),
  );

  const priceLines = useMemo<ChartPriceLine[] | undefined>(() => {
    if (!zone || symbolMismatch || !showZoneLines) return undefined;
    return [
      { price: zone.max_price, title: t('chart.zone.lineMax') },
      { price: zone.min_price, title: t('chart.zone.lineMin') },
    ];
  }, [zone, symbolMismatch, showZoneLines, t]);

  return (
    <div className="space-y-5">
      {zoneId && zones && !zone && (
        <Alert tone="info" title={t('chart.zone.notFound')}>
          {t('chart.zone.notFound.withAccount')}
        </Alert>
      )}
      {zone && showZoneCard && <ZoneInfoCard zone={zone} index={index} />}
      {symbolMismatch && zone && (
        <Alert tone="warning" title={t('chart.zone.mismatch.title')}>
          {t('chart.zone.mismatch.text', { stream: streamSymbol ?? '', symbol: zone.symbol })}
        </Alert>
      )}
      <div className="min-h-125">
        <ChartViewer priceLines={priceLines} />
      </div>
    </div>
  );
}
