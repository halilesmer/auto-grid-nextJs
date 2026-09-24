'use client';

import type { ReactNode } from 'react';
import { Bot, Cpu, GitBranch, Globe, Power, Server } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatusDot } from '@/components/ui/status-dot';
import type { VpsStatus } from '@/lib/vps';

type Tone = 'success' | 'danger' | 'warning' | 'neutral';

function Tile({
  icon,
  title,
  tone,
  value,
  children,
  testId,
}: {
  icon: ReactNode;
  title: string;
  tone: Tone;
  value: string;
  children?: ReactNode;
  testId: string;
}) {
  return (
    <Card className="p-4" data-testid={testId} data-tone={tone}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{title}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <StatusDot tone={tone} pulse={tone === 'success'} />
        <span className="truncate text-sm font-semibold text-foreground">{value}</span>
      </div>
      {children && <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">{children}</div>}
    </Card>
  );
}

function uptime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} Tage`;
}

export default function VpsStatusPanel({ status, sshError }: { status: VpsStatus | null; sshError: string | null }) {
  if (!status) {
    return (
      <Card className="p-4" data-testid="vps-status">
        <div className="flex items-center gap-2 text-sm">
          <StatusDot tone="danger" />
          <span className="font-medium text-foreground">VPS nicht erreichbar</span>
        </div>
        {sshError && <p className="mt-2 font-mono text-xs text-muted-foreground">{sshError}</p>}
      </Card>
    );
  }

  const worker = status.worker;
  const workerTone: Tone = worker.reachable ? 'success' : worker.listening ? 'warning' : 'danger';
  const workerValue = worker.reachable ? 'Läuft' : worker.listening ? 'Antwortet nicht' : 'Gestoppt';
  const ngrokTone: Tone = status.ngrok.running ? 'success' : 'danger';
  const autoUpdate = status.auto_update_minutes === '0' ? 'aus' : `alle ${status.auto_update_minutes || 5} min`;

  return (
    <div className="space-y-3" data-testid="vps-status">
      {sshError && (
        // Letzter bekannter Stand bleibt sichtbar, ist aber evtl. veraltet
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/[0.06] p-3 text-sm">
          <StatusDot tone="danger" className="mt-1.5" />
          <div className="min-w-0">
            <p className="font-medium text-foreground">VPS nicht erreichbar – angezeigt wird der letzte Stand</p>
            <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">{sshError}</p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile icon={<Server size={14} />} title="Worker (uvicorn)" tone={workerTone} value={workerValue} testId="vps-tile-worker">
          <p>Neustart-Schleife: {status.worker_watchdog ? 'aktiv' : 'fehlt'}</p>
          {worker.error && <p className="truncate font-mono">{worker.error}</p>}
        </Tile>

        <Tile
          icon={<Globe size={14} />}
          title="ngrok-Tunnel"
          tone={ngrokTone}
          value={status.ngrok.running ? 'Online' : 'Offline'}
          testId="vps-tile-ngrok"
        >
          {status.ngrok.public_url && <p className="truncate font-mono">{status.ngrok.public_url}</p>}
          <p>Neustart-Schleife: {status.ngrok_watchdog ? 'aktiv' : 'fehlt'}</p>
        </Tile>

        <Tile
          icon={<Bot size={14} />}
          title="Bots"
          tone={status.bots.length > 0 ? 'success' : 'neutral'}
          value={status.bots.length === 1 ? '1 Bot läuft' : `${status.bots.length} Bots laufen`}
          testId="vps-tile-bots"
        >
          {status.bots.map((b) => (
            <p key={b.pid} className="font-mono">
              {b.account || '?'} · PID {b.pid}
            </p>
          ))}
          <p>MT5-Terminals: {status.mt5_terminals}</p>
        </Tile>

        <Tile
          icon={<GitBranch size={14} />}
          title="Version auf dem VPS"
          tone={status.git.branch === 'main' ? 'success' : 'warning'}
          value={status.version || '?'}
          testId="vps-tile-version"
        >
          <p className="font-mono">
            {status.git.branch || '?'} @ {status.git.commit || '?'}
          </p>
          <p>Auto-Update: {autoUpdate}</p>
        </Tile>

        <Tile
          icon={<Power size={14} />}
          title="Autostart"
          tone={status.autologon && status.tasks.start.exists ? 'success' : 'warning'}
          value={status.autologon && status.tasks.start.exists ? 'Eingerichtet' : 'Unvollständig'}
          testId="vps-tile-autostart"
        >
          <p>Auto-Login: {status.autologon ? 'an' : 'aus'}</p>
          <p>Aufgabe AutoGrid-Start: {status.tasks.start.exists ? 'vorhanden' : 'fehlt'}</p>
          <p>Sitzung angemeldet: {status.session_active ? 'ja' : 'nein'}</p>
        </Tile>

        <Tile icon={<Cpu size={14} />} title="System" tone="success" value={status.hostname} testId="vps-tile-system">
          <p>Läuft seit {uptime(status.uptime_minutes)}</p>
        </Tile>
      </div>
    </div>
  );
}
