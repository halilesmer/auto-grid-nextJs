'use client';

import type { ZoneFractalFieldsProps } from './types';
import { InputField } from '@/components/ui/InputField';
import { NumberInput } from '@/components/ui/NumberInput';
import { useT } from '@/i18n';
import { TIMEFRAMES } from '@/utils/zoneHelpers';

// Faktoren (ATR, SAR, Chance/Risiko) sind keine Preise: eigene Schrittweite statt Symbol-Digits
const FACTOR = { step: 0.1, precision: 2 };
const SAR = { step: 0.01, precision: 3 };
// Wie FRACTAL_MAX_ORDERS im Worker (grid_execution/config.py)
const MAX_ORDERS = 20;

export function ZoneFractalFields({
  zone,
  update,
  symbolConfig,
  isBoth,
  sync,
  handleChange,
  handleBlur,
}: ZoneFractalFieldsProps) {
  const t = useT();
  const split = isBoth && !sync;
  const slMode = zone.fractal_sl_mode ?? 'atr';
  // Ein Feld gilt für die gewählte Richtung bzw. bei „Buy/Sell gleich“ für beide; getrennt nur bei split
  const countKey =
    split || zone.order_type === 'BUY'
      ? 'zone.fractal.buyOrderCount'
      : zone.order_type === 'SELL'
        ? 'zone.fractal.sellOrderCount'
        : 'zone.fractal.orderCount';
  const volPrecision = symbolConfig.volStep.toString().includes('.')
    ? symbolConfig.volStep.toString().split('.')[1].length
    : 2;

  const factorField = (field: 'fractal_atr_multiplier' | 'fractal_sar_step' | 'fractal_sar_max' | 'fractal_rr', cfg: typeof FACTOR, fallback: number) => (
    <NumberInput
      min={0}
      step={cfg.step}
      maxDecimals={cfg.precision}
      value={zone[field] ?? fallback}
      onChange={(e) => handleChange(field, e.target.value, zone, { ...symbolConfig, precision: cfg.precision }, update)}
      className="input-s"
    />
  );

  const countField = (field: 'fractal_order_count' | 'sell_fractal_order_count') => (
    <NumberInput
      data-testid={field === 'fractal_order_count' ? 'fractal-order-count' : 'fractal-sell-order-count'}
      min={1}
      max={MAX_ORDERS}
      step={1}
      maxDecimals={0}
      value={zone[field] ?? 1}
      onChange={(e) => update(field, Math.min(MAX_ORDERS, Math.max(1, parseInt(e.target.value, 10) || 1)))}
      className="input-s"
    />
  );

  return (
    <div data-testid="fractal-fields" className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <InputField label={t('zone.fractal.timeframe')} hint={t('zone.fractal.timeframe.hint')}>
          <select
            data-testid="fractal-timeframe"
            value={zone.fractal_timeframe ?? 'H4'}
            onChange={(e) => update('fractal_timeframe', e.target.value)}
            className="input-s"
          >
            {TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>
        </InputField>
        <InputField label={t('zone.fractal.orderMode')} hint={t('zone.fractal.orderMode.hint')}>
          <select
            data-testid="fractal-order-mode"
            value={zone.fractal_order_mode ?? 'breakout'}
            onChange={(e) => update('fractal_order_mode', e.target.value)}
            className="input-s"
          >
            <option value="breakout">{t('zone.fractal.orderMode.breakout')}</option>
            <option value="rebound">{t('zone.fractal.orderMode.rebound')}</option>
          </select>
        </InputField>
        <InputField
          label={split ? t('zone.field.buyLot') : t('zone.field.lot')}
          hint={split ? t('zone.field.buyLot.hint') : t('zone.field.lot.hint')}
        >
          <NumberInput
            min={symbolConfig.volMin}
            max={Number.isFinite(symbolConfig.volMax) ? symbolConfig.volMax : undefined}
            step={symbolConfig.volStep}
            maxDecimals={volPrecision}
            value={zone.lot_size}
            onChange={(e) => handleChange('lot_size', e.target.value, zone, symbolConfig, update)}
            onBlur={() => handleBlur('lot_size', zone.lot_size, symbolConfig.volStep, volPrecision, update, symbolConfig)}
            className="input-s"
          />
        </InputField>
        {split ? (
          <InputField label={t('zone.field.sellLot')} hint={t('zone.field.sellLot.hint')}>
            <NumberInput
              min={symbolConfig.volMin}
              max={Number.isFinite(symbolConfig.volMax) ? symbolConfig.volMax : undefined}
              step={symbolConfig.volStep}
              maxDecimals={volPrecision}
              value={zone.sell_lot_size}
              onChange={(e) => handleChange('sell_lot_size', e.target.value, zone, symbolConfig, update)}
              onBlur={() => handleBlur('sell_lot_size', zone.sell_lot_size, symbolConfig.volStep, volPrecision, update, symbolConfig)}
              className="input-s"
            />
          </InputField>
        ) : null}
        <InputField label={t(countKey)} hint={t(`${countKey}.hint`)}>
          {countField('fractal_order_count')}
        </InputField>
        {split ? (
          <InputField label={t('zone.fractal.sellOrderCount')} hint={t('zone.fractal.sellOrderCount.hint')}>
            {countField('sell_fractal_order_count')}
          </InputField>
        ) : null}
        <InputField label={t('zone.breakout.maxPositions')} hint={t('zone.breakout.maxPositions.hint')}>
          <NumberInput
            min={0}
            step={1}
            maxDecimals={0}
            value={zone.max_positions}
            onChange={(e) => update('max_positions', parseInt(e.target.value, 10) || 0)}
            className="input-s"
          />
        </InputField>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <InputField label={t('zone.fractal.slMode')} hint={t('zone.fractal.slMode.hint')}>
          <select
            data-testid="fractal-sl-mode"
            value={slMode}
            onChange={(e) => update('fractal_sl_mode', e.target.value)}
            className="input-s"
          >
            <option value="atr">{t('zone.fractal.slMode.atr')}</option>
            <option value="sar">{t('zone.fractal.slMode.sar')}</option>
            <option value="opposite_fractal">{t('zone.fractal.slMode.opposite')}</option>
            <option value="buffer">{t('zone.fractal.slMode.buffer')}</option>
          </select>
        </InputField>
        {slMode === 'atr' && (
          <>
            <InputField label={t('zone.fractal.atrPeriod')} hint={t('zone.fractal.atrPeriod.hint')}>
              <NumberInput
                min={1}
                step={1}
                maxDecimals={0}
                value={zone.fractal_atr_period ?? 14}
                onChange={(e) => update('fractal_atr_period', parseInt(e.target.value, 10) || 1)}
                className="input-s"
              />
            </InputField>
            <InputField label={t('zone.fractal.atrMultiplier')} hint={t('zone.fractal.atrMultiplier.hint')}>
              {factorField('fractal_atr_multiplier', FACTOR, 1.5)}
            </InputField>
          </>
        )}
        {slMode === 'sar' && (
          <>
            <InputField label={t('zone.fractal.sarStep')} hint={t('zone.fractal.sarStep.hint')}>
              {factorField('fractal_sar_step', SAR, 0.02)}
            </InputField>
            <InputField label={t('zone.fractal.sarMax')} hint={t('zone.fractal.sarMax.hint')}>
              {factorField('fractal_sar_max', SAR, 0.2)}
            </InputField>
          </>
        )}
        {/* Auch bei ATR/SAR sichtbar: Rückfall-SL, wenn der Indikator nicht berechenbar ist */}
        <InputField label={t('zone.fractal.slBuffer')} hint={t('zone.fractal.slBuffer.hint')}>
          <NumberInput
            min={0}
            step={symbolConfig.step}
            maxDecimals={symbolConfig.precision}
            value={zone.fractal_sl_buffer ?? 0.05}
            onChange={(e) => handleChange('fractal_sl_buffer', e.target.value, zone, symbolConfig, update)}
            onBlur={() =>
              handleBlur('fractal_sl_buffer', zone.fractal_sl_buffer, symbolConfig.step, symbolConfig.precision, update)
            }
            className="input-s"
          />
        </InputField>
        <InputField label={t('zone.fractal.rr')} hint={t('zone.fractal.rr.hint')}>
          {factorField('fractal_rr', FACTOR, 2)}
        </InputField>
      </div>
    </div>
  );
}
