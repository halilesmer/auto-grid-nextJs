'use client';

import type { ZoneBreakoutFieldsProps } from './types';
import { InputField } from '@/components/ui/InputField';

export function ZoneBreakoutFields({
  zone,
  update,
  symbolConfig,
  isBoth,
  sync,
  handleChange,
  handleBlur,
}: ZoneBreakoutFieldsProps) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3">
      <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
        Kırılım ve Pullback Seviyeleri
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={zone.is_breakout}
            onChange={(e) => update('is_breakout', e.target.checked)}
            className="w-4 h-4 rounded accent-blue-500"
          />
          <span>Sadece trend yönünde</span>
        </label>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-400 whitespace-nowrap">
            {isBoth && !sync ? 'BUY Pullback ($)' : 'Min Pullback ($)'}
          </span>
          <input
            type="number"
            min={0}
            step={symbolConfig.step}
            value={zone.pullback_distance}
            onChange={(e) => handleChange('pullback_distance', e.target.value, zone, symbolConfig, update)}
            onBlur={() => handleBlur('pullback_distance', zone.pullback_distance, symbolConfig.step, symbolConfig.precision, update)}
            disabled={!zone.is_breakout}
            className="input-s w-24"
          />
        </div>
        {isBoth && !sync && (
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-400 whitespace-nowrap">SELL Pullback ($)</span>
            <input
              type="number"
              min={0}
              step={symbolConfig.step}
              value={zone.sell_pullback_distance}
              onChange={(e) => handleChange('sell_pullback_distance', e.target.value, zone, symbolConfig, update)}
              onBlur={() => handleBlur('sell_pullback_distance', zone.sell_pullback_distance, symbolConfig.step, symbolConfig.precision, update)}
              disabled={!zone.is_breakout}
              className="input-s w-24"
            />
          </div>
        )}
      </div>
      <hr className="border-white/5" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InputField label="Alt Seviyeler">
          <input
            type="number"
            min={1}
            step={1}
            value={zone.levels_below}
            onChange={(e) => update('levels_below', parseInt(e.target.value, 10) || 1)}
            disabled={zone.is_breakout && zone.order_type === 'BUY'}
            className="input-s"
          />
        </InputField>
        <InputField label="Üst Seviyeler">
          <input
            type="number"
            min={1}
            step={1}
            value={zone.levels_above}
            onChange={(e) => update('levels_above', parseInt(e.target.value, 10) || 1)}
            disabled={zone.is_breakout && zone.order_type === 'SELL'}
            className="input-s"
          />
        </InputField>
        <InputField label="Maks Pozisyon">
          <input
            type="number"
            min={0}
            step={1}
            value={zone.max_positions}
            onChange={(e) => update('max_positions', parseInt(e.target.value, 10) || 0)}
            className="input-s"
          />
        </InputField>
      </div>
    </div>
  );
}
