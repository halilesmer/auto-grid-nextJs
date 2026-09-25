'use client';

import SymbolAutoComplete from '@/components/SymbolAutoComplete';
import type { ZoneBasicFieldsProps } from './types';
import { InputField } from '@/components/ui/InputField';
import { NumberInput } from '@/components/ui/NumberInput';
import { useFormat, useT } from '@/i18n';

export function ZoneBasicFields({
  zone,
  update,
  symbolConfig,
  symbolDetails,
  handleChange,
  handleBlur,
  validateSymbol,
}: ZoneBasicFieldsProps) {
  const t = useT();
  const fmt = useFormat();
  const hasError = Object.keys(symbolDetails).length > 0 && Boolean(zone.symbol) && !validateSymbol(zone.symbol);

  // Sembolün ondalık basamakları desen olarak, ör. digits=2 → "0,00" (tr/de) veya "0.00" (en)
  const digits = symbolDetails[zone.symbol?.toUpperCase()]?.digits;
  const symbolLabel =
    digits === undefined
      ? t('zone.field.symbol')
      : t('zone.field.symbolDigits', {
          pattern: fmt.number(0, { minimumFractionDigits: digits, maximumFractionDigits: digits }),
        });

  const handleSymbolChange = (val: string) => {
    handleChange('symbol', val, zone, symbolConfig, update);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <InputField label={symbolLabel} error={hasError && <span className="text-[11px] font-semibold text-danger">{t('zone.field.symbolInvalid')}</span>}>
        <SymbolAutoComplete
          value={zone.symbol}
          onChange={handleSymbolChange}
          symbolDetails={symbolDetails}
          hasError={hasError}
        />
      </InputField>
      <InputField label={t('zone.field.orderType')}>
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
      <InputField label={t('zone.field.minPrice')}>
        <NumberInput
          min={0}
          step={symbolConfig.step}
          value={zone.min_price}
          onChange={(e) => handleChange('min_price', e.target.value, zone, symbolConfig, update)}
          onBlur={() => handleBlur('min_price', zone.min_price, symbolConfig.step, symbolConfig.precision, update)}
          className="input-s"
        />
      </InputField>
      <InputField label={t('zone.field.maxPrice')}>
        <NumberInput
          min={0}
          step={symbolConfig.step}
          value={zone.max_price}
          onChange={(e) => handleChange('max_price', e.target.value, zone, symbolConfig, update)}
          onBlur={() => handleBlur('max_price', zone.max_price, symbolConfig.step, symbolConfig.precision, update)}
          className="input-s"
        />
      </InputField>
    </div>
  );
}
