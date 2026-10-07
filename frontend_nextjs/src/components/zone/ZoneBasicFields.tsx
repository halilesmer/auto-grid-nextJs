'use client';

import type { ZoneBasicFieldsProps } from './types';
import { InputField } from '@/components/ui/InputField';
import { NumberInput } from '@/components/ui/NumberInput';
import { useT } from '@/i18n';

/** Emir tipi und Preisbereich eines Setups; das Symbol steht im Kopf der Symbolkarte (SymbolCard). */
export function ZoneBasicFields({
  zone,
  update,
  symbolConfig,
  handleChange,
  handleBlur,
}: ZoneBasicFieldsProps) {
  const t = useT();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <InputField label={t('zone.field.orderType')} hint={t('zone.field.orderType.hint')}>
        <select
          value={zone.order_type}
          onChange={(e) => update('order_type', e.target.value)}
          className="input-s"
        >
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
          <option value="BOTH">BOTH</option>
        </select>
      </InputField>
      <InputField label={t('zone.field.minPrice')} hint={t('zone.field.minPrice.hint')}>
        <NumberInput
          min={0}
          step={symbolConfig.step}
          maxDecimals={symbolConfig.precision}
          value={zone.min_price}
          onChange={(e) => handleChange('min_price', e.target.value, zone, symbolConfig, update)}
          onBlur={() => handleBlur('min_price', zone.min_price, symbolConfig.step, symbolConfig.precision, update)}
          className="input-s"
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
          className="input-s"
        />
      </InputField>
    </div>
  );
}
