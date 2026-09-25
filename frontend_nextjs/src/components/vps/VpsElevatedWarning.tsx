'use client';

import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ELEVATED_ROLE_LABELS, type VpsElevatedProcess } from '@/lib/vps';

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
  const [confirm, setConfirm] = useState(false);
  if (processes.length === 0) return null;
  const withBots = processes.some((p) => p.role === 'bot' || p.role === 'mt5');

  return (
    <>
      <div data-testid="vps-elevated">
        <Alert
          tone="danger"
          title={`${processes.length === 1 ? '1 Prozess läuft' : `${processes.length} Prozesse laufen`} mit Administratorrechten`}
        >
          <ul className="mt-1 space-y-0.5 font-mono text-xs">
            {processes.map((p) => (
              <li key={p.pid}>
                {ELEVATED_ROLE_LABELS[p.role] ?? p.role}
                {p.account ? ` ${p.account}` : ''} · PID {p.pid}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            Der normale Worker kann diese Prozesse weder sehen noch beenden. Alte Neustart-Schleifen laufen neben den
            neuen weiter und starten Worker und Bots wieder mit Adminrechten, Stop und Updates wirken dann nicht richtig.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3 text-danger"
            onClick={() => setConfirm(true)}
            loading={busy}
            disabled={disabled}
            data-testid="vps-action-fix-elevated"
          >
            <ShieldAlert size={14} />
            Admin-Prozesse beenden
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
        title="Admin-Prozesse beenden?"
        message="Alle AutoGrid-Prozesse mit Administratorrechten werden beendet, danach starten Worker und ngrok ohne Adminrechte neu."
        infoText={
          withBots
            ? 'Betroffene Bots und MT5 werden dabei beendet; der Worker startet die Bots danach ohne Adminrechte wieder (auch LIVE). Positionen und Orders bleiben unberührt.'
            : 'Bots ohne Adminrechte laufen weiter.'
        }
        variant="danger"
        confirmLabel="Admin-Prozesse beenden"
        cancelLabel="Abbrechen"
      />
    </>
  );
}
