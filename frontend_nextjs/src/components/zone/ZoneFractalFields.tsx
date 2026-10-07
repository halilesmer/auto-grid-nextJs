'use client';

import type { ZoneFractalFieldsProps } from './types';
import { InputField } from '@/components/ui/InputField';
import { NumberInput } from '@/components/ui/NumberInput';
import { useT } from '@/i18n';
import { TIMEFRAMES } from '@/utils/zoneHelpers';
import { FieldSwitch } from './FieldSwitch';
import { LossPreview } from './LossPreview';

// Faktoren (ATR, SAR) sind keine Preise: eigene Schrittweite statt Symbol-Digits
const FACTOR = { step: 0.1, precision: 2 };
const SAR = { step: 0.01, precision: 3 };
// Wie FRACTAL_MAX_ORDERS im Worker (grid_execution/config.py)
const MAX_ORDERS = 20;

// Ein Feld gilt für die gewählte Richtung bzw. bei „Buy/Sell gleich“ für beide; getrennt nur bei split
function orderCountKey({ split, orderType }: { split: boolean; orderType: string }) {
  if (split || orderType === 'BUY') return 'zone.fractal.buyOrderCount' as const;
  if (orderType === 'SELL') return 'zone.fractal.sellOrderCount' as const;
  return 'zone.fractal.orderCount' as const;
}

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
  const useSl = zone.fractal_use_sl ?? true;
  const slMode = zone.fractal_sl_mode ?? 'atr';
  // Chance/Risiko-TP braucht einen SL: ohne SL nur TP als Betrag
  const tpByMoney = !useSl || !!zone.fractal_tp_by_money;
  const nextLossByPips = zone.fractal_next_loss_mode === 'pips';
  const countKey = orderCountKey({ split, orderType: zone.order_type });
  const volPrecision = symbolConfig.volStep.toString().includes('.')
    ? symbolConfig.volStep.toString().split('.')[1].length
    : 2;

  const factorField = (field: 'fractal_atr_multiplier' | 'fractal_sar_step' | 'fractal_sar_max', cfg: typeof FACTOR, fallback: number) => (
    <NumberInput
      min={0}
      step={cfg.step}
      maxDecimals={cfg.precision}
      value={zone[field] ?? fallback}
      onChange={(e) => handleChange(field, e.target.value, zone, { ...symbolConfig, precision: cfg.precision }, update)}
      className="input-s w-24"
    />
  );

  const lotField = (field: 'lot_size' | 'sell_lot_size') => (
    <NumberInput
      min={symbolConfig.volMin}
      max={Number.isFinite(symbolConfig.volMax) ? symbolConfig.volMax : undefined}
      step={symbolConfig.volStep}
      maxDecimals={volPrecision}
      value={zone[field]}
      onChange={(e) => handleChange(field, e.target.value, zone, symbolConfig, update)}
      onBlur={() => handleBlur(field, zone[field], symbolConfig.volStep, volPrecision, update, symbolConfig)}
      className="input-s w-24"
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
      className="input-s w-20"
    />
  );

  return (
    <div data-testid="fractal-fields" className="space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <InputField label={t('zone.fractal.orderMode')} hint={t('zone.fractal.orderMode.hint')}>
          <select
            data-testid="fractal-order-mode"
            value={zone.fractal_order_mode ?? 'breakout'}
            onChange={(e) => update('fractal_order_mode', e.target.value)}
            className="input-s w-auto"
          >
            <option value="breakout">{t('zone.fractal.orderMode.breakout')}</option>
            <option value="rebound">{t('zone.fractal.orderMode.rebound')}</option>
          </select>
        </InputField>
        <InputField label={t('zone.fractal.timeframe')} hint={t('zone.fractal.timeframe.hint')}>
          <select
            data-testid="fractal-timeframe"
            value={zone.fractal_timeframe ?? 'H4'}
            onChange={(e) => update('fractal_timeframe', e.target.value)}
            className="input-s w-auto"
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
        <InputField label={t('zone.fractal.maxPositions')} hint={t('zone.fractal.maxPositions.hint')}>
          <NumberInput
            data-testid="fractal-max-positions"
            min={0}
            step={1}
            maxDecimals={0}
            value={zone.max_positions}
            onChange={(e) => update('max_positions', parseInt(e.target.value, 10) || 0)}
            className="input-s w-20"
          />
        </InputField>
        <FieldSwitch
          id={`fractal-next-loss-pips-${zone.id}`}
          checked={nextLossByPips}
          onChange={(checked) => update('fractal_next_loss_mode', checked ? 'pips' : 'money')}
          label={<span className="text-sm">{t('zone.fractal.nextLossByPips')}</span>}
          hint={t('zone.fractal.nextLossByPips.hint')}
        />
        <InputField
          label={t(nextLossByPips ? 'zone.fractal.nextLossPips' : 'zone.fractal.nextLossMoney')}
          hint={t(nextLossByPips ? 'zone.fractal.nextLossPips.hint' : 'zone.fractal.nextLossMoney.hint')}
        >
          <NumberInput
            data-testid="fractal-next-loss"
            min={0}
            step={nextLossByPips ? symbolConfig.step : 0.01}
            maxDecimals={nextLossByPips ? symbolConfig.precision : 2}
            value={zone.fractal_next_loss ?? 0}
            onChange={(e) =>
              handleChange(
                'fractal_next_loss', e.target.value, zone,
                { ...symbolConfig, precision: nextLossByPips ? symbolConfig.precision : 2 }, update,
              )
            }
            className={nextLossByPips ? 'input-s w-28' : 'input-s w-24'}
          />
        </InputField>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <FieldSwitch
          id={`fractal-use-sl-${zone.id}`}
          checked={useSl}
          onChange={(checked) => update('fractal_use_sl', checked)}
          label={<span className="text-sm">{t('zone.fractal.useSl')}</span>}
          hint={t('zone.fractal.useSl.hint')}
        />
        {useSl && (
          <>
            <InputField label={t('zone.fractal.slMode')} hint={t('zone.fractal.slMode.hint')}>
              <select
                data-testid="fractal-sl-mode"
                value={slMode}
                onChange={(e) => update('fractal_sl_mode', e.target.value)}
                className="input-s w-auto"
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
                    className="input-s w-20"
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
                className="input-s w-28"
              />
            </InputField>
          </>
        )}
        {/* Eigene Gruppe: beim Umbrechen bleibt der Schalter bei seinem TP-Feld */}
        <div className="flex flex-wrap items-start gap-3">
          <FieldSwitch
            id={`fractal-tp-by-money-${zone.id}`}
            checked={tpByMoney}
            disabled={!useSl}
            onChange={(checked) => update('fractal_tp_by_money', checked)}
            label={<span className="text-sm">{t('zone.fractal.tpByMoney')}</span>}
            hint={t('zone.fractal.tpByMoney.hint')}
          />
          {tpByMoney ? (
            <InputField
              label={t('zone.fractal.tpMoney')}
              hint={t('zone.fractal.tpMoney.hint')}
              error={<LossPreview amount={zone.fractal_tp_money ?? 10} lot={zone.lot_size} symbolConfig={symbolConfig} />}
            >
              <NumberInput
                data-testid="fractal-tp-money"
                min={0}
                step={0.01}
                maxDecimals={2}
                value={zone.fractal_tp_money ?? 10}
                onChange={(e) =>
                  handleChange('fractal_tp_money', e.target.value, zone, { ...symbolConfig, precision: 2 }, update)
                }
                className="input-s w-24"
              />
            </InputField>
          ) : (
            <InputField label={t('zone.fractal.rr')} hint={t('zone.fractal.rr.hint')}>
              <NumberInput
                data-testid="fractal-rr"
                min={0}
                step={FACTOR.step}
                maxDecimals={FACTOR.precision}
                value={zone.fractal_rr ?? 2}
                onChange={(e) =>
                  handleChange('fractal_rr', e.target.value, zone, { ...symbolConfig, precision: FACTOR.precision }, update)
                }
                className="input-s w-24"
              />
            </InputField>
          )}
        </div>
      </div>
    </div>
  );
}
