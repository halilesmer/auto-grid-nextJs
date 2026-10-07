'use client';

import type { ZoneGridFieldsProps } from './types';
import { InputField } from '@/components/ui/InputField';
import { NumberInput } from '@/components/ui/NumberInput';
import { useT } from '@/i18n';
import { useGuidedHints } from './useGuidedHints';
import { LossPreview } from './LossPreview';
import { FieldSwitch } from './FieldSwitch';
import { distanceConfig } from '@/utils/zoneHelpers';

export function ZoneGridFields({
  zone,
  update,
  symbolConfig,
  isBoth,
  sync,
  handleChange,
  handleBlur,
  onStepByLoss,
}: ZoneGridFieldsProps) {
  const t = useT();
  const guided = useGuidedHints(zone.symbol);
  const byLoss = !!zone.step_by_loss;
  const stepCfg = distanceConfig(symbolConfig, byLoss);
  const split = isBoth && !sync;
  const volPrecision = symbolConfig.volStep.toString().includes('.')
    ? symbolConfig.volStep.toString().split('.')[1].length
    : 2;

  return (
    <div className="flex flex-wrap items-start gap-3">
      <InputField
        label={
          byLoss
            ? t(split ? 'zone.field.buyGridLoss' : 'zone.field.gridStepLoss')
            : t(split ? 'zone.field.buyGrid' : 'zone.field.gridStep')
        }
        hint={
          byLoss
            ? t(split ? 'zone.field.buyGridLoss.hint' : 'zone.field.gridStepLoss.hint')
            : guided.step(t(split ? 'zone.field.buyGrid.hint' : 'zone.field.gridStep.hint'))
        }
        error={byLoss && <LossPreview amount={zone.grid_step} lot={zone.lot_size} symbolConfig={symbolConfig} />}
      >
        <NumberInput
          min={stepCfg.min}
          step={stepCfg.step}
          maxDecimals={stepCfg.precision}
          value={zone.grid_step}
          onChange={(e) => handleChange('grid_step', e.target.value, zone, stepCfg, update)}
          onBlur={() => handleBlur('grid_step', zone.grid_step, stepCfg.step, stepCfg.precision, update)}
          className="input-s w-28"
        />
      </InputField>
      <InputField
        label={isBoth && !sync ? t('zone.field.buyLot') : t('zone.field.lot')}
        hint={isBoth && !sync ? t('zone.field.buyLot.hint') : t('zone.field.lot.hint')}
      >
        <NumberInput
          min={symbolConfig.volMin}
          max={Number.isFinite(symbolConfig.volMax) ? symbolConfig.volMax : undefined}
          step={symbolConfig.volStep}
          maxDecimals={volPrecision}
          value={zone.lot_size}
          onChange={(e) => handleChange('lot_size', e.target.value, zone, symbolConfig, update)}
          onBlur={() => handleBlur('lot_size', zone.lot_size, symbolConfig.volStep, volPrecision, update, symbolConfig)}
          className="input-s w-24"
        />
      </InputField>
      <InputField
        label={
          byLoss
            ? t(split ? 'zone.field.buyTakeProfitLoss' : 'zone.field.takeProfitLoss')
            : t(split ? 'zone.field.buyTakeProfit' : 'zone.field.takeProfit')
        }
        hint={
          byLoss
            ? t(split ? 'zone.field.buyTakeProfitLoss.hint' : 'zone.field.takeProfitLoss.hint')
            : guided.tp(t(split ? 'zone.field.buyTakeProfit.hint' : 'zone.field.takeProfit.hint'))
        }
        error={byLoss && <LossPreview amount={zone.take_profit} lot={zone.lot_size} symbolConfig={symbolConfig} />}
      >
        <NumberInput
          min={0}
          step={stepCfg.step}
          maxDecimals={stepCfg.precision}
          value={zone.take_profit}
          onChange={(e) => handleChange('take_profit', e.target.value, zone, stepCfg, update)}
          onBlur={() => handleBlur('take_profit', zone.take_profit, stepCfg.step, stepCfg.precision, update)}
          className="input-s w-28"
        />
      </InputField>
      <InputField
        label={
          byLoss
            ? t(split ? 'zone.field.buyStopLossLoss' : 'zone.field.stopLossLoss')
            : t(split ? 'zone.field.buyStopLoss' : 'zone.field.stopLoss')
        }
        hint={
          byLoss
            ? t(split ? 'zone.field.buyStopLossLoss.hint' : 'zone.field.stopLossLoss.hint')
            : t(split ? 'zone.field.buyStopLoss.hint' : 'zone.field.stopLoss.hint')
        }
        error={byLoss && <LossPreview amount={zone.stop_loss} lot={zone.lot_size} symbolConfig={symbolConfig} />}
      >
        <NumberInput
          min={0}
          step={stepCfg.step}
          maxDecimals={stepCfg.precision}
          value={zone.stop_loss}
          onChange={(e) => handleChange('stop_loss', e.target.value, zone, stepCfg, update)}
          onBlur={() => handleBlur('stop_loss', zone.stop_loss, stepCfg.step, stepCfg.precision, update)}
          className="input-s w-28"
        />
      </InputField>
      <FieldSwitch
        id={`step-by-loss-${zone.id}`}
        checked={byLoss}
        onChange={onStepByLoss}
        label={<span className="text-xs text-muted-foreground">{t('zone.stepByLoss')}</span>}
        hint={t('zone.stepByLoss.hint')}
      />
      <FieldSwitch
        id={`instant-entry-${zone.id}`}
        checked={!!zone.instant_entry}
        onChange={(checked) => update('instant_entry', checked)}
        label={<span className="text-xs text-muted-foreground">{t('zone.instantEntry')}</span>}
        hint={t('zone.instantEntry.hint')}
      />
    </div>
  );
}
