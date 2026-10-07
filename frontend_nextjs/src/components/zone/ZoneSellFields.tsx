'use client';

import type { ZoneSellFieldsProps } from './types';
import { InputField } from '@/components/ui/InputField';
import { NumberInput } from '@/components/ui/NumberInput';
import { SectionLabel } from '@/components/ui/card';
import { useT } from '@/i18n';
import { useGuidedHints } from './useGuidedHints';
import { LossPreview } from './LossPreview';
import { distanceConfig } from '@/utils/zoneHelpers';

export function ZoneSellFields({
  zone,
  update,
  symbolConfig,
  handleChange,
  handleBlur,
}: ZoneSellFieldsProps) {
  const t = useT();
  const guided = useGuidedHints(zone.symbol);
  const byLoss = !!zone.step_by_loss;
  const stepCfg = distanceConfig(symbolConfig, byLoss);
  const volPrecision = symbolConfig.volStep.toString().includes('.')
    ? symbolConfig.volStep.toString().split('.')[1].length
    : 2;

  return (
    <>
      <SectionLabel className="pt-1 text-danger">{t('zone.section.sellGridShort')}</SectionLabel>
      <div className="flex flex-wrap items-start gap-3">
        <InputField
          label={byLoss ? t('zone.field.sellGridLoss') : t('zone.field.sellGrid')}
          hint={byLoss ? t('zone.field.sellGridLoss.hint') : guided.step(t('zone.field.sellGrid.hint'))}
          error={byLoss && <LossPreview amount={zone.sell_grid_step} lot={zone.sell_lot_size} symbolConfig={symbolConfig} />}
        >
          <NumberInput
            min={stepCfg.min}
            step={stepCfg.step}
            maxDecimals={stepCfg.precision}
            value={zone.sell_grid_step}
            onChange={(e) => handleChange('sell_grid_step', e.target.value, zone, stepCfg, update)}
            onBlur={() => handleBlur('sell_grid_step', zone.sell_grid_step, stepCfg.step, stepCfg.precision, update)}
            className="input-s w-28"
          />
        </InputField>
        <InputField label={t('zone.field.sellLot')} hint={t('zone.field.sellLot.hint')}>
          <NumberInput
            min={symbolConfig.volMin}
            max={Number.isFinite(symbolConfig.volMax) ? symbolConfig.volMax : undefined}
            step={symbolConfig.volStep}
            maxDecimals={volPrecision}
            value={zone.sell_lot_size}
            onChange={(e) => handleChange('sell_lot_size', e.target.value, zone, symbolConfig, update)}
            onBlur={() => handleBlur('sell_lot_size', zone.sell_lot_size, symbolConfig.volStep, volPrecision, update, symbolConfig)}
            className="input-s w-24"
          />
        </InputField>
        <InputField
          label={byLoss ? t('zone.field.sellTakeProfitLoss') : t('zone.field.sellTakeProfit')}
          hint={byLoss ? t('zone.field.sellTakeProfitLoss.hint') : guided.tp(t('zone.field.sellTakeProfit.hint'))}
          error={byLoss && <LossPreview amount={zone.sell_take_profit} lot={zone.sell_lot_size} symbolConfig={symbolConfig} />}
        >
          <NumberInput
            min={0}
            step={stepCfg.step}
            maxDecimals={stepCfg.precision}
            value={zone.sell_take_profit}
            onChange={(e) => handleChange('sell_take_profit', e.target.value, zone, stepCfg, update)}
            onBlur={() => handleBlur('sell_take_profit', zone.sell_take_profit, stepCfg.step, stepCfg.precision, update)}
            className="input-s w-28"
          />
        </InputField>
        <InputField
          label={byLoss ? t('zone.field.sellStopLossLoss') : t('zone.field.sellStopLoss')}
          hint={byLoss ? t('zone.field.sellStopLossLoss.hint') : t('zone.field.sellStopLoss.hint')}
          error={byLoss && <LossPreview amount={zone.sell_stop_loss} lot={zone.sell_lot_size} symbolConfig={symbolConfig} />}
        >
          <NumberInput
            min={0}
            step={stepCfg.step}
            maxDecimals={stepCfg.precision}
            value={zone.sell_stop_loss}
            onChange={(e) => handleChange('sell_stop_loss', e.target.value, zone, stepCfg, update)}
            onBlur={() => handleBlur('sell_stop_loss', zone.sell_stop_loss, stepCfg.step, stepCfg.precision, update)}
            className="input-s w-28"
          />
        </InputField>
      </div>
    </>
  );
}
