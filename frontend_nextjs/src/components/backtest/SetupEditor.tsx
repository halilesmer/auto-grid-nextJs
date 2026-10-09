'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { InputField } from '@/components/ui/InputField';
import { Modal } from '@/components/ui/modal';
import { ZoneFieldsEditor } from '@/components/zone/ZoneFieldsEditor';
import { useZoneFieldHandlers } from '@/hooks/useZoneFieldHandlers';
import { useT } from '@/i18n';
import type { SymbolDetail, ZoneSettings } from '@/store/types';
import { useBacktestStore, type BacktestSetup } from '@/store/useBacktestStore';

export function SetupEditor({ setup, symbolDetails, onClose }: {
  setup: BacktestSetup; symbolDetails: Record<string, SymbolDetail>; onClose: () => void;
}) {
  const t = useT();
  const [zone, setZone] = useState(() => structuredClone(setup.zone));
  const handlers = useZoneFieldHandlers(symbolDetails);
  const update = useCallback((_id: string, field: string, value: unknown) => {
    setZone((current) => current[field as keyof ZoneSettings] === value ? current : { ...current, [field]: value });
  }, []);
  const valid = Boolean(zone.symbol && symbolDetails[zone.symbol.toUpperCase()]);
  return <Modal open onClose={onClose} title={t('backtest.setups.edit')}
    className="max-h-[95dvh] max-w-4xl overflow-y-auto max-sm:h-dvh max-sm:max-h-dvh max-sm:rounded-none max-sm:p-3">
    <div data-testid="bt-setup-editor" className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('backtest.source.unsaved')}</p>
      <InputField label={t('zone.field.symbol')} hint={t('zone.addSymbol.symbol.hint')}>
        <select className="input-s" value={zone.symbol.toUpperCase()} onChange={(e) => update(zone.id, 'symbol', e.target.value)}>
          <option value="">—</option>
          {Object.entries(symbolDetails).map(([key, symbol]) => <option key={key} value={key}>{symbol.name}</option>)}
        </select>
      </InputField>
      <ZoneFieldsEditor zone={zone} onUpdate={update} symbolDetails={symbolDetails} {...handlers} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose} hint={t('common.cancel.hint')}>{t('common.cancel')}</Button>
        <Button disabled={!valid} hint={t('backtest.setups.apply.hint')} onClick={() => {
          useBacktestStore.getState().edit(setup.id, { zone, unsaved: true,
            ...(zone.symbol !== setup.zone.symbol ? { form: { ...setup.form, commission: null, csvImportId: null } } : {}) });
          onClose();
        }}>{t('backtest.setups.apply')}</Button>
      </div>
    </div>
  </Modal>;
}
