'use client';

import type { ZoneBasicFieldsProps } from './types';
import { InputField } from '@/components/ui/InputField';
import { NumberInput } from '@/components/ui/NumberInput';
import { useT } from '@/i18n';
import { FieldSwitch } from './FieldSwitch';

/**
 * Emir tipi (bei BOTH daneben „BUY/SELL gleich“), Preisbereich und Einstiegsmodus eines Setups;
 * das Symbol steht im Kopf der Symbolkarte (SymbolCard).
 */
export function ZoneBasicFields({
  zone,
  update,
  symbolConfig,
  handleChange,
  handleBlur,
}: ZoneBasicFieldsProps) {
  const t = useT();
  const isFractal = zone.entry_mode === 'fractal';

  return (
    <div className="flex flex-wrap items-start gap-3">
      <InputField label={t('zone.field.orderType')} hint={t('zone.field.orderType.hint')}>
        <select
          value={zone.order_type}
          onChange={(e) => update('order_type', e.target.value)}
          className="input-s w-auto"
        >
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
          <option value="BOTH">BOTH</option>
        </select>
      </InputField>
      {zone.order_type === 'BOTH' && (
        <FieldSwitch
          id={`sync-${zone.id}`}
          checked={zone.sync_buy_sell}
          onChange={(checked) => update('sync_buy_sell', checked)}
          label={<span className="text-xs text-muted-foreground">{t('zone.sync')}</span>}
          hint={t('zone.sync.hint')}
        />
      )}
      <InputField label={t('zone.field.minPrice')} hint={t('zone.field.minPrice.hint')}>
        <NumberInput
          min={0}
          step={symbolConfig.step}
          maxDecimals={symbolConfig.precision}
          value={zone.min_price}
          onChange={(e) => handleChange('min_price', e.target.value, zone, symbolConfig, update)}
          onBlur={() => handleBlur('min_price', zone.min_price, symbolConfig.step, symbolConfig.precision, update)}
          className="input-s w-32"
        />
      </InputField>
      <InputField label={t('zone.field.maxPrice')} hint={t('zone.field.maxPrice.hint')}>
        <NumberInput
          min={0}
          step={symbolConfig.step}
          maxDecimals={symbolConfig.precision}
          value={zone.max_price}
          onChange={(e) => handleChange('max_price', e.target.value, zone, symbolConfig, update)}
          onBlur={() => handleBlur('max_price', zone.max_price, symbolConfig.step, symbolConfig.precision, update)}
          className="input-s w-32"
        />
      </InputField>
      <InputField label={t('zone.entryMode')} hint={t('zone.entryMode.hint')}>
        <select
          data-testid="entry-mode"
          value={isFractal ? 'fractal' : 'grid'}
          onChange={(e) => update('entry_mode', e.target.value)}
          className="input-s w-auto"
        >
          <option value="grid">{t('zone.entryMode.grid')}</option>
          <option value="fractal">{t('zone.entryMode.fractal')}</option>
        </select>
      </InputField>
    </div>
  );
}
