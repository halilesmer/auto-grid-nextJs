'use client';

import type { useSystemActions } from '@/hooks/useSystemActions';
import { useVps } from '@/components/vps/useVps';
import LogsTab from './system/LogsTab';
import RestartTab from './system/RestartTab';
import { type SystemCtx, type SystemTab } from './system/shared';
import StatusTab from './system/StatusTab';
import UpdateTab from './system/UpdateTab';
import { useWorkerSystem } from './system/useWorkerSystem';

export { SYSTEM_TABS, type SystemTab } from './system/shared';

/**
 * „VPS ve sistem“ bölümü (yalnız admin, plan 1115-A9): dört sekme. Worker üzerinden okunanlar her yerde çalışır;
 * SSH satırları yalnız Mac'teki localhost'ta açıktır, başka yerde görünür ama kilitlidir. Diyaloglar SettingsDialog'da durur.
 */
export default function SystemSection({ tab, system }: { tab: SystemTab; system: ReturnType<typeof useSystemActions> }) {
  const vps = useVps({ pollLogs: false });
  const worker = useWorkerSystem();
  const ctx: SystemCtx = { vps, worker, system, sshLocked: vps.localOnly || Boolean(vps.disabled) };
  return (
    <div data-testid="settings-system">
      {tab === 'status' && <StatusTab ctx={ctx} />}
      {tab === 'update' && <UpdateTab ctx={ctx} />}
      {tab === 'restart' && <RestartTab ctx={ctx} />}
      {tab === 'logs' && <LogsTab ctx={ctx} />}
    </div>
  );
}
