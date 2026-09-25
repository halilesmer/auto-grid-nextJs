'use client';

import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { VpsElevatedProcess } from '@/lib/vps';
import { useT, type MessageKey } from '@/i18n';

const ROLE_KEYS: Record<string, MessageKey> = {
  'worker-loop': 'vps.role.worker-loop',
  'ngrok-loop': 'vps.role.ngrok-loop',
  worker: 'vps.role.worker',
  ngrok: 'vps.role.ngrok',
  bot: 'vps.role.bot',
  mt5: 'vps.role.mt5',
};

interface Props {
  processes: VpsElevatedProcess[];
  busy: boolean;
  disabled: boolean;
  onFix: () => Promise<void>;
}

/**
 * Warnung, wenn AutoGrid-Prozesse auf dem VPS mit Administratorrechten laufen (alte Aufgabe mit
 * „höchsten Rechten“, start.bat per „Als Administrator ausführen“). Der normale Worker kann sie
 * weder sehen noch beenden: alte Neustart-Schleifen laufen neben den neuen weiter und starten
 * Worker/Bots wieder mit Adminrechten. Nur vps.ps1 (per SSH erhöht) kann sie beenden.
 */
export default function VpsElevatedWarning({ processes, busy, disabled, onFix }: Props) {
  const t = useT();
  const [confirm, setConfirm] = useState(false);
  if (processes.length === 0) return null;
  const withBots = processes.some((p) => p.role === 'bot' || p.role === 'mt5');

  return (
    <>
      <div data-testid="vps-elevated">
        <Alert
          tone="danger"
          title={t('vps.elevated.title', { count: processes.length })}
        >
          <ul className="mt-1 space-y-0.5 font-mono text-xs">
            {processes.map((p) => (
              <li key={p.pid}>
                {ROLE_KEYS[p.role] ? t(ROLE_KEYS[p.role]) : p.role}
                {p.account ? ` ${p.account}` : ''} · PID {p.pid}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            {t('vps.elevated.text')}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="text-danger"
            wrapperClassName="mt-3"
            onClick={() => setConfirm(true)}
            loading={busy}
            disabled={disabled}
            hint={disabled && !busy ? t('vps.busy.hint') : t('vps.elevated.fix.hint')}
            data-testid="vps-action-fix-elevated"
          >
            <ShieldAlert size={14} />
            {t('vps.elevated.fix')}
          </Button>
        </Alert>
      </div>

      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          await onFix();
        }}
        title={t('vps.elevated.confirmTitle')}
        message={t('vps.elevated.confirmMessage')}
        infoText={withBots ? t('vps.elevated.infoBots') : t('vps.elevated.infoNoBots')}
        variant="danger"
        confirmLabel={t('vps.elevated.fix')}
        confirmHint={t('vps.elevated.fix.hint')}
      />
    </>
  );
}
