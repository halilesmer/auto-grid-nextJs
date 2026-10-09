'use client';

import { useEffect } from 'react';
import { insertSetup } from '@/lib/symbolSetups';
import { useAccountStore, useSettingsStore } from '@/store';
import { useAuthStore } from '@/store/useAuthStore';
import { useConnectionStore } from '@/store/useConnectionStore';
import { useZoneTransferStore } from '@/store/useZoneTransferStore';
import { normalizeZoneLots } from '@/utils/zoneHelpers';
import { toast } from '@/components/ui/animated-toast';
import { t } from '@/i18n';

/** Wartet auf den gespeicherten Dashboard-Vergleichsstand; erst danach wird der Entwurf geändert. */
export function useZoneTransfer(accountId: string | null, savedSettingsStr: string | null) {
  const pending = useZoneTransferStore((s) => s.pending);
  const loadedAccount = useSettingsStore((s) => s.loadedAccount);
  const details = useSettingsStore((s) => s.symbolDetails);
  const symbolsLoading = useSettingsStore((s) => s.isLoadingSymbols);
  const me = useAuthStore((s) => s.me);
  const baseUrl = useConnectionStore((s) => s.baseUrl);
  const applied = useZoneTransferStore((s) => s.applied);

  useEffect(() => {
    void useZoneTransferStore.persist.rehydrate();
    return () => { useZoneTransferStore.setState({ applied: null }); };
  }, []);
  useEffect(() => {
    if (!pending || !me || useZoneTransferStore.getState().pending !== pending) return;
    const invalidSession = pending.baseUrl !== baseUrl || pending.owner !== me.id
      || Date.now() - pending.at > 5 * 60_000 || pending.at > Date.now();
    if (invalidSession || (accountId && accountId !== pending.accountId)) {
      useZoneTransferStore.getState().clear();
      toast.error(t('backtest.transfer.expired'));
      return;
    }
    if (loadedAccount !== pending.accountId || !savedSettingsStr || symbolsLoading) return;
    const settings = useSettingsStore.getState().settings;
    if (!settings || useAccountStore.getState().selectedAccount !== pending.accountId) return;
    const symbol = details[pending.zone.symbol.toUpperCase()];
    if (!symbol) {
      useZoneTransferStore.getState().clear();
      toast.error(t('backtest.transfer.symbolMissing'));
      return;
    }
    const previous = settings.ZONES.find((z) => z.id === pending.targetId);
    if (pending.targetId && (!previous || previous.symbol.toUpperCase() !== pending.zone.symbol.toUpperCase())) {
      useZoneTransferStore.getState().clear();
      toast.error(t('backtest.transfer.targetMissing'));
      return;
    }
    const zone = normalizeZoneLots({ ...pending.zone, symbol: previous?.symbol ?? pending.zone.symbol, id: previous?.id ?? crypto.randomUUID(),
      ...(previous?.magic !== undefined ? { magic: previous.magic } : {}), is_active: previous ? previous.is_active : false }, details);
    // Vor dem Schreiben konsumieren: Strict Mode und weitere Store-Updates wenden die Kopie nicht zweimal an.
    useZoneTransferStore.getState().complete({ accountId: pending.accountId, zoneId: zone.id });
    useSettingsStore.getState().setZones(previous
      ? settings.ZONES.map((current) => current.id === previous.id ? zone : current)
      : insertSetup(settings.ZONES, zone));
  }, [pending, accountId, loadedAccount, savedSettingsStr, details, symbolsLoading, me, baseUrl]);

  return applied?.accountId === accountId ? applied : null;
}
