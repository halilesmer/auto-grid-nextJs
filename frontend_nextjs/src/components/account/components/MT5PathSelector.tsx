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
      <label className="mb-1.5 flex items-center text-xs font-medium text-muted-foreground">
        MT5 Path *
        <button
          type="button"
          disabled={isScanning}
          onClick={onRescan}
          className="ml-2 inline-flex items-center text-primary hover:text-primary/80 disabled:opacity-50"
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
          className="size-3.5 rounded accent-primary"
        />
        <label htmlFor="customPath" className="cursor-pointer text-xs text-muted-foreground">
          Manuel Gir (Custom Path)
        </label>
      </div>

      {paths.length > 0 && !useCustomPath ? (
        <select
          value={selectedPath || ''}
          onChange={(e) => onPathSelect(e.target.value)}
          className="input-s"
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
          className="input-s"
          aria-label="Custom MT5 Path"
        />
      )}
    </div>
  );
}