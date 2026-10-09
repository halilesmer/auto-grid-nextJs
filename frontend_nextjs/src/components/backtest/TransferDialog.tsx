'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AccountDropdown } from '@/components/account/components';
import { Alert } from '@/components/ui/alert';
import { toast } from '@/components/ui/animated-toast';
import { Button } from '@/components/ui/button';
import { InputField } from '@/components/ui/InputField';
import { Modal } from '@/components/ui/modal';
import { useFormat, useT } from '@/i18n';
import { axiosInstance } from '@/lib/api';
import { getApiErrorMessage, isAbortError } from '@/lib/apiError';
import { presetZone } from '@/lib/backtest/presets';
import { settingsFromWorker, setupNumbers } from '@/lib/symbolSetups';
import { selectAccount, useAccountStore, useSettingsStore } from '@/store';
import type { SymbolDetail, ZoneSettings } from '@/store/types';
import { useAuthStore } from '@/store/useAuthStore';
import { useConnectionStore } from '@/store/useConnectionStore';
import { useZoneTransferStore } from '@/store/useZoneTransferStore';
import { normalizeZoneLots } from '@/utils/zoneHelpers';

export function TransferDialog({ zone, onClose }: { zone: ZoneSettings; onClose: () => void }) {
  const t = useT();
  const fmt = useFormat();
  const router = useRouter();
  const accounts = useAccountStore((s) => s.accounts);
  const selected = useAccountStore((s) => s.selectedAccount);
  const me = useAuthStore((s) => s.me);
  const baseUrl = useConnectionStore((s) => s.baseUrl);
  const apiKey = useConnectionStore((s) => s.apiKey);
  const [accountId, setAccountId] = useState(selected ?? '');
  const [targetId, setTargetId] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; zones: ZoneSettings[]; details: Record<string, SymbolDetail>; error: string | null } | null>(null);
  const key = `${baseUrl}|${apiKey}|${accountId}|${attempt}`;

  useEffect(() => {
    if (!accountId || !accounts.some((a) => String(a.id) === accountId)) return;
    const controller = new AbortController();
    const options = { signal: controller.signal, timeout: 30_000 };
    // Vorschau eines noch nicht ausgewählten Kontos: überschreibt den globalen Kontostand nicht.
    Promise.all([
      axiosInstance.get(`/settings/${accountId}`, options),
      axiosInstance.get(`/symbols/${accountId}`, options),
    ]).then(([settings, symbols]) => {
      const raw = symbols.data?.symbols;
      const items: SymbolDetail[] = Array.isArray(raw) ? raw : Object.entries(raw ?? {}).map(([name, data]) => ({ ...(data as SymbolDetail), name }));
      const details = Object.fromEntries(items.filter((s) => typeof s?.name === 'string').map((s) => [s.name.toUpperCase(), s]));
      if (!controller.signal.aborted) setState({ key, zones: settingsFromWorker(settings.data.settings ?? settings.data).ZONES, details, error: null });
    }).catch(async (error) => {
      if (isAbortError(error)) return;
      const message = await getApiErrorMessage(error, t('backtest.transfer.failed'));
      if (!controller.signal.aborted) setState({ key, zones: [], details: {}, error: message });
    });
    return () => controller.abort();
  }, [accountId, accounts, key, t]);

  const ready = state?.key === key;
  const matching = ready ? state.zones.filter((z) => z.symbol.toUpperCase() === zone.symbol.toUpperCase()) : [];
  const symbol = ready ? state.details[zone.symbol.toUpperCase()] : null;
  const normalized = symbol && state ? normalizeZoneLots(zone, state.details) : zone;
  const lotsChanged = normalized.lot_size !== zone.lot_size || normalized.sell_lot_size !== zone.sell_lot_size;
  const numbers = setupNumbers(ready ? state.zones : []);
  const allowed = ready && !state.error && Boolean(symbol) && Boolean(me) && (!targetId || matching.some((z) => z.id === targetId));

  return <Modal open onClose={onClose} title={t('backtest.transfer.title')}>
    <div className="space-y-4" data-testid="bt-transfer-dialog">
      <p className="text-sm text-muted-foreground">{t('backtest.transfer.notice')}</p>
      <AccountDropdown activeAccount={accounts.find((a) => String(a.id) === accountId) ?? null} accounts={accounts} selectedAccount={accountId} onSelect={(id) => { setAccountId(id); setTargetId(''); }} />
      <InputField label={t('backtest.transfer.target')} hint={t('backtest.transfer.target.hint')}>
        <select className="input-s" value={targetId} disabled={!ready} onChange={(e) => setTargetId(e.target.value)}>
          <option value="">{t('backtest.transfer.new')}</option>
          {matching.map((z) => <option key={z.id} value={z.id}>{t('analysis.zone.option', { n: numbers.get(z.id) ?? 0, symbol: z.symbol })}</option>)}
        </select>
      </InputField>
      {ready && state.error && <Alert tone="danger" title={state.error} />}
      {ready && !state.error && !symbol && <Alert tone="warning" title={t('backtest.transfer.symbolMissing')} />}
      {lotsChanged && <Alert tone="info" title={t('backtest.transfer.lots', {
        buy: fmt.number(normalized.lot_size, { maximumFractionDigits: 8 }), sell: fmt.number(normalized.sell_lot_size, { maximumFractionDigits: 8 }),
      })} />}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" hint={t('backtest.transfer.reload.hint')} onClick={() => setAttempt((a) => a + 1)}>{t('backtest.transfer.reload')}</Button>
        <Button variant="primary" disabled={!allowed} hint={t('backtest.transfer.apply.hint')} onClick={() => {
          if (!allowed || !me) return;
          try {
            useZoneTransferStore.getState().stage({ accountId, targetId: targetId || null, zone: presetZone(normalized), baseUrl, owner: me.id });
          } catch {
            toast.error(t('backtest.presets.invalid'));
            return;
          }
          selectAccount(accountId);
          // Auch beim selben Konto muss das Dashboard zuerst seinen gespeicherten Vergleichsstand laden.
          useSettingsStore.getState().setSettings(null);
          router.push('/');
        }}>{t('backtest.transfer.apply')}</Button>
      </div>
    </div>
  </Modal>;
}
