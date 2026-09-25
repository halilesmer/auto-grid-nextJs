'use client';

import type { ZoneBreakoutFieldsProps } from './types';
import { InputField } from '@/components/ui/InputField';
import { NumberInput } from '@/components/ui/NumberInput';
import { SectionLabel } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { InfoHint } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { entryOf } from '@/utils/zoneHelpers';

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
  const noGrid = entryOf(zone).entry_mode === 'SIGNAL_MARKET';
  return (
    <section className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
      <SectionLabel>{t('zone.breakout.title')}</SectionLabel>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Switch
          checked={zone.is_breakout}
          onChange={(checked) => update('is_breakout', checked)}
          label={t('zone.breakout.trendOnly')}
          hint={noGrid ? t('zone.breakout.market.hint') : t('zone.breakout.trendOnly.hint')}
          disabled={noGrid}
        />
        <div data-tooltip-scope className="flex items-center gap-2">
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {isBoth && !sync ? t('zone.breakout.buyPullback') : t('zone.breakout.minPullback')}
          </span>
          <InfoHint
            hint={
              !zone.is_breakout
                ? t('zone.breakout.pullback.off.hint')
                : isBoth && !sync
                  ? t('zone.breakout.buyPullback.hint')
                  : t('zone.breakout.minPullback.hint')
            }
          />
          <NumberInput
            min={0}
            step={symbolConfig.step}
            maxDecimals={symbolConfig.precision}
            value={zone.pullback_distance}
            onChange={(e) => handleChange('pullback_distance', e.target.value, zone, symbolConfig, update)}
            onBlur={() => handleBlur('pullback_distance', zone.pullback_distance, symbolConfig.step, symbolConfig.precision, update)}
            disabled={noGrid || !zone.is_breakout}
            className="input-s w-28"
          />
        </div>
        {isBoth && !sync && (
          <div data-tooltip-scope className="flex items-center gap-2">
            <span className="whitespace-nowrap text-xs text-muted-foreground">{t('zone.breakout.sellPullback')}</span>
            <InfoHint hint={zone.is_breakout ? t('zone.breakout.sellPullback.hint') : t('zone.breakout.pullback.off.hint')} />
            <NumberInput
              min={0}
              step={symbolConfig.step}
              maxDecimals={symbolConfig.precision}
              value={zone.sell_pullback_distance}
              onChange={(e) => handleChange('sell_pullback_distance', e.target.value, zone, symbolConfig, update)}
              onBlur={() => handleBlur('sell_pullback_distance', zone.sell_pullback_distance, symbolConfig.step, symbolConfig.precision, update)}
              disabled={noGrid || !zone.is_breakout}
              className="input-s w-28"
            />
          </div>
        )}
      </div>
      <div className="h-px bg-border" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InputField
          label={t('zone.breakout.levelsBelow')}
          hint={
            noGrid
              ? t('zone.breakout.market.hint')
              : zone.is_breakout && zone.order_type === 'BUY'
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
            disabled={noGrid || (zone.is_breakout && zone.order_type === 'BUY')}
            className="input-s"
          />
        </InputField>
        <InputField
          label={t('zone.breakout.levelsAbove')}
          hint={
            noGrid
              ? t('zone.breakout.market.hint')
              : zone.is_breakout && zone.order_type === 'SELL'
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
            disabled={noGrid || (zone.is_breakout && zone.order_type === 'SELL')}
            className="input-s"
          />
        </InputField>
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
    </section>
  );
}
