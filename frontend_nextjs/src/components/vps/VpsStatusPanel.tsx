'use client';

import type { ReactNode } from 'react';
import { Bot, Cpu, GitBranch, Globe, Power, Server } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatusDot } from '@/components/ui/status-dot';
import type { VpsStatus } from '@/lib/vps';
import { useT, type MessageKey } from '@/i18n';

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

function uptime(minutes: number, t: (key: MessageKey, params?: Record<string, string | number>) => string): string {
  if (minutes < 60) return t('vps.uptime.min', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return t('vps.uptime.hours', { h: hours, m: minutes % 60 });
  return t('vps.uptime.days', { n: Math.floor(hours / 24) });
}

export default function VpsStatusPanel({ status, sshError }: { status: VpsStatus | null; sshError: string | null }) {
  const t = useT();
  if (!status) {
    return (
      <Card className="p-4" data-testid="vps-status">
        <div className="flex items-center gap-2 text-sm">
          <StatusDot tone="danger" />
          <span className="font-medium text-foreground">{t('vps.status.unreachable')}</span>
        </div>
        {sshError && <p className="mt-2 font-mono text-xs text-muted-foreground">{sshError}</p>}
      </Card>
    );
  }

  const worker = status.worker;
  const workerTone: Tone = worker.reachable ? 'success' : worker.listening ? 'warning' : 'danger';
  const workerValue = worker.reachable
    ? t('vps.tile.worker.running')
    : worker.listening
      ? t('vps.tile.worker.noAnswer')
      : t('vps.tile.worker.stopped');
  const ngrokTone: Tone = status.ngrok.running ? 'success' : 'danger';
  const autoUpdate =
    status.auto_update_minutes === '0'
      ? t('vps.tile.autoUpdate.off')
      : t('vps.tile.autoUpdate.every', { minutes: status.auto_update_minutes || 5 });
  const on = (v: boolean) => (v ? t('vps.tile.on') : t('vps.tile.off'));
  const loop = (v: boolean) => t('vps.tile.loop', { state: v ? t('vps.tile.loop.active') : t('vps.tile.loop.missing') });

  return (
    <div className="space-y-3" data-testid="vps-status">
      {sshError && (
        // Letzter bekannter Stand bleibt sichtbar, ist aber evtl. veraltet
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/[0.06] p-3 text-sm">
          <StatusDot tone="danger" className="mt-1.5" />
          <div className="min-w-0">
            <p className="font-medium text-foreground">{t('vps.status.unreachableStale')}</p>
            <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">{sshError}</p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile icon={<Server size={14} />} title={t('vps.tile.worker')} tone={workerTone} value={workerValue} testId="vps-tile-worker">
          <p>{loop(status.worker_watchdog)}</p>
          {worker.error && <p className="truncate font-mono">{worker.error}</p>}
        </Tile>

        <Tile
          icon={<Globe size={14} />}
          title={t('vps.tile.ngrok')}
          tone={ngrokTone}
          value={status.ngrok.running ? t('vps.tile.ngrok.online') : t('vps.tile.ngrok.offline')}
          testId="vps-tile-ngrok"
        >
          {status.ngrok.public_url && <p className="truncate font-mono">{status.ngrok.public_url}</p>}
          <p>{loop(status.ngrok_watchdog)}</p>
        </Tile>

        <Tile
          icon={<Bot size={14} />}
          title={t('vps.tile.bots')}
          tone={status.bots.length > 0 ? 'success' : 'neutral'}
          value={t('vps.tile.bots.running', { count: status.bots.length })}
          testId="vps-tile-bots"
        >
          {status.bots.map((b) => (
            <p key={b.pid} className="font-mono">
              {b.account || '?'} · PID {b.pid}
            </p>
          ))}
          <p>{t('vps.tile.bots.mt5', { n: status.mt5_terminals })}</p>
        </Tile>

        <Tile
          icon={<GitBranch size={14} />}
          title={t('vps.tile.version')}
          tone={status.git.branch === 'main' ? 'success' : 'warning'}
          value={status.version || '?'}
          testId="vps-tile-version"
        >
          <p className="font-mono">
            {status.git.branch || '?'} @ {status.git.commit || '?'}
          </p>
          <p>{t('vps.tile.autoUpdate', { state: autoUpdate })}</p>
        </Tile>

        <Tile
          icon={<Power size={14} />}
          title={t('vps.tile.autostart')}
          tone={status.autologon && status.tasks.start.exists ? 'success' : 'warning'}
          value={status.autologon && status.tasks.start.exists ? t('vps.tile.autostart.ok') : t('vps.tile.autostart.incomplete')}
          testId="vps-tile-autostart"
        >
          <p>{t('vps.tile.autologon', { state: on(status.autologon) })}</p>
          <p>
            {t('vps.tile.task', {
              state: status.tasks.start.exists ? t('vps.tile.exists') : t('vps.tile.absent'),
            })}
          </p>
          <p>
            {t('vps.tile.session', { state: status.session_active ? t('vps.tile.yes') : t('vps.tile.no') })}
          </p>
        </Tile>

        <Tile icon={<Cpu size={14} />} title={t('vps.tile.system')} tone="success" value={status.hostname} testId="vps-tile-system">
          <p>{t('vps.tile.uptime', { time: uptime(status.uptime_minutes, t) })}</p>
        </Tile>
      </div>
    </div>
  );
}
