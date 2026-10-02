'use client';

import type { FieldUpdateFn, HandleBlurFn, HandleChangeFn } from './types';
import type { ZoneSettings } from '@/store/types';
import { InputField } from '@/components/ui/InputField';
import { NumberInput } from '@/components/ui/NumberInput';
import { useT } from '@/i18n';
import { TIMEFRAMES, type SymbolConfig } from '@/utils/zoneHelpers';
import { LossPreview } from './LossPreview';

// Wie FRACTAL_MAX_ORDERS im Worker (grid_execution/config.py)
const MAX_ORDERS = 20;
const FACTOR = { step: 0.1, precision: 2 };

/** Die Felder, die jedes Fraktal-Setup selbst hat (Setup 1 = Zonenfelder, weitere = fractal_setups[i]). */
export interface FractalSetupValues {
  fractal_timeframe?: string;
  lot_size: number;
  sell_lot_size: number;
  fractal_order_count?: number;
  sell_fractal_order_count?: number;
  fractal_rr?: number;
  fractal_tp_money?: number;
  max_positions: number;
}

interface Props {
  /** Die Zone (für handleChange und die gemeinsamen Einstellungen) */
  zone: ZoneSettings;
  values: FractalSetupValues;
  /** Schreibt ein Feld dieses Setups (Zonenfeld bzw. Eintrag in fractal_setups) */
  update: FieldUpdateFn;
  symbolConfig: SymbolConfig;
  /** BOTH ohne „Buy/Sell gleich“: getrennte Lot- und Anzahl-Felder */
  split: boolean;
  /** TP als Betrag statt Chance/Risiko (gemeinsamer Schalter der Zone) */
  tpByMoney: boolean;
  handleChange: HandleChangeFn;
  handleBlur: HandleBlurFn;
}

export function ZoneFractalSetupFields({
  zone,
  values,
  update,
  symbolConfig,
  split,
  tpByMoney,
  handleChange,
  handleBlur,
}: Props) {
  const t = useT();
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

  const lotField = (field: 'lot_size' | 'sell_lot_size') => (
    <NumberInput
      min={symbolConfig.volMin}
      max={Number.isFinite(symbolConfig.volMax) ? symbolConfig.volMax : undefined}
      step={symbolConfig.volStep}
      maxDecimals={volPrecision}
      value={values[field]}
      onChange={(e) => handleChange(field, e.target.value, zone, symbolConfig, update)}
      onBlur={() => handleBlur(field, values[field], symbolConfig.volStep, volPrecision, update, symbolConfig)}
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
      value={values[field] ?? 1}
      onChange={(e) => update(field, Math.min(MAX_ORDERS, Math.max(1, parseInt(e.target.value, 10) || 1)))}
      className="input-s"
    />
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <InputField label={t('zone.fractal.timeframe')} hint={t('zone.fractal.timeframe.hint')}>
        <select
          data-testid="fractal-timeframe"
          value={values.fractal_timeframe ?? 'H4'}
          onChange={(e) => update('fractal_timeframe', e.target.value)}
          className="input-s"
        >
          {TIMEFRAMES.map((tf) => (
            <option key={tf} value={tf}>{tf}</option>
          ))}
        </select>
      </InputField>
      <InputField
        label={split ? t('zone.field.buyLot') : t('zone.field.lot')}
        hint={split ? t('zone.field.buyLot.hint') : t('zone.field.lot.hint')}
      >
        {lotField('lot_size')}
      </InputField>
      {split ? (
        <InputField label={t('zone.field.sellLot')} hint={t('zone.field.sellLot.hint')}>
          {lotField('sell_lot_size')}
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
      {tpByMoney ? (
        <InputField
          label={t('zone.fractal.tpMoney')}
          hint={t('zone.fractal.tpMoney.hint')}
          error={<LossPreview amount={values.fractal_tp_money ?? 10} lot={values.lot_size} symbolConfig={symbolConfig} />}
        >
          <NumberInput
            data-testid="fractal-tp-money"
            min={0}
            step={0.01}
            maxDecimals={2}
            value={values.fractal_tp_money ?? 10}
            onChange={(e) =>
              handleChange('fractal_tp_money', e.target.value, zone, { ...symbolConfig, precision: 2 }, update)
            }
            className="input-s"
          />
        </InputField>
      ) : (
        <InputField label={t('zone.fractal.rr')} hint={t('zone.fractal.rr.hint')}>
          <NumberInput
            data-testid="fractal-rr"
            min={0}
            step={FACTOR.step}
            maxDecimals={FACTOR.precision}
            value={values.fractal_rr ?? 2}
            onChange={(e) =>
              handleChange('fractal_rr', e.target.value, zone, { ...symbolConfig, precision: FACTOR.precision }, update)
            }
            className="input-s"
          />
        </InputField>
      )}
      <InputField label={t('zone.fractal.maxPositions')} hint={t('zone.fractal.maxPositions.hint')}>
        <NumberInput
          data-testid="fractal-max-positions"
          min={0}
          step={1}
          maxDecimals={0}
          value={values.max_positions}
          onChange={(e) => update('max_positions', parseInt(e.target.value, 10) || 0)}
          className="input-s"
        />
      </InputField>
    </div>
  );
}
