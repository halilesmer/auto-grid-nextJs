'use client';

import type { ZoneSellFieldsProps } from './types';
import { InputField } from '@/components/ui/InputField';

export function ZoneSellFields({
  zone,
  update,
  symbolConfig,
  handleChange,
  handleBlur,
}: ZoneSellFieldsProps) {
  const volPrecision = symbolConfig.volStep.toString().includes('.')
    ? symbolConfig.volStep.toString().split('.')[1].length
    : 2;

  return (
    <>
      <p className="text-sm text-red-400 font-semibold">SELL Grid Ayarları</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <InputField label="SELL Grid ($)">
          <input
            type="number"
            min={symbolConfig.min}
            step={symbolConfig.step}
            value={zone.sell_grid_step}
            onChange={(e) => handleChange('sell_grid_step', e.target.value, zone, symbolConfig, update)}
            onBlur={() => handleBlur('sell_grid_step', zone.sell_grid_step, symbolConfig.step, symbolConfig.precision, update)}
            className="input-s"
          />
        </InputField>
        <InputField label="SELL Lot">
          <input
            type="number"
            min={symbolConfig.volMin}
            step={symbolConfig.volStep}
            value={zone.sell_lot_size}
            onChange={(e) => handleChange('sell_lot_size', e.target.value, zone, symbolConfig, update)}
            onBlur={() => handleBlur('sell_lot_size', zone.sell_lot_size, symbolConfig.volStep, volPrecision, update)}
            className="input-s"
          />
        </InputField>
        <InputField label="SELL KA ($)">
          <input
            type="number"
            min={0}
            step={symbolConfig.step}
            value={zone.sell_take_profit}
            onChange={(e) => handleChange('sell_take_profit', e.target.value, zone, symbolConfig, update)}
            onBlur={() => handleBlur('sell_take_profit', zone.sell_take_profit, symbolConfig.step, symbolConfig.precision, update)}
            className="input-s"
          />
        </InputField>
        <InputField label="SELL ZD ($)">
          <input
            type="number"
            min={0}
            step={symbolConfig.step}
            value={zone.sell_stop_loss}
            onChange={(e) => handleChange('sell_stop_loss', e.target.value, zone, symbolConfig, update)}
            onBlur={() => handleBlur('sell_stop_loss', zone.sell_stop_loss, symbolConfig.step, symbolConfig.precision, update)}
            className="input-s"
          />
        </InputField>
      </div>
    </>
  );
}
