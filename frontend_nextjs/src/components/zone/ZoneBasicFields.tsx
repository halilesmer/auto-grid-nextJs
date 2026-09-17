'use client';

import SymbolAutoComplete from '@/components/SymbolAutoComplete';
import type { ZoneBasicFieldsProps } from './types';
import { InputField } from '@/components/ui/InputField';

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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <InputField label="Sembol" error={hasError && <span className="text-[11px] text-red-400 font-bold mt-1">Geçersiz Sembol!</span>}>
        <SymbolAutoComplete
          value={zone.symbol}
          onChange={(val) => handleChange('symbol', val, zone, symbolConfig, update)}
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
        <input
          type="number"
          min={0}
          step={symbolConfig.step}
          value={zone.min_price}
          onChange={(e) => handleChange('min_price', e.target.value, zone, symbolConfig, update)}
          onBlur={() => handleBlur('min_price', zone.min_price, symbolConfig.step, symbolConfig.precision, update)}
          className="input-s"
        />
      </InputField>
      <InputField label="Max Fiyat ($)">
        <input
          type="number"
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
