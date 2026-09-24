'use client';

import { useState } from 'react';
import { ArrowRight, CheckCircle2, DownloadCloud, Globe, Power, RefreshCw, RotateCcw } from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { VpsUpdateCheck } from '@/lib/vps';
import { ACTION_TITLES, type PostAction } from './useVps';

const CONFIRM: Record<PostAction, { message: string; info?: string; variant: 'warning' | 'danger' }> = {
  update: {
    message: 'Der Worker holt den neuesten Stand von main (git pull, bei Bedarf pip install) und startet neu.',
    info: 'git läuft dabei mit den normalen Rechten des Workers, nie als Administrator. Laufende Bots werden danach mit der neuen Version neu gestartet, Positionen und Orders bleiben unberührt.',
    variant: 'warning',
  },
  restart: {
    message: 'Worker und ngrok werden über start.bat neu gestartet. Das Dashboard ist ~10–20 s nicht erreichbar.',
    info: 'Bots sind eigene Prozesse und laufen weiter.',
    variant: 'warning',
  },
  'restart-ngrok': {
    message: 'Der ngrok-Tunnel wird beendet und nach ~3 s automatisch neu gestartet.',
    variant: 'warning',
  },
  reboot: {
    message: 'Windows auf dem VPS wird neu gestartet. Danach melden sich Auto-Login, Worker und ngrok selbst wieder an.',
    info: 'Alle Bots, die vorher liefen (nicht gestoppt), starten danach automatisch wieder – auch LIVE. Dauer: meist 1–3 Minuten.',
    variant: 'danger',
  },
};

interface Props {
  busy: PostAction | 'check-update' | null;
  updateCheck: VpsUpdateCheck | null;
  onCheckUpdate: () => void;
  onAction: (action: PostAction) => Promise<void>;
  workerRunning: boolean;
}

export default function VpsActions({ busy, updateCheck, onCheckUpdate, onAction, workerRunning }: Props) {
  const [confirm, setConfirm] = useState<PostAction | null>(null);
  const cfg = confirm ? CONFIRM[confirm] : null;

  return (
    <>
      <Card>
        <CardHeader title="Steuerung" description="Alles läuft per SSH über den lokalen Next.js-Server" icon={<Power size={16} />} />
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 p-3" data-testid="vps-update">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <p className="font-medium text-foreground">Updates</p>
                <p className="text-xs text-muted-foreground">
                  {workerRunning ? 'Prüft origin/main über den Worker auf dem VPS' : 'Worker läuft nicht – Update geht trotzdem (über die Aufgabe AutoGrid-Update)'}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={onCheckUpdate}
                loading={busy === 'check-update'}
                disabled={!workerRunning || busy !== null}
                data-testid="vps-action-check-update"
              >
                <RefreshCw size={14} />
                Nach Updates suchen
              </Button>
            </div>
            {updateCheck && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2" data-testid="vps-update-result">
                {updateCheck.has_update ? (
                  <div className="flex items-center gap-2 font-mono text-sm">
                    <span className="text-muted-foreground">{updateCheck.local_ver}</span>
                    <ArrowRight size={14} className="text-muted-foreground" />
                    <span className="font-semibold text-success">{updateCheck.remote_ver}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-success">
                    <CheckCircle2 size={16} />
                    Aktuell ({updateCheck.local_ver})
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Icons nicht schrumpfen lassen; in der schmalen lg-Spalte eine Spalte */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 [&_svg]:shrink-0">
            <Button
              variant={updateCheck?.has_update ? 'success' : 'secondary'}
              onClick={() => setConfirm('update')}
              loading={busy === 'update'}
              disabled={busy !== null}
              data-testid="vps-action-update"
            >
              <DownloadCloud size={16} />
              Update &amp; Neustart
            </Button>
            <Button
              onClick={() => setConfirm('restart')}
              loading={busy === 'restart'}
              disabled={busy !== null}
              data-testid="vps-action-restart"
            >
              <RotateCcw size={16} />
              Worker neu starten
            </Button>
            <Button
              onClick={() => setConfirm('restart-ngrok')}
              loading={busy === 'restart-ngrok'}
              disabled={busy !== null}
              data-testid="vps-action-restart-ngrok"
            >
              <Globe size={16} />
              ngrok neu starten
            </Button>
            <Button
              variant="outline"
              className="text-danger"
              onClick={() => setConfirm('reboot')}
              loading={busy === 'reboot'}
              disabled={busy !== null}
              data-testid="vps-action-reboot"
            >
              <Power size={16} />
              VPS neu starten
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Außerhalb der Card: deren backdrop-blur würde das fixed-Modal auf die Card begrenzen */}
      <ConfirmModal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          const action = confirm;
          setConfirm(null);
          if (action) await onAction(action);
        }}
        title={confirm ? `${ACTION_TITLES[confirm]}?` : ''}
        message={cfg?.message ?? ''}
        infoText={cfg?.info}
        variant={cfg?.variant ?? 'warning'}
        confirmLabel={confirm ? ACTION_TITLES[confirm] : 'OK'}
        cancelLabel="Abbrechen"
      />
    </>
  );
}
