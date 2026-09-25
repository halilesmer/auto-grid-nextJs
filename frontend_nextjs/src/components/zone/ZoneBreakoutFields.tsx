'use client';

import type { ZoneBreakoutFieldsProps } from './types';
import { InputField } from '@/components/ui/InputField';
import { NumberInput } from '@/components/ui/NumberInput';
import { SectionLabel } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useT } from '@/i18n';

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
  return (
    <section className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
      <SectionLabel>{t('zone.breakout.title')}</SectionLabel>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Switch
          checked={zone.is_breakout}
          onChange={(checked) => update('is_breakout', checked)}
          label={t('zone.breakout.trendOnly')}
        />
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {isBoth && !sync ? t('zone.breakout.buyPullback') : t('zone.breakout.minPullback')}
          </span>
          <NumberInput
            min={0}
            step={symbolConfig.step}
            value={zone.pullback_distance}
            onChange={(e) => handleChange('pullback_distance', e.target.value, zone, symbolConfig, update)}
            onBlur={() => handleBlur('pullback_distance', zone.pullback_distance, symbolConfig.step, symbolConfig.precision, update)}
            disabled={!zone.is_breakout}
            className="input-s w-28"
          />
        </div>
        {isBoth && !sync && (
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-xs text-muted-foreground">{t('zone.breakout.sellPullback')}</span>
            <NumberInput
              min={0}
              step={symbolConfig.step}
              value={zone.sell_pullback_distance}
              onChange={(e) => handleChange('sell_pullback_distance', e.target.value, zone, symbolConfig, update)}
              onBlur={() => handleBlur('sell_pullback_distance', zone.sell_pullback_distance, symbolConfig.step, symbolConfig.precision, update)}
              disabled={!zone.is_breakout}
              className="input-s w-28"
            />
          </div>
        )}
      </div>
      <div className="h-px bg-border" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InputField label={t('zone.breakout.levelsBelow')}>
          <NumberInput
            min={1}
            step={1}
            value={zone.levels_below}
            onChange={(e) => update('levels_below', parseInt(e.target.value, 10) || 1)}
            disabled={zone.is_breakout && zone.order_type === 'BUY'}
            className="input-s"
          />
        </InputField>
        <InputField label={t('zone.breakout.levelsAbove')}>
          <NumberInput
            min={1}
            step={1}
            value={zone.levels_above}
            onChange={(e) => update('levels_above', parseInt(e.target.value, 10) || 1)}
            disabled={zone.is_breakout && zone.order_type === 'SELL'}
            className="input-s"
          />
        </InputField>
        <InputField label={t('zone.breakout.maxPositions')}>
          <NumberInput
            min={0}
            step={1}
            value={zone.max_positions}
            onChange={(e) => update('max_positions', parseInt(e.target.value, 10) || 0)}
            className="input-s"
          />
        </InputField>
      </div>
    </section>
  );
}
