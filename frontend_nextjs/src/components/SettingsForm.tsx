'use client';

import { Minus, Plus, Save, SlidersHorizontal } from 'lucide-react';
import { useCallback, useState } from 'react';

import { axiosInstance } from '@/services/api';
import { getApiErrorMessage } from '@/lib/apiError';
import { useAccountStore, useSettingsStore } from '@/store';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { NumberInput } from '@/components/ui/NumberInput';
import { toast } from '@/components/ui/animated-toast';

const MIN_INTERVAL = 1;
const MAX_INTERVAL = 60;
const STEP_INTERVAL = 0.1;

export default function SettingsForm() {
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
      toast.success(`Kontrol sıklığı ${loopInterval.toFixed(1)} sn olarak kaydedildi.`, {
        title: 'Genel ayarlar kaydedildi',
      });
    } catch (err: unknown) {
      const message = await getApiErrorMessage(err, 'Failed to save settings');
      setError(message);
      toast.error(message, { title: 'Genel ayarlar kaydedilemedi' });
    } finally {
      setSaving(false);
    }
  }, [selectedAccount, loopInterval, setGlobalSettings]);

  const hasChanges = loopInterval !== originalInterval;

  if (!selectedAccount) return null;

  return (
    <Card data-testid="general-settings">
      <CardHeader
        icon={<SlidersHorizontal size={16} />}
        title="Genel Ayarlar"
        description="Motor döngüsü"
      />
      <CardContent className="space-y-4">
        {error && (
          <Alert tone="danger" onDismiss={() => setError('')}>
            {error}
          </Alert>
        )}

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium text-muted-foreground">Kontrol Sıklığı</span>
            <span className="text-[11px] text-muted-foreground/70">
              {MIN_INTERVAL}–{MAX_INTERVAL} sn
            </span>
          </div>
          <div className="flex h-10 items-stretch overflow-hidden rounded-md border border-input bg-background/60 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20">
            <button
              onClick={decrement}
              disabled={loopInterval <= MIN_INTERVAL}
              className="flex w-10 items-center justify-center text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              title="Azalt"
            >
              <Minus size={15} />
            </button>
            <div className="relative flex flex-1 items-center border-x border-input">
              <NumberInput
                aria-label="Kontrol Sıklığı"
                step={STEP_INTERVAL}
                min={MIN_INTERVAL}
                max={MAX_INTERVAL}
                value={loopInterval}
                onChange={(e) => {
                  const parsed = parseFloat(e.target.value);
                  setLoopInterval(clampInterval(Number.isNaN(parsed) ? MIN_INTERVAL : parsed));
                }}
                className="w-full bg-transparent text-center font-mono text-sm font-semibold text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="pointer-events-none absolute right-3 text-xs text-muted-foreground">sn</span>
            </div>
            <button
              onClick={increment}
              disabled={loopInterval >= MAX_INTERVAL}
              className="flex w-10 items-center justify-center text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              title="Artır"
            >
              <Plus size={15} />
            </button>
          </div>
        </div>

        <div className="flex justify-end border-t border-border pt-4">
          <Button
            variant={hasChanges ? 'primary' : 'secondary'}
            onClick={handleSave}
            disabled={!hasChanges}
            loading={saving}
          >
            {!saving && <Save size={15} />}
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
