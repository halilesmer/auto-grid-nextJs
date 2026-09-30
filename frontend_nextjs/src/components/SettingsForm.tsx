'use client';

import { Minus, Plus, Save } from 'lucide-react';
import { useCallback, useState } from 'react';

import { axiosInstance } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError';
import { useAccountStore, useSettingsStore } from '@/store';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/NumberInput';
import { toast } from '@/components/ui/animated-toast';
import { FieldLabel, Tooltip } from '@/components/ui/tooltip';
import { useFormat, useT } from '@/i18n';

const MIN_INTERVAL = 1;
const MAX_INTERVAL = 60;
const STEP_INTERVAL = 0.1;

export default function SettingsForm() {
  const t = useT();
  const fmt = useFormat();
  const selectedAccount = useAccountStore((s) => s.selectedAccount);
  const setGlobalSettings = useSettingsStore((s) => s.setGlobalSettings);
  // Sadece ilgili alanı dinle: tüm settings nesnesine bağlanmak, setGlobalSettings
  // ile birlikte sonsuz döngüye ve +/- değerinin geri sıfırlanmasına yol açıyordu.
  // undefined = ayarlar henüz yüklenmedi; yüklendiyse alan yoksa varsayılan 1.0
  const storedInterval = useSettingsStore((s) =>
    s.settings ? (s.settings.LOOP_INTERVAL_SECONDS ?? 1.0) : undefined,
  );

  const [loopInterval, setLoopInterval] = useState<number>(() => storedInterval ?? 1.0);
  const [originalInterval, setOriginalInterval] = useState<number>(() => storedInterval ?? 1.0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Hesap veya kayıtlı değer değişince yerel alanı eşitle (render sırasında, efekt yok).
  // Ayarlar henüz yüklenmediyse (undefined) store'a sahte değer yazılmaz.
  const [syncedFrom, setSyncedFrom] = useState({ account: selectedAccount, value: storedInterval });
  if (syncedFrom.account !== selectedAccount || syncedFrom.value !== storedInterval) {
    setSyncedFrom({ account: selectedAccount, value: storedInterval });
    const next = selectedAccount ? storedInterval : 1.0;
    if (next !== undefined) {
      setLoopInterval(next);
      setOriginalInterval(next);
    }
  }

  const clampInterval = useCallback((value: number) => {
    const stepped = Math.round(value * 10) / 10;
    return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, stepped));
  }, []);

  const increment = useCallback(() => {
    setLoopInterval((prev) => clampInterval(prev + STEP_INTERVAL));
  }, [clampInterval]);

  const decrement = useCallback(() => {
    setLoopInterval((prev) => clampInterval(prev - STEP_INTERVAL));
  }, [clampInterval]);

  const handleSave = useCallback(async () => {
    if (!selectedAccount) return;
    setSaving(true);
    setError('');
    try {
      await axiosInstance.post(`/settings/${selectedAccount}`, {
        settings: { LOOP_INTERVAL_SECONDS: loopInterval },
      });
      setOriginalInterval(loopInterval);
      setGlobalSettings({ LOOP_INTERVAL_SECONDS: loopInterval });
      toast.success(
        t('settings.saved.text', {
          value: fmt.number(loopInterval, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
        }),
        { title: t('settings.saved.title') },
      );
    } catch (err: unknown) {
      const message = await getApiErrorMessage(err, t('settings.saveFailed'));
      setError(message);
      toast.error(message, { title: t('settings.saveFailed.title') });
    } finally {
      setSaving(false);
    }
  }, [selectedAccount, loopInterval, setGlobalSettings, t, fmt]);

  const hasChanges = loopInterval !== originalInterval;

  if (!selectedAccount) return null;

  return (
    <div
      data-testid="general-settings"
      data-tooltip-scope
      className="order-3 flex min-w-0 flex-wrap items-center gap-2 xl:border-l xl:border-border xl:pl-4"
    >
      <FieldLabel
        label={t('settings.interval')}
        hint={t('settings.interval.hint')}
        className="text-xs font-medium text-muted-foreground"
      />
      <div className="flex h-9 w-32 items-stretch overflow-hidden rounded-md border border-input bg-background/60 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20">
        <Tooltip
          content={loopInterval <= MIN_INTERVAL ? t('settings.decrease.min.hint') : t('settings.decrease.hint')}
          className="w-8 shrink-0"
        >
          <button
            onClick={decrement}
            disabled={loopInterval <= MIN_INTERVAL}
            className="flex h-full w-full items-center justify-center text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={t('settings.decrease')}
          >
            <Minus size={14} />
          </button>
        </Tooltip>
        <div className="flex min-w-0 flex-1 items-center gap-1 border-x border-input px-1.5">
          <NumberInput
            aria-label={t('settings.interval')}
            step={STEP_INTERVAL}
            min={MIN_INTERVAL}
            max={MAX_INTERVAL}
            value={loopInterval}
            onChange={(e) => {
              const parsed = parseFloat(e.target.value);
              setLoopInterval(clampInterval(Number.isNaN(parsed) ? MIN_INTERVAL : parsed));
            }}
            className="w-full min-w-0 bg-transparent text-right font-mono text-sm font-semibold tabular-nums text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="pointer-events-none shrink-0 text-xs text-muted-foreground">{t('settings.unit.sec')}</span>
        </div>
        <Tooltip
          content={loopInterval >= MAX_INTERVAL ? t('settings.increase.max.hint') : t('settings.increase.hint')}
          className="w-8 shrink-0"
        >
          <button
            onClick={increment}
            disabled={loopInterval >= MAX_INTERVAL}
            className="flex h-full w-full items-center justify-center text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={t('settings.increase')}
          >
            <Plus size={14} />
          </button>
        </Tooltip>
      </div>
      <Button
        variant={hasChanges ? 'primary' : 'secondary'}
        size="icon"
        onClick={handleSave}
        disabled={!hasChanges}
        loading={saving}
        hint={hasChanges ? t('settings.save.hint') : t('common.noChanges.hint')}
        aria-label={t('common.save')}
      >
        {!saving && <Save size={15} />}
      </Button>

      {error && (
        <Alert tone="danger" onDismiss={() => setError('')} className="basis-full">
          {error}
        </Alert>
      )}
    </div>
  );
}
