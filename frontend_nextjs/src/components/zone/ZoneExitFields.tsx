'use client';

import type { ZoneExitFieldsProps } from './types';
import { InputField } from '@/components/ui/InputField';
import { Switch } from '@/components/ui/switch';
import { useT } from '@/i18n';

export function ZoneExitFields({
  zone,
  update,
}: ZoneExitFieldsProps) {
  const t = useT();
  return (
    <section className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
      <Switch
        checked={zone.clear_on_exit}
        onChange={(checked) => update('clear_on_exit', checked)}
        label={t('zone.exit.clearOnExit')}
        description={t('zone.exit.clearOnExit.hint')}
      />
      {zone.clear_on_exit && (
        <>
          <div className="h-px bg-border" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <InputField label={t('zone.exit.side')}>
              <select
                value={zone.clear_exit_side}
                onChange={(e) => update('clear_exit_side', e.target.value)}
                className="input-s"
              >
                <option value="Farketmez">{t('zone.exit.side.any')}</option>
                <option value="BUY (Yukarı)">{t('zone.exit.side.up')}</option>
                <option value="SELL (Aşağı)">{t('zone.exit.side.down')}</option>
              </select>
            </InputField>
            <InputField label={t('zone.exit.target')}>
              <select
                value={zone.clear_target_side}
                onChange={(e) => update('clear_target_side', e.target.value)}
                className="input-s"
              >
                <option value="Farketmez (Hepsi)">{t('zone.exit.target.all')}</option>
                <option value="Sadece BUY İşlemleri">{t('zone.exit.target.buy')}</option>
                <option value="Sadece SELL İşlemleri">{t('zone.exit.target.sell')}</option>
              </select>
            </InputField>
            <InputField label={t('zone.exit.scope')}>
              <select
                value={zone.clear_scope}
                onChange={(e) => update('clear_scope', e.target.value)}
                className="input-s"
              >
                <option value="Sadece Bekleyen Emirler">{t('zone.exit.scope.pending')}</option>
                <option value="Tüm İşlemler">{t('zone.exit.scope.all')}</option>
              </select>
            </InputField>
            <InputField label={t('zone.exit.trigger')}>
              <select
                value={zone.exit_condition}
                onChange={(e) => update('exit_condition', e.target.value)}
                className="input-s"
              >
                <option value="Anlık Fiyat">{t('zone.exit.trigger.price')}</option>
                <option value="Mum Kapanışı">{t('zone.exit.trigger.candle')}</option>
              </select>
            </InputField>
          </div>
          {zone.exit_condition === 'Mum Kapanışı' && (
            <div className="w-48">
              <InputField label={t('zone.exit.timeframe')}>
                <select
                  value={zone.exit_timeframe}
                  onChange={(e) => update('exit_timeframe', e.target.value)}
                  className="input-s"
                >
                  {['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'].map((tf) => (
                    <option key={tf} value={tf}>{tf}</option>
                  ))}
                </select>
              </InputField>
            </div>
          )}
        </>
      )}
    </section>
  );
}
