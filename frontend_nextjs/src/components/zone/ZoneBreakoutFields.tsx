'use client';

import type { ZoneBreakoutFieldsProps } from './types';
import { InputField } from '@/components/ui/InputField';
import { NumberInput } from '@/components/ui/NumberInput';
import { SectionLabel } from '@/components/ui/card';
import { useT } from '@/i18n';
import { distanceConfig } from '@/utils/zoneHelpers';
import { FieldSwitch } from './FieldSwitch';

export function ZoneBreakoutFields({
  zone,
  update,
  symbolConfig,
  isBoth,
  sync,
  handleChange,
  handleBlur,
}: ZoneBreakoutFieldsProps) {
  const t = useT();
  const byLoss = !!zone.step_by_loss;
  const split = isBoth && !sync;
  const pbCfg = distanceConfig(symbolConfig, byLoss);
  const pullbackHint = byLoss
    ? t(split ? 'zone.breakout.buyPullbackLoss.hint' : 'zone.breakout.minPullbackLoss.hint')
    : t(split ? 'zone.breakout.buyPullback.hint' : 'zone.breakout.minPullback.hint');
  const sellPullbackHint = byLoss ? t('zone.breakout.sellPullbackLoss.hint') : t('zone.breakout.sellPullback.hint');

  return (
    <section className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <SectionLabel>{t('zone.breakout.title')}</SectionLabel>
      <div className="flex flex-wrap items-start gap-3">
        <FieldSwitch
          checked={zone.is_breakout}
          onChange={(checked) => update('is_breakout', checked)}
          label={t('zone.breakout.trendOnly')}
          hint={t('zone.breakout.trendOnly.hint')}
        />
        <InputField
          label={
            byLoss
              ? t(split ? 'zone.breakout.buyPullbackLoss' : 'zone.breakout.minPullbackLoss')
              : t(split ? 'zone.breakout.buyPullback' : 'zone.breakout.minPullback')
          }
          hint={zone.is_breakout ? pullbackHint : t('zone.breakout.pullback.off.hint')}
        >
          <NumberInput
            min={0}
            step={pbCfg.step}
            maxDecimals={pbCfg.precision}
            value={zone.pullback_distance}
            onChange={(e) => handleChange('pullback_distance', e.target.value, zone, pbCfg, update)}
            onBlur={() => handleBlur('pullback_distance', zone.pullback_distance, pbCfg.step, pbCfg.precision, update)}
            disabled={!zone.is_breakout}
            className="input-s w-28"
          />
        </InputField>
        {split && (
          <InputField
            label={byLoss ? t('zone.breakout.sellPullbackLoss') : t('zone.breakout.sellPullback')}
            hint={zone.is_breakout ? sellPullbackHint : t('zone.breakout.pullback.off.hint')}
          >
            <NumberInput
              min={0}
              step={pbCfg.step}
              maxDecimals={pbCfg.precision}
              value={zone.sell_pullback_distance}
              onChange={(e) => handleChange('sell_pullback_distance', e.target.value, zone, pbCfg, update)}
              onBlur={() => handleBlur('sell_pullback_distance', zone.sell_pullback_distance, pbCfg.step, pbCfg.precision, update)}
              disabled={!zone.is_breakout}
              className="input-s w-28"
            />
          </InputField>
        )}
        <InputField
          label={t('zone.breakout.levelsBelow')}
          hint={
            zone.is_breakout && zone.order_type === 'BUY'
              ? t('zone.breakout.levelsBelow.off.hint')
              : t('zone.breakout.levelsBelow.hint')
          }
        >
          <NumberInput
            min={1}
            step={1}
            maxDecimals={0}
            value={zone.levels_below}
            onChange={(e) => update('levels_below', parseInt(e.target.value, 10) || 1)}
            disabled={zone.is_breakout && zone.order_type === 'BUY'}
            className="input-s w-20"
          />
        </InputField>
        <InputField
          label={t('zone.breakout.levelsAbove')}
          hint={
            zone.is_breakout && zone.order_type === 'SELL'
              ? t('zone.breakout.levelsAbove.off.hint')
              : t('zone.breakout.levelsAbove.hint')
          }
        >
          <NumberInput
            min={1}
            step={1}
            maxDecimals={0}
            value={zone.levels_above}
            onChange={(e) => update('levels_above', parseInt(e.target.value, 10) || 1)}
            disabled={zone.is_breakout && zone.order_type === 'SELL'}
            className="input-s w-20"
          />
        </InputField>
        <InputField label={t('zone.breakout.maxPositions')} hint={t('zone.breakout.maxPositions.hint')}>
          <NumberInput
            min={0}
            step={1}
            maxDecimals={0}
            value={zone.max_positions}
            onChange={(e) => update('max_positions', parseInt(e.target.value, 10) || 0)}
            className="input-s w-20"
          />
        </InputField>
      </div>
    </section>
  );
}
