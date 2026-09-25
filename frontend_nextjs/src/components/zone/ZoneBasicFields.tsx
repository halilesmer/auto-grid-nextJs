'use client';

import SymbolAutoComplete from '@/components/SymbolAutoComplete';
import type { ZoneBasicFieldsProps } from './types';
import { InputField } from '@/components/ui/InputField';
import { NumberInput } from '@/components/ui/NumberInput';

export function ZoneBasicFields({
  zone,
  update,
  symbolConfig,
  symbolDetails,
  handleChange,
  handleBlur,
  validateSymbol,
}: ZoneBasicFieldsProps) {
  const hasError = Object.keys(symbolDetails).length > 0 && Boolean(zone.symbol) && !validateSymbol(zone.symbol);

  // Dezimalstellen des Symbols als Muster, z. B. digits=2 → "0,00"
  const digits = symbolDetails[zone.symbol?.toUpperCase()]?.digits;
  const symbolLabel = digits === undefined ? 'Sembol' : `Sembol (${digits > 0 ? `0,${'0'.repeat(digits)}` : '0'})`;

  const handleSymbolChange = (val: string) => {
    handleChange('symbol', val, zone, symbolConfig, update);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <InputField label={symbolLabel} error={hasError && <span className="text-[11px] font-semibold text-danger">Geçersiz Sembol!</span>}>
        <SymbolAutoComplete
          value={zone.symbol}
          onChange={handleSymbolChange}
          symbolDetails={symbolDetails}
          hasError={hasError}
        />
      </InputField>
      <InputField label="Emir Tipi">
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
      <InputField label="Min Fiyat ($)">
        <NumberInput
          min={0}
          step={symbolConfig.step}
          value={zone.min_price}
          onChange={(e) => handleChange('min_price', e.target.value, zone, symbolConfig, update)}
          onBlur={() => handleBlur('min_price', zone.min_price, symbolConfig.step, symbolConfig.precision, update)}
          className="input-s"
        />
      </InputField>
      <InputField label="Max Fiyat ($)">
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
