'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ZoneFractalFieldsProps } from './types';
import type { FractalSetup } from '@/store/types';
import ConfirmModal from '@/components/ConfirmModal';
import { Button } from '@/components/ui/button';
import { InputField } from '@/components/ui/InputField';
import { NumberInput } from '@/components/ui/NumberInput';
import { Switch } from '@/components/ui/switch';
import { useT } from '@/i18n';
import { MAX_EXTRA_FRACTAL_SETUPS, newFractalSetup } from '@/utils/zoneHelpers';
import { ZoneFractalSetupFields } from './ZoneFractalSetupFields';

// Faktoren (ATR, SAR) sind keine Preise: eigene Schrittweite statt Symbol-Digits
const FACTOR = { step: 0.1, precision: 2 };
const SAR = { step: 0.01, precision: 3 };

export function ZoneFractalFields({
  zone,
  update,
  symbolConfig,
  isBoth,
  sync,
  handleChange,
  handleBlur,
}: ZoneFractalFieldsProps) {
  const t = useT();
  const split = isBoth && !sync;
  const useSl = zone.fractal_use_sl ?? true;
  const slMode = zone.fractal_sl_mode ?? 'atr';
  // Chance/Risiko-TP braucht einen SL: ohne SL nur TP als Betrag
  const tpByMoney = !useSl || !!zone.fractal_tp_by_money;
  const setups = zone.fractal_setups ?? [];
  const multi = setups.length > 0;
  const canAdd = setups.length < MAX_EXTRA_FRACTAL_SETUPS;

  const addSetup = () => update('fractal_setups', [...setups, newFractalSetup(zone)]);
  // Gespeichertes Setup (mit Nummer): erst fragen, ob seine Pending Orders gelöscht werden sollen
  const [confirmIndex, setConfirmIndex] = useState<number | null>(null);
  const confirmSid = confirmIndex !== null ? setups[confirmIndex]?.sid : undefined;
  const removeSetup = (index: number, keepOrders = false) => {
    const sid = setups[index]?.sid;
    update('fractal_setups', setups.filter((_, i) => i !== index));
    const kept = zone.fractal_kept_sids ?? [];
    if (sid === undefined) return;
    if (keepOrders && !kept.includes(sid)) update('fractal_kept_sids', [...kept, sid]);
    if (!keepOrders && kept.includes(sid)) update('fractal_kept_sids', kept.filter((k) => k !== sid));
  };
  const askRemove = (index: number) => (setups[index]?.sid === undefined ? removeSetup(index) : setConfirmIndex(index));
  // Schreibt ein Feld eines Zusatz-Setups; die Zone hält die ganze Liste
  const setupUpdate = (index: number) => (field: string, value: unknown) =>
    update(
      'fractal_setups',
      setups.map((s, i) => (i === index ? ({ ...s, [field]: value } as FractalSetup) : s))
    );

  const factorField = (field: 'fractal_atr_multiplier' | 'fractal_sar_step' | 'fractal_sar_max', cfg: typeof FACTOR, fallback: number) => (
    <NumberInput
      min={0}
      step={cfg.step}
      maxDecimals={cfg.precision}
      value={zone[field] ?? fallback}
      onChange={(e) => handleChange(field, e.target.value, zone, { ...symbolConfig, precision: cfg.precision }, update)}
      className="input-s"
    />
  );

  const setupProps = { zone, symbolConfig, split, tpByMoney, handleChange, handleBlur };

  return (
    <div data-testid="fractal-fields" className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <InputField label={t('zone.fractal.orderMode')} hint={t('zone.fractal.orderMode.hint')}>
          <select
            data-testid="fractal-order-mode"
            value={zone.fractal_order_mode ?? 'breakout'}
            onChange={(e) => update('fractal_order_mode', e.target.value)}
            className="input-s"
          >
            <option value="breakout">{t('zone.fractal.orderMode.breakout')}</option>
            <option value="rebound">{t('zone.fractal.orderMode.rebound')}</option>
          </select>
        </InputField>
        <div className="flex min-w-0 flex-col justify-end pb-2">
          <Switch
            id={`fractal-use-sl-${zone.id}`}
            checked={useSl}
            onChange={(checked) => update('fractal_use_sl', checked)}
            label={<span className="text-sm">{t('zone.fractal.useSl')}</span>}
            hint={t('zone.fractal.useSl.hint')}
          />
        </div>
        <div className="flex min-w-0 flex-col justify-end pb-2">
          <Switch
            id={`fractal-tp-by-money-${zone.id}`}
            checked={tpByMoney}
            disabled={!useSl}
            onChange={(checked) => update('fractal_tp_by_money', checked)}
            label={<span className="text-sm">{t('zone.fractal.tpByMoney')}</span>}
            hint={t('zone.fractal.tpByMoney.hint')}
          />
        </div>
      </div>

      {useSl && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <InputField label={t('zone.fractal.slMode')} hint={t('zone.fractal.slMode.hint')}>
            <select
              data-testid="fractal-sl-mode"
              value={slMode}
              onChange={(e) => update('fractal_sl_mode', e.target.value)}
              className="input-s"
            >
              <option value="atr">{t('zone.fractal.slMode.atr')}</option>
              <option value="sar">{t('zone.fractal.slMode.sar')}</option>
              <option value="opposite_fractal">{t('zone.fractal.slMode.opposite')}</option>
              <option value="buffer">{t('zone.fractal.slMode.buffer')}</option>
            </select>
          </InputField>
          {slMode === 'atr' && (
            <>
              <InputField label={t('zone.fractal.atrPeriod')} hint={t('zone.fractal.atrPeriod.hint')}>
                <NumberInput
                  min={1}
                  step={1}
                  maxDecimals={0}
                  value={zone.fractal_atr_period ?? 14}
                  onChange={(e) => update('fractal_atr_period', parseInt(e.target.value, 10) || 1)}
                  className="input-s"
                />
              </InputField>
              <InputField label={t('zone.fractal.atrMultiplier')} hint={t('zone.fractal.atrMultiplier.hint')}>
                {factorField('fractal_atr_multiplier', FACTOR, 1.5)}
              </InputField>
            </>
          )}
          {slMode === 'sar' && (
            <>
              <InputField label={t('zone.fractal.sarStep')} hint={t('zone.fractal.sarStep.hint')}>
                {factorField('fractal_sar_step', SAR, 0.02)}
              </InputField>
              <InputField label={t('zone.fractal.sarMax')} hint={t('zone.fractal.sarMax.hint')}>
                {factorField('fractal_sar_max', SAR, 0.2)}
              </InputField>
            </>
          )}
          {/* Auch bei ATR/SAR sichtbar: Rückfall-SL, wenn der Indikator nicht berechenbar ist */}
          <InputField label={t('zone.fractal.slBuffer')} hint={t('zone.fractal.slBuffer.hint')}>
            <NumberInput
              min={0}
              step={symbolConfig.step}
              maxDecimals={symbolConfig.precision}
              value={zone.fractal_sl_buffer ?? 0.05}
              onChange={(e) => handleChange('fractal_sl_buffer', e.target.value, zone, symbolConfig, update)}
              onBlur={() =>
                handleBlur('fractal_sl_buffer', zone.fractal_sl_buffer, symbolConfig.step, symbolConfig.precision, update)
              }
              className="input-s"
            />
          </InputField>
        </div>
      )}

      {/* Setup 1 = Zonenfelder; die Überschrift erscheint erst, wenn es weitere Setups gibt */}
      <div data-testid="fractal-setup" className={multi ? 'space-y-3 rounded-lg border border-border p-3' : undefined}>
        {multi && <p className="text-xs font-medium text-muted-foreground">{t('zone.fractal.setup', { n: 1 })}</p>}
        <ZoneFractalSetupFields {...setupProps} values={zone} update={update} />
      </div>

      {setups.map((setup, index) => (
        <div
          key={setup.id ?? setup.sid ?? `new-${index}`}
          data-testid="fractal-setup"
          className="space-y-3 rounded-lg border border-border p-3"
        >
          <div className="flex min-w-0 items-center justify-between gap-2">
            <p className="min-w-0 truncate text-xs font-medium text-muted-foreground">
              {setup.sid ? t('zone.fractal.setup', { n: setup.sid }) : t('zone.fractal.setup.new')}
            </p>
            <Button
              data-testid="fractal-setup-remove"
              variant="ghost"
              size="icon-sm"
              aria-label={t('zone.fractal.setup.remove')}
              hint={t('zone.fractal.setup.remove.hint')}
              onClick={() => askRemove(index)}
            >
              <Trash2 size={14} />
            </Button>
          </div>
          <ZoneFractalSetupFields {...setupProps} values={setup} update={setupUpdate(index)} />
        </div>
      ))}

      <Button
        data-testid="fractal-setup-add"
        variant="outline"
        size="sm"
        disabled={!canAdd}
        hint={canAdd ? t('zone.fractal.setup.add.hint') : t('zone.fractal.setup.addLimit.hint')}
        onClick={addSetup}
      >
        <Plus size={14} />
        {t('zone.fractal.setup.add')}
      </Button>

      <ConfirmModal
        open={confirmIndex !== null}
        onClose={() => setConfirmIndex(null)}
        onConfirm={() => {
          if (confirmIndex !== null) removeSetup(confirmIndex);
        }}
        title={t('zone.fractal.setup.removeConfirm.title', { n: confirmSid ?? '' })}
        message={t('zone.fractal.setup.removeConfirm.message')}
        infoText={t('zone.fractal.setup.removeConfirm.info')}
        confirmLabel={t('zone.fractal.setup.removeConfirm.delete')}
        confirmHint={t('zone.fractal.setup.removeConfirm.delete.hint')}
        secondary={{
          label: t('zone.fractal.setup.removeConfirm.keep'),
          hint: t('zone.fractal.setup.removeConfirm.keep.hint'),
          onClick: () => {
            if (confirmIndex !== null) removeSetup(confirmIndex, true);
          },
        }}
        variant="danger"
      />
    </div>
  );
}
