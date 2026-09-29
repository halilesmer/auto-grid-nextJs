'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Layers } from 'lucide-react';

import ChartViewer, { type ChartPriceLine } from '@/components/ChartViewer';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { FieldLabel } from '@/components/ui/tooltip';
import { useAccountStore, useBotRuntimeStore, useSettingsStore } from '@/store';
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

function ZoneInfoCard({ zone, index }: { zone: ZoneSettings; index: number }) {
  const t = useT();
  const showSell = (zone.order_type === 'BOTH' || zone.order_type === 'AUTO') && !zone.sync_buy_sell;
  // [Label, Hinweis, Wert]: die Hinweise sind dieselben wie in den Feldern der Zonenkarte
  const fields: [MessageKey, MessageKey, string | number][] = [
    ['chart.zone.priceRange', 'chart.zone.priceRange.hint', `${zone.min_price} – ${zone.max_price}`],
    ['chart.zone.gridStep', 'zone.field.gridStep.hint', zone.grid_step],
    ['chart.zone.lot', 'zone.field.lot.hint', zone.lot_size],
    ['chart.zone.takeProfit', 'zone.field.takeProfit.hint', zone.take_profit],
    ['chart.zone.stopLoss', 'zone.field.stopLoss.hint', zone.stop_loss],
    ['chart.zone.levels', 'chart.zone.levels.hint', `${zone.levels_below} / ${zone.levels_above}`],
    ['chart.zone.maxPositions', 'zone.breakout.maxPositions.hint', zone.max_positions],
  ];
  if (showSell) {
    fields.push(
      ['chart.zone.sellGrid', 'zone.field.sellGrid.hint', zone.sell_grid_step],
      ['chart.zone.sellLot', 'zone.field.sellLot.hint', zone.sell_lot_size],
      ['chart.zone.sellTakeProfit', 'zone.field.sellTakeProfit.hint', zone.sell_take_profit],
      ['chart.zone.sellStopLoss', 'zone.field.sellStopLoss.hint', zone.sell_stop_loss],
    );
  }

  return (
    <Card>
      <CardHeader
        icon={<Layers size={16} />}
        title={t('chart.zone.title', { n: index + 1, symbol: zone.symbol || '—' })}
        description={zone.is_breakout ? t('chart.zone.breakout') : t('chart.zone.sliding')}
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

/**
 * /chart?zone=<id>: seçili bölgenin ayarlarını gösterir ve min/max fiyatını grafiğe çizer.
 * Bölge bilgisi useSettingsStore'dan gelir (Dashboard'da hesap seçiliyken dolu).
 */
export default function ZoneChartPanel() {
  const t = useT();
  const zoneId = useSearchParams().get('zone');
  const selectedAccount = useAccountStore((s) => s.selectedAccount);
  const zones = useSettingsStore((s) => s.settings?.ZONES);
  const streamSymbol = useBotRuntimeStore((s) => s.metrics.symbol);

  const index = zoneId && zones ? zones.findIndex((z) => z.id === zoneId) : -1;
  const zone = index >= 0 && zones ? zones[index] : null;

  // Akış başka bir sembolü gösteriyorsa bu bölgenin fiyat seviyeleri grafikte anlamsız olur
  const symbolMismatch = Boolean(
    zone && streamSymbol && streamSymbol.toUpperCase() !== zone.symbol.toUpperCase(),
  );

  const priceLines = useMemo<ChartPriceLine[] | undefined>(() => {
    if (!zone || symbolMismatch) return undefined;
    return [
      { price: zone.max_price, title: t('chart.zone.lineMax') },
      { price: zone.min_price, title: t('chart.zone.lineMin') },
    ];
  }, [zone, symbolMismatch, t]);

  return (
    <div className="space-y-5">
      {zoneId && !zone && (
        <Alert tone="info" title={t('chart.zone.notFound')}>
          {selectedAccount
            ? t('chart.zone.notFound.withAccount')
            : t('chart.zone.notFound.noAccount')}
        </Alert>
      )}
      {zone && <ZoneInfoCard zone={zone} index={index} />}
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
