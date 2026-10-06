'use client';

import { useState } from 'react';
import ConfirmModal from '@/components/ConfirmModal';
import { toast } from '@/components/ui/animated-toast';
import { useT } from '@/i18n';
import { getApiErrorMessage } from '@/lib/apiError';
import { zoneApi } from '@/services/zoneApi';
import { useAccountStore, useBotRuntimeStore, useSettingsStore } from '@/store';
import type { GlobalSettings } from '@/store/types';

type Decision = NonNullable<GlobalSettings['LEGACY_SETUP_ORDERS']>;

/**
 * Fraktal-Zusatz-Setups gibt es nicht mehr (ENG-29). Meldet der Bot noch Pending Orders solcher Setups
 * (`legacy_setup_orders` in den Live-Daten) und ist für das Konto nichts entschieden, fragt das Fenster
 * einmal: löschen (der Bot storniert sie) oder behalten (der Bot fasst sie nicht an). Die Wahl steht in
 * den Einstellungen (`LEGACY_SETUP_ORDERS`); Schließen ohne Wahl fragt erst nach einem Neuladen wieder.
 */
export function LegacySetupOrdersDialog({ accountId }: { accountId: string | null }) {
  const t = useT();
  const orders = useBotRuntimeStore((s) => s.liveData.legacy_setup_orders);
  const settings = useSettingsStore((s) => s.settings);
  const loadedAccount = useSettingsStore((s) => s.loadedAccount);
  const account = useAccountStore((s) => s.accounts.find((a) => a.id === accountId));
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const settingsOfAccount = accountId !== null && loadedAccount === accountId && settings !== null;
  const undecided = settingsOfAccount && settings.LEGACY_SETUP_ORDERS === undefined;
  const open = undecided && !!orders?.length && dismissedFor !== accountId;
  if (!open || accountId === null) return null;

  const decide = async (decision: Decision) => {
    setSaving(true);
    try {
      await zoneApi.saveSettings(accountId, { LEGACY_SETUP_ORDERS: decision });
      // Nur die Entscheidung übernehmen: ungespeicherte Zonen-Änderungen im Store bleiben
      const fresh = await zoneApi.getSettings(accountId);
      const current = useSettingsStore.getState();
      if (current.loadedAccount === accountId && current.settings) {
        current.setSettings({ ...current.settings, LEGACY_SETUP_ORDERS: fresh.LEGACY_SETUP_ORDERS });
      }
    } catch (err: unknown) {
      toast.error(await getApiErrorMessage(err, t('zone.legacyOrders.saveFailed')), { title: t('common.error') });
    } finally {
      setSaving(false);
    }
  };

  const symbols = [...new Set(orders.map((o) => o.symbol))].join(', ');
  const accountLabel = account ? `${account.account_name} (${account.env_type})` : accountId;

  return (
    <ConfirmModal
      open
      onClose={() => setDismissedFor(accountId)}
      onConfirm={() => decide('delete')}
      title={t('zone.legacyOrders.title')}
      message={t('zone.legacyOrders.message', { account: accountLabel, count: orders.length, symbols })}
      infoText={t('zone.legacyOrders.info')}
      confirmLabel={t('zone.legacyOrders.delete')}
      confirmHint={t('zone.legacyOrders.delete.hint')}
      secondary={{
        label: t('zone.legacyOrders.keep'),
        hint: t('zone.legacyOrders.keep.hint'),
        onClick: () => decide('keep'),
      }}
      loading={saving}
      variant="danger"
    />
  );
}
