'use client';

import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import type { Account } from '@/components/account/types';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  /** Kontoliste für die LIVE/DEMO-Rozette; leer = keine Rozette */
  accounts: Account[];
  busy: boolean;
  disabled: boolean;
  /** stopBots: Bots/MT5 stehen in der Liste und der Benutzer hat ausdrücklich bestätigt */
  onFix: (stopBots: boolean) => Promise<void>;
}

/** Bots und MT5 beendet fix-elevated nur mit eigener Bestätigung; alles andere startet neu. */
function isBotOrMt5(p: VpsElevatedProcess) {
  return p.role === 'bot' || p.role === 'mt5';
}

/**
 * Warnung, wenn AutoGrid-Prozesse auf dem VPS mit Administratorrechten laufen (alte Aufgabe mit
 * „höchsten Rechten“, start.bat per „Als Administrator ausführen“). Der normale Worker kann sie
 * weder sehen noch beenden: alte Neustart-Schleifen laufen neben den neuen weiter und starten
 * Worker/Bots wieder mit Adminrechten. Nur vps.ps1 (per SSH erhöht) kann sie beenden.
 * Zwei Gruppen: „startet neu“ (Schleifen, Worker, ngrok) und „stoppt“ (Bots, MT5, 1104-K6).
 */
export default function VpsElevatedWarning(props: Props) {
  // Eigene Komponente mit Zustand: leert sich die Liste, geht der offene Dialog samt Haken verloren
  if (props.processes.length === 0) return null;
  return <ElevatedWarningBody {...props} />;
}

function ElevatedWarningBody({ processes, accounts, busy, disabled, onFix }: Props) {
  const t = useT();
  const [confirm, setConfirm] = useState(false);
  // Der Haken gilt nur für die Bots/MT5, die beim Setzen in der Liste standen
  const [ackedFor, setAckedFor] = useState<string | null>(null);

  const stopping = processes.filter(isBotOrMt5);
  const restarting = processes.filter((p) => !isBotOrMt5(p));
  const withBots = stopping.length > 0;
  const stopSignature = stopping.map((p) => p.pid).sort((a, b) => a - b).join(',');
  const acknowledged = ackedFor === stopSignature;
  const fixLabel = withBots ? t('vps.elevated.fixWithBots') : t('vps.elevated.fix');
  const fixHint = withBots ? t('vps.elevated.fixWithBots.hint') : t('vps.elevated.fix.hint');

  const envOf = (account: string): 'LIVE' | 'DEMO' | null => {
    if (!account) return null;
    const found = accounts.find((a) => String(a.id) === account || String(a.login) === account);
    if (!found) return null;
    return found.env_type === 'LIVE' ? 'LIVE' : 'DEMO';
  };
  const envBadge = (env: 'LIVE' | 'DEMO' | null) =>
    env && (
      <span
        className={`ml-1.5 rounded-full px-1.5 py-px font-sans text-[10px] font-semibold ${
          env === 'LIVE' ? 'bg-danger/15 text-danger' : 'bg-info/15 text-info'
        }`}
        data-testid="vps-elevated-env"
      >
        {env === 'LIVE' ? t('dashboard.env.live') : t('dashboard.env.demo')}
      </span>
    );

  const renderRows = (list: VpsElevatedProcess[]) => (
    <ul className="mt-1 space-y-0.5 font-mono text-xs">
      {list.map((p) => (
        <li key={p.pid}>
          {ROLE_KEYS[p.role] ? t(ROLE_KEYS[p.role]) : p.role}
          {p.account ? ` ${p.account}` : ''}
          {envBadge(envOf(p.account))} · PID {p.pid}
        </li>
      ))}
    </ul>
  );

  const accountList = stopping
    .filter((p) => p.role === 'bot' && p.account)
    .map((p) => {
      const env = envOf(p.account);
      return env ? `${p.account} (${env})` : p.account;
    })
    .join(', ');

  const close = () => {
    setConfirm(false);
    setAckedFor(null);
  };

  return (
    <>
      <div data-testid="vps-elevated">
        <Alert tone="danger" title={t('vps.elevated.title', { count: processes.length })}>
          {restarting.length > 0 && (
            <div className="mt-2" data-testid="vps-elevated-restart">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('vps.elevated.group.restart')}
              </div>
              {renderRows(restarting)}
            </div>
          )}
          {withBots && (
            <div className="mt-2" data-testid="vps-elevated-stop">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-danger">
                {t('vps.elevated.group.stop')}
              </div>
              {renderRows(stopping)}
            </div>
          )}
          <p className="mt-2 text-xs">{t('vps.elevated.text')}</p>
          <Button
            size="sm"
            variant="outline"
            className="text-danger"
            wrapperClassName="mt-3"
            onClick={() => setConfirm(true)}
            loading={busy}
            disabled={disabled}
            hint={disabled && !busy ? t('vps.busy.hint') : fixHint}
            data-testid="vps-action-fix-elevated"
          >
            <ShieldAlert size={14} />
            {fixLabel}
          </Button>
        </Alert>
      </div>

      <ConfirmModal
        open={confirm}
        onClose={close}
        onConfirm={async () => {
          const stopBots = withBots && acknowledged;
          close();
          await onFix(stopBots);
        }}
        title={withBots ? t('vps.elevated.confirmTitleBots') : t('vps.elevated.confirmTitle')}
        message={t('vps.elevated.confirmMessage', { count: processes.length })}
        infoText={withBots ? t('vps.elevated.infoBots', { accounts: accountList || '–' }) : t('vps.elevated.infoNoBots')}
        variant="danger"
        confirmLabel={fixLabel}
        confirmHint={fixHint}
        confirmDisabled={withBots && !acknowledged}
      >
        {withBots && (
          <Checkbox
            checked={acknowledged}
            onChange={(checked) => setAckedFor(checked ? stopSignature : null)}
            label={t('vps.elevated.ack')}
            hint={t('vps.elevated.ack.hint')}
          />
        )}
      </ConfirmModal>
    </>
  );
}
