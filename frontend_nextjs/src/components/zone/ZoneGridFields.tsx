'use client';

import type { ZoneGridFieldsProps } from './types';
import { InputField } from '@/components/ui/InputField';
import { NumberInput } from '@/components/ui/NumberInput';
import { useT } from '@/i18n';

export function ZoneGridFields({
  zone,
  update,
  symbolConfig,
  isBoth,
  sync,
  handleChange,
  handleBlur,
}: ZoneGridFieldsProps) {
  const t = useT();
  const volPrecision = symbolConfig.volStep.toString().includes('.')
    ? symbolConfig.volStep.toString().split('.')[1].length
    : 2;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <InputField
        label={isBoth && !sync ? t('zone.field.buyGrid') : t('zone.field.gridStep')}
        hint={isBoth && !sync ? t('zone.field.buyGrid.hint') : t('zone.field.gridStep.hint')}
      >
        <NumberInput
          min={symbolConfig.min}
          step={symbolConfig.step}
          value={zone.grid_step}
          onChange={(e) => handleChange('grid_step', e.target.value, zone, symbolConfig, update)}
          onBlur={() => handleBlur('grid_step', zone.grid_step, symbolConfig.step, symbolConfig.precision, update)}
          className="input-s"
        />
      </InputField>
      <InputField
        label={isBoth && !sync ? t('zone.field.buyLot') : t('zone.field.lot')}
        hint={isBoth && !sync ? t('zone.field.buyLot.hint') : t('zone.field.lot.hint')}
      >
        <NumberInput
          min={symbolConfig.volMin}
          step={symbolConfig.volStep}
          value={zone.lot_size}
          onChange={(e) => handleChange('lot_size', e.target.value, zone, symbolConfig, update)}
          onBlur={() => handleBlur('lot_size', zone.lot_size, symbolConfig.volStep, volPrecision, update)}
          className="input-s"
        />
      </InputField>
      <InputField
        label={isBoth && !sync ? t('zone.field.buyTakeProfit') : t('zone.field.takeProfit')}
        hint={isBoth && !sync ? t('zone.field.buyTakeProfit.hint') : t('zone.field.takeProfit.hint')}
      >
        <NumberInput
          min={0}
          step={symbolConfig.step}
          value={zone.take_profit}
          onChange={(e) => handleChange('take_profit', e.target.value, zone, symbolConfig, update)}
          onBlur={() => handleBlur('take_profit', zone.take_profit, symbolConfig.step, symbolConfig.precision, update)}
          className="input-s"
        />
      </InputField>
      <InputField
        label={isBoth && !sync ? t('zone.field.buyStopLoss') : t('zone.field.stopLoss')}
        hint={isBoth && !sync ? t('zone.field.buyStopLoss.hint') : t('zone.field.stopLoss.hint')}
      >
        <NumberInput
          min={0}
          step={symbolConfig.step}
          value={zone.stop_loss}
          onChange={(e) => handleChange('stop_loss', e.target.value, zone, symbolConfig, update)}
          onBlur={() => handleBlur('stop_loss', zone.stop_loss, symbolConfig.step, symbolConfig.precision, update)}
          className="input-s"
        />
      </InputField>
    </div>
  );
}
