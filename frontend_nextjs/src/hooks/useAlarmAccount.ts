'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { resolveAlarmAccount } from '@/lib/formation/alarmAccount';
import { serverSnapshot, snapshot, subscribe } from '@/lib/formation/alarmStore';
import { useAccountStore } from '@/store/useAccountStore';

/** Konto des Alarms (siehe alarmAccount.ts) mit Anzeigename aus der Kontoliste; wird nur gelesen, nie als Kontowahl gesetzt */
export function useAlarmAccount() {
  const selected = useAccountStore((s) => s.selectedAccount);
  const accounts = useAccountStore((s) => s.accounts);
  const loaded = useAccountStore((s) => s.accountsLoaded);
  const remembered = useSyncExternalStore(subscribe, () => snapshot().account, () => serverSnapshot().account);
  return useMemo(() => {
    const resolved = resolveAlarmAccount(selected, remembered, accounts, loaded);
    const name = accounts.find((a) => String(a.id) === resolved.accountId)?.account_name;
    return { ...resolved, label: name ? `${name} (${resolved.accountId})` : (resolved.accountId ?? '') };
  }, [selected, remembered, accounts, loaded]);
}
