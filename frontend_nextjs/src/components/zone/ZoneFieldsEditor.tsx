'use client';

import { useEffect, useCallback, type ReactNode } from 'react';
import type { ZoneCardProps } from './types';
import {
  getSymbolConfig,
  LOSS_DISTANCE_FIELDS,
  lossToPriceDistance,
  normalizeZoneLots,
  priceDistanceToLoss,
} from '@/utils/zoneHelpers';
import { ZoneBasicFields } from './ZoneBasicFields';
import { ZoneGridFields } from './ZoneGridFields';
import { ZoneSellFields } from './ZoneSellFields';
import { ZoneBreakoutFields } from './ZoneBreakoutFields';
import { ZoneExitFields } from './ZoneExitFields';
import { ZoneFractalFields } from './ZoneFractalFields';
import { SectionLabel } from '@/components/ui/card';
import { useT } from '@/i18n';
import { ZoneSpreadFields } from './ZoneSpreadFields';
import { FieldSwitch } from './FieldSwitch';
import type { SpreadGuardStatus } from '@/lib/spreadGuardSettings';

/** Kasten des columns-Layouts (1108-A5): weißer Kartengrund, Rahmen, Radius 8, Schatten --shadow-float. */
function Box({ title, testId, children }: { title: string; testId: string; children: ReactNode }) {
  return (
    <section
      data-testid={testId}
      className="@container min-w-0 rounded-lg border border-border bg-card shadow-[var(--shadow-float)]"
      style={{ padding: '9px 10px 10px' }}
    >
      <h3 className="mb-2 text-[12.5px] font-bold text-foreground">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** Gemeinsame Felder für gespeicherte Setups und lokale Backtest-Kopien.
 * `layout="columns"` (Dashboard): ab lg drei Kästen 1,2 : 1 : 1, darunter untereinander.
 * Standard (Backtest-Editor): zwei Spalten, links Einstieg, rechts Schutz und Ausstieg.
 */
export function ZoneFieldsEditor({ zone, onUpdate, symbolDetails, handleChange, handleBlur, syncZonePrecision, spreadStatus, connected, layout = 'default' }: Pick<ZoneCardProps,
  'zone' | 'onUpdate' | 'symbolDetails' | 'handleChange' | 'handleBlur' | 'syncZonePrecision'> & { spreadStatus?: SpreadGuardStatus; connected?: boolean; layout?: 'default' | 'columns' }) {
  const t = useT();
  const isBoth = zone.order_type === 'BOTH';
  const showBuyLabel = zone.order_type === 'BUY';
  const showSellLabel = zone.order_type === 'SELL';
  const isFractal = zone.entry_mode === 'fractal';
  const symbolConfig = getSymbolConfig(zone.symbol, symbolDetails);

  const update = useCallback(
    (field: string, value: unknown) => {
      if (field === 'entry_mode' && value === 'fractal' && zone.spread_guard?.mode === 'grid') {
        onUpdate(zone.id, 'spread_guard', { ...zone.spread_guard, mode: 'fixed' });
      }
      onUpdate(zone.id, field, value);
    },
    [onUpdate, zone.id, zone.spread_guard]
  );

  // Modus umschalten: vorhandene Abstände mit der Lotgröße umrechnen, damit der effektive
  // Abstand gleich bleibt (ohne Tick-Wert des Symbols bleiben die Zahlen stehen)
  const handleStepByLoss = useCallback(
    (on: boolean) => {
      const sellLot = zone.sync_buy_sell ? zone.lot_size : zone.sell_lot_size;
      for (const field of LOSS_DISTANCE_FIELDS) {
        const lot = field.startsWith('sell_') ? sellLot : zone.lot_size;
        const value = zone[field];
        const converted = on
          ? priceDistanceToLoss(value, lot, symbolConfig)
          : lossToPriceDistance(value, lot, symbolConfig);
        if (converted !== null && converted !== value) update(field, converted);
      }
      update('step_by_loss', on);
    },
    [zone, symbolConfig, update]
  );

  // Precision sync when symbol changes - ensures all fields match new symbol's digits
  useEffect(() => {
    syncZonePrecision(zone, symbolConfig, update);
  }, [zone.symbol, symbolConfig, syncZonePrecision, zone, update]);

  // Lot nie 0 / unter dem Minimum des Symbols beim Broker: bei Symbolwechsel, beim Laden der
  // Symboldaten und beim Öffnen einer Zone mit ungültigem Lot auf dessen Raster bringen. Bewusst
  // nur an die Symbol-Regeln gebunden, nicht an den Lot selbst – sonst würde jede Tastatureingabe
  // („2" auf dem Weg zu „20") sofort auf das Minimum angehoben.
  const { volMin, volStep, volMax } = symbolConfig;
  useEffect(() => {
    const fixed = normalizeZoneLots(zone, symbolDetails);
    if (fixed.lot_size !== zone.lot_size) update('lot_size', fixed.lot_size);
    if (fixed.sell_lot_size !== zone.sell_lot_size) update('sell_lot_size', fixed.sell_lot_size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone.symbol, volMin, volStep, volMax, update]);

  const columns = layout === 'columns';

  const basic = (
    <>
      <section className="space-y-3">
        <SectionLabel>{t('zone.section.basic')}</SectionLabel>
        <ZoneBasicFields
          zone={zone}
          update={update}
          symbolConfig={symbolConfig}
          handleChange={handleChange}
          handleBlur={handleBlur}
        />
      </section>
      {/* „İlk pozisyonu hemen aç“ unter der Zeile Temel, nur im Grid-Modus */}
      {!isFractal && (
        <div>
          <FieldSwitch
            id={`instant-entry-${zone.id}`}
            checked={!!zone.instant_entry}
            onChange={(checked) => update('instant_entry', checked)}
            label={<span className="text-xs text-muted-foreground">{t('zone.instantEntry')}</span>}
            hint={t('zone.instantEntry.hint')}
          />
        </div>
      )}
    </>
  );

  const entryRest = isFractal ? (
    <section className="space-y-3">
      <SectionLabel>{t('zone.section.fractal')}</SectionLabel>
      <ZoneFractalFields
        zone={zone}
        update={update}
        symbolConfig={symbolConfig}
        isBoth={isBoth}
        sync={zone.sync_buy_sell}
        handleChange={handleChange}
        handleBlur={handleBlur}
      />
    </section>
  ) : (
    <section className="space-y-3">
      {showBuyLabel && <SectionLabel className="text-success">{t('zone.section.buyGrid')}</SectionLabel>}
      {showSellLabel && <SectionLabel className="text-danger">{t('zone.section.sellGrid')}</SectionLabel>}
      {isBoth && (
        <SectionLabel className={zone.sync_buy_sell ? undefined : 'text-success'}>
          {zone.sync_buy_sell ? t('zone.section.grid') : t('zone.section.buyGridShort')}
        </SectionLabel>
      )}

      <ZoneGridFields
        zone={zone}
        update={update}
        symbolConfig={symbolConfig}
        isBoth={isBoth}
        sync={zone.sync_buy_sell}
        handleChange={handleChange}
        handleBlur={handleBlur}
        onStepByLoss={handleStepByLoss}
      />

      {isBoth && !zone.sync_buy_sell && (
        <ZoneSellFields
          zone={zone}
          update={update}
          symbolConfig={symbolConfig}
          handleChange={handleChange}
          handleBlur={handleBlur}
        />
      )}
    </section>
  );

  const breakout = !isFractal && (
    <ZoneBreakoutFields
      zone={zone}
      update={update}
      symbolConfig={symbolConfig}
      isBoth={isBoth}
      sync={zone.sync_buy_sell}
      handleChange={handleChange}
      handleBlur={handleBlur}
      plain={columns}
    />
  );

  if (columns) {
    return (
      <div
        className="setup-fields grid gap-[14px] lg:grid-cols-[1.2fr_1fr_1fr] lg:items-start"
        style={{ padding: '12px 14px 20px 16px' }}
      >
        <Box title={t('zone.box.entry')} testId="zone-entry-column">
          {basic}
          {entryRest}
        </Box>
        <Box title={t('zone.box.guard')} testId="zone-guard-column">
          {breakout}
          <ZoneSpreadFields zone={zone} update={update} status={spreadStatus} connected={connected} plain />
        </Box>
        <Box title={t('zone.box.exit')} testId="zone-exit-column">
          <ZoneExitFields zone={zone} update={update} plain />
        </Box>
      </div>
    );
  }

  return (
      // Ab lg zwei Spalten (W8): links Einstieg (Grund, Grid/Fraktal, Breakout), rechts Schutz/Ausstieg
      <div className="px-2.5 py-3 sm:px-4 sm:py-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6">
        <div data-testid="zone-entry-column" className="min-w-0 space-y-3 sm:space-y-4">
          {basic}
          {entryRest}
          {breakout}
        </div>

        <div data-testid="zone-exit-column" className="mt-3 min-w-0 space-y-3 sm:mt-4 sm:space-y-4 lg:mt-0">
          <ZoneSpreadFields zone={zone} update={update} status={spreadStatus} connected={connected} />
          <ZoneExitFields zone={zone} update={update} />
        </div>
      </div>
  );
}
