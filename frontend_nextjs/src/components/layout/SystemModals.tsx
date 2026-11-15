'use client';

import ConfirmModal from '@/components/ConfirmModal';
import UpdateModal from '@/components/dashboard/UpdateModal';
import type { useSystemActions } from '@/hooks/useSystemActions';
import { useT } from '@/i18n';
import { useAccountStore } from '@/store/useAccountStore';

/** Update- und Herunterfahren-Dialog zu `useSystemActions()`; Kopf-Menü und Einstellungsfenster teilen sich den Aufbau. */
export default function SystemModals({ system }: { system: ReturnType<typeof useSystemActions> }) {
  const t = useT();
  const activeAccount = useAccountStore((s) => s.activeAccount);
  return (
    <>
      <UpdateModal
        isOpen={system.updateOpen}
        onClose={() => {
          system.setUpdateOpen(false);
          system.setUpdateResult(null);
        }}
        updateResult={system.updateResult}
        onApplyUpdate={system.handleApplyUpdate}
      />

      <ConfirmModal
        open={system.shutdownOpen}
        onClose={() => system.setShutdownOpen(false)}
        onConfirm={system.handleShutdown}
        title={t('dashboard.shutdown')}
        message={t('dashboard.shutdown.message', {
          account: activeAccount?.account_name ?? '',
          env: activeAccount?.env_type === 'LIVE' ? t('dashboard.env.live') : t('dashboard.env.demo'),
        })}
        confirmLabel={t('dashboard.shutdown.confirm')}
        confirmHint={t('dashboard.shutdown.confirm.hint')}
        variant="danger"
        loading={system.shuttingDown}
      />
    </>
  );
}
