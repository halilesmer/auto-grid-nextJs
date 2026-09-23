'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Layers } from 'lucide-react';

import ChartViewer, { type ChartPriceLine } from '@/components/ChartViewer';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { useAccountStore, useBotRuntimeStore, useSettingsStore } from '@/store';
import type { ZoneSettings } from '@/store/types';

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-muted/50 px-3 py-2">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="font-mono text-sm font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function ZoneInfoCard({ zone, index }: { zone: ZoneSettings; index: number }) {
  const showSell = zone.order_type === 'BOTH' && !zone.sync_buy_sell;
  const fields: [string, string | number][] = [
    ['Fiyat Aralığı', `${zone.min_price} – ${zone.max_price}`],
    ['Grid Adımı', zone.grid_step],
    ['Lot', zone.lot_size],
    ['Kar Al', zone.take_profit],
    ['Zarar Durdur', zone.stop_loss],
    ['Alt / Üst Seviye', `${zone.levels_below} / ${zone.levels_above}`],
    ['Maks Pozisyon', zone.max_positions],
  ];
  if (showSell) {
    fields.push(
      ['SELL Grid', zone.sell_grid_step],
      ['SELL Lot', zone.sell_lot_size],
      ['SELL KA', zone.sell_take_profit],
      ['SELL ZD', zone.sell_stop_loss],
    );
  }

  return (
    <Card>
      <CardHeader
        icon={<Layers size={16} />}
        title={`Bölge ${index + 1} · ${zone.symbol || '—'}`}
        description={zone.is_breakout ? 'Kırılım modu (sadece trend yönünde)' : 'Kayan grid'}
        actions={
          <div className="flex gap-2">
            <Badge tone="info">{zone.order_type}</Badge>
            <Badge tone={zone.is_active ? 'success' : 'neutral'}>{zone.is_active ? 'Aktif' : 'Pasif'}</Badge>
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-2 px-5 pb-5 pt-4 sm:grid-cols-4">
        {fields.map(([label, value]) => (
          <Field key={label} label={label} value={value} />
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
      { price: zone.max_price, title: 'Bölge Max' },
      { price: zone.min_price, title: 'Bölge Min' },
    ];
  }, [zone, symbolMismatch]);

  return (
    <div className="space-y-5">
      {zoneId && !zone && (
        <Alert tone="info" title="Bölge bulunamadı">
          {selectedAccount
            ? 'Bu hesabın ayarlarında bu bölge yok (silinmiş olabilir).'
            : "Bölge bilgisi için önce Dashboard'da hesabı seçin ve bölgenin „Test“ bağlantısını kullanın."}
        </Alert>
      )}
      {zone && <ZoneInfoCard zone={zone} index={index} />}
      {symbolMismatch && zone && (
        <Alert tone="warning" title="Farklı sembol">
          Grafik akışı {streamSymbol} gösteriyor (hesabın ilk bölgesi); bu bölge {zone.symbol}. Bölge
          seviyeleri bu yüzden grafiğe çizilmedi.
        </Alert>
      )}
      <div className="min-h-125">
        <ChartViewer priceLines={priceLines} />
      </div>
    </div>
  );
}
