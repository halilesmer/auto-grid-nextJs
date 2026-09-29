'use client';

import type { ZoneSellFieldsProps } from './types';
import { InputField } from '@/components/ui/InputField';
import { NumberInput } from '@/components/ui/NumberInput';
import { SectionLabel } from '@/components/ui/card';
import { useT } from '@/i18n';
import { useGuidedHints } from './useGuidedHints';
import { entryOf } from '@/utils/zoneHelpers';

export function ZoneSellFields({
  zone,
  update,
  symbolConfig,
  handleChange,
  handleBlur,
}: ZoneSellFieldsProps) {
  const t = useT();
  const guided = useGuidedHints(zone.symbol);
  const { entry_mode, tp_mode } = entryOf(zone);
  const noGrid = entry_mode === 'SIGNAL_MARKET';
  const moneyTp = tp_mode === 'MONEY';
  const volPrecision = symbolConfig.volStep.toString().includes('.')
    ? symbolConfig.volStep.toString().split('.')[1].length
    : 2;

  return (
    <>
      <SectionLabel className="pt-1 text-danger">{t('zone.section.sellGridShort')}</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <InputField label={t('zone.field.sellGrid')} hint={noGrid ? t('zone.field.gridStep.market.hint') : guided.step(t('zone.field.sellGrid.hint'))}>
          <NumberInput
            min={symbolConfig.min}
            step={symbolConfig.step}
            maxDecimals={symbolConfig.precision}
            value={zone.sell_grid_step}
            onChange={(e) => handleChange('sell_grid_step', e.target.value, zone, symbolConfig, update)}
            onBlur={() => handleBlur('sell_grid_step', zone.sell_grid_step, symbolConfig.step, symbolConfig.precision, update)}
            disabled={noGrid}
            className="input-s"
          />
        </InputField>
        <InputField label={t('zone.field.sellLot')} hint={t('zone.field.sellLot.hint')}>
          <NumberInput
            min={symbolConfig.volMin}
            step={symbolConfig.volStep}
            maxDecimals={volPrecision}
            value={zone.sell_lot_size}
            onChange={(e) => handleChange('sell_lot_size', e.target.value, zone, symbolConfig, update)}
            onBlur={() => handleBlur('sell_lot_size', zone.sell_lot_size, symbolConfig.volStep, volPrecision, update)}
            className="input-s"
          />
        </InputField>
        <InputField label={t('zone.field.sellTakeProfit')} hint={moneyTp ? t('zone.field.takeProfit.money.hint') : guided.tp(t('zone.field.sellTakeProfit.hint'))}>
          <NumberInput
            min={0}
            step={symbolConfig.step}
            maxDecimals={symbolConfig.precision}
            value={zone.sell_take_profit}
            onChange={(e) => handleChange('sell_take_profit', e.target.value, zone, symbolConfig, update)}
            onBlur={() => handleBlur('sell_take_profit', zone.sell_take_profit, symbolConfig.step, symbolConfig.precision, update)}
            disabled={moneyTp}
            className="input-s"
          />
        </InputField>
        <InputField label={t('zone.field.sellStopLoss')} hint={t('zone.field.sellStopLoss.hint')}>
          <NumberInput
            min={0}
            step={symbolConfig.step}
            maxDecimals={symbolConfig.precision}
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
