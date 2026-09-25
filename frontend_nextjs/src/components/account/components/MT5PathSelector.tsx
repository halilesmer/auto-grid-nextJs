'use client';

import { RefreshCw } from 'lucide-react';
import { FieldLabel, InfoHint, Tooltip } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
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
  const t = useT();
  return (
    <div data-tooltip-scope>
      <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <FieldLabel label={t('account.path.label')} hint={t('account.path.label.hint')} />
        <Tooltip content={isScanning ? t('account.path.scanning.hint') : t('account.path.rescan.hint')}>
          <button
            type="button"
            disabled={isScanning}
            onClick={onRescan}
            className="inline-flex items-center text-primary hover:text-primary/80 disabled:opacity-50"
            aria-label={t('account.path.rescan')}
          >
            <RefreshCw size={12} className={isScanning ? 'animate-spin' : ''} />
          </button>
        </Tooltip>
      </div>
      <div className="flex items-center space-x-2 mb-2">
        <input
          type="checkbox"
          id="customPath"
          checked={useCustomPath}
          onChange={(e) => onUseCustomPathChange(e.target.checked)}
          className="size-3.5 rounded accent-primary"
        />
        <label htmlFor="customPath" className="cursor-pointer text-xs text-muted-foreground">
          {t('account.path.custom')}
        </label>
        <InfoHint hint={t('account.path.custom.hint')} />
      </div>

      {paths.length > 0 && !useCustomPath ? (
        <select
          value={selectedPath || ''}
          onChange={(e) => onPathSelect(e.target.value)}
          className="input-s"
          aria-label={t('account.path.select.aria')}
        >
          <option value="" disabled>
            {t('account.path.select.placeholder')}
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
          aria-label={t('account.path.custom.aria')}
        />
      )}
    </div>
  );
}