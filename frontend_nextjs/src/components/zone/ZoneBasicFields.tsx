'use client';

import { AlertTriangle } from 'lucide-react';
import SymbolAutoComplete from '@/components/SymbolAutoComplete';
import type { ZoneBasicFieldsProps } from './types';
import { InputField } from '@/components/ui/InputField';
import { NumberInput } from '@/components/ui/NumberInput';
import { useFormat, useT } from '@/i18n';
import { useSettingsStore } from '@/store';

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
  // Worker sembolleri MT5'ten alamadı: autocomplete'in neden boş kaldığını göster
  const symbolsError = useSettingsStore((s) => s.symbolsError);
  const symbolFieldError = hasError ? (
    <span className="text-[11px] font-semibold text-danger">{t('zone.field.symbolInvalid')}</span>
  ) : symbolsError ? (
    <span data-testid="symbols-error" role="status" className="flex items-start gap-1 text-[11px] text-muted-foreground break-words min-w-0">
      <AlertTriangle size={12} aria-hidden className="mt-px shrink-0 text-warning" />
      <span className="min-w-0">{t('zone.field.symbolsUnavailable', { message: symbolsError })}</span>
    </span>
  ) : null;

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
      <InputField label={symbolLabel} hint={t('zone.field.symbol.hint')} error={symbolFieldError}>
        <SymbolAutoComplete
          value={zone.symbol}
          onChange={handleSymbolChange}
          symbolDetails={symbolDetails}
          hasError={hasError}
        />
      </InputField>
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
