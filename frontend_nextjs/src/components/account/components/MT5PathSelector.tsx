'use client';

import { RefreshCw } from 'lucide-react';
import type { MT5PathSelectorProps } from '../types';

export function MT5PathSelector({
  paths,
  selectedPath,
  isScanning,
  useCustomPath,
  onPathSelect,
  onUseCustomPathChange,
  onRescan,
  onCustomPathChange,
}: MT5PathSelectorProps) {
  return (
    <div>
      <label className="text-sm text-gray-400 mb-1 flex items-center">
        MT5 Path *
        <button
          type="button"
          disabled={isScanning}
          onClick={onRescan}
          className="ml-2 text-blue-400 hover:text-blue-300 inline-flex items-center disabled:opacity-50"
          title="Rescan MT5 paths"
          aria-label="Rescan MT5 paths"
        >
          <RefreshCw size={12} className={isScanning ? 'animate-spin' : ''} />
        </button>
      </label>
      <div className="flex items-center space-x-2 mb-2">
        <input
          type="checkbox"
          id="customPath"
          checked={useCustomPath}
          onChange={(e) => onUseCustomPathChange(e.target.checked)}
          className="w-4 h-4 text-blue-600 bg-black/40 border-white/20 rounded focus:ring-blue-500"
        />
        <label htmlFor="customPath" className="text-xs text-gray-400 cursor-pointer">
          Manuel Gir (Custom Path)
        </label>
      </div>

      {paths.length > 0 && !useCustomPath ? (
        <select
          value={selectedPath || ''}
          onChange={(e) => onPathSelect(e.target.value)}
          className="w-full bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
          aria-label="Select MT5 Path"
        >
          <option value="" disabled>
            -- MT5 Yolunu Seçin --
          </option>
          {paths.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={selectedPath}
          onChange={(e) => onCustomPathChange(e.target.value)}
          placeholder="C:/Program Files/MetaTrader 5/terminal64.exe"
          className="w-full bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
          aria-label="Custom MT5 Path"
        />
      )}
    </div>
  );
}