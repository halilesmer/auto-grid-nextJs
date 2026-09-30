'use client';

import type { ReactNode } from 'react';
import { Bot, Cpu, GitBranch, Globe, Power, Server } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatusDot } from '@/components/ui/status-dot';
import { FieldLabel } from '@/components/ui/tooltip';
import type { VpsStatus } from '@/lib/vps';
import { useFormat, useT, type MessageKey } from '@/i18n';

type Tone = 'success' | 'danger' | 'warning' | 'neutral';

function Tile({
  icon,
  title,
  hint,
  tone,
  value,
  children,
  testId,
}: {
  icon: ReactNode;
  title: string;
  /** Pflicht (hooks/RULES.md §5): was die Kachel anzeigt. */
  hint: string;
  tone: Tone;
  value: string;
  children?: ReactNode;
  testId: string;
}) {
  return (
    <Card className="p-4" data-testid={testId} data-tone={tone}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <FieldLabel label={title} hint={hint} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <StatusDot tone={tone} pulse={tone === 'success'} />
        <span className="truncate text-sm font-semibold text-foreground">{value}</span>
      </div>
      {children && <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">{children}</div>}
    </Card>
  );
}

export function uptime(minutes: number, t: (key: MessageKey, params?: Record<string, string | number>) => string): string {
  if (minutes < 60) return t('vps.uptime.min', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return t('vps.uptime.hours', { h: hours, m: minutes % 60 });
  return t('vps.uptime.days', { n: Math.floor(hours / 24) });
}

type TFn = (key: MessageKey, params?: Record<string, string | number>) => string;

// Aufgabe läuft alle 5 min; deutlich älter = deaktiviert, keine Sitzung oder Skriptfehler
const SELF_HEAL_STALE_MINUTES = 15;

// Tunnel-Watchdog (AutoGrid-Tunnel): eingerichtet? prüft er noch? letzte Prüfung ok oder wie oft in Folge fehlgeschlagen?
function selfHealState(status: VpsStatus, t: TFn): string {
  if (!status.tasks.tunnel?.exists) return t('vps.tile.selfHeal.missing');
  const wd = status.tunnel_watchdog;
  if (!wd || !wd.last_check) return t('vps.tile.selfHeal.pending');
  if ((wd.check_age_minutes ?? 0) > SELF_HEAL_STALE_MINUTES && status.uptime_minutes > SELF_HEAL_STALE_MINUTES) {
    return t('vps.tile.selfHeal.stale', { n: wd.check_age_minutes ?? 0 });
  }
  if (wd.failures > 0) return t('vps.tile.selfHeal.failing', { n: wd.failures });
  return wd.last_ok ? t('vps.tile.selfHeal.ok') : t('vps.tile.selfHeal.pending');
}

export default function VpsStatusPanel({ status, sshError }: { status: VpsStatus | null; sshError: string | null }) {
  const t = useT();
  const fmt = useFormat();
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
  // Tunnel-Prozess läuft, die öffentliche URL antwortet aber nicht (laut Watchdog, Worker lokal ok) -> Warnung
  const tunnelFailing = !!status.tunnel_watchdog?.failures && status.tunnel_watchdog.last_result === 'tunnel-down';
  const ngrokTone: Tone = !status.ngrok.running ? 'danger' : tunnelFailing ? 'warning' : 'success';
  const autoUpdate =
    status.auto_update_minutes === '0'
      ? t('vps.tile.autoUpdate.off')
      : t('vps.tile.autoUpdate.every', { minutes: status.auto_update_minutes || 5 });
  const on = (v: boolean) => (v ? t('vps.tile.on') : t('vps.tile.off'));
  const selfHeal = selfHealState(status, t);
  const lastReboot = status.tunnel_watchdog?.reboots.at(-1);
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
        <Tile icon={<Server size={14} />} title={t('vps.tile.worker')} hint={t('vps.tile.worker.hint')} tone={workerTone} value={workerValue} testId="vps-tile-worker">
          <p>{loop(status.worker_watchdog)}</p>
          {worker.error && <p className="truncate font-mono">{worker.error}</p>}
        </Tile>

        <Tile
          icon={<Globe size={14} />}
          title={t('vps.tile.ngrok')}
          hint={t('vps.tile.ngrok.hint')}
          tone={ngrokTone}
          value={status.ngrok.running ? t('vps.tile.ngrok.online') : t('vps.tile.ngrok.offline')}
          testId="vps-tile-ngrok"
        >
          {status.ngrok.public_url && <p className="truncate font-mono">{status.ngrok.public_url}</p>}
          <p>{loop(status.ngrok_watchdog)}</p>
          <p data-testid="vps-self-heal">{t('vps.tile.selfHeal', { state: selfHeal })}</p>
          {lastReboot && <p>{t('vps.tile.selfHeal.lastReboot', { time: fmt.dateTime(lastReboot) })}</p>}
        </Tile>

        <Tile
          icon={<Bot size={14} />}
          title={t('vps.tile.bots')}
          hint={t('vps.tile.bots.hint')}
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
          hint={t('vps.tile.version.hint')}
          tone={status.git.branch === 'main' ? 'success' : 'warning'}
          value={status.version || '?'}
          testId="vps-tile-version"
        >
          <p className="font-mono">
            {status.git.branch || '?'} @ {status.git.commit || '?'}
          </p>
          {status.git.updated_at && <p>{t('vps.tile.updatedAt', { time: fmt.dateTime(status.git.updated_at) })}</p>}
          <p>{t('vps.tile.autoUpdate', { state: autoUpdate })}</p>
        </Tile>

        <Tile
          icon={<Power size={14} />}
          title={t('vps.tile.autostart')}
          hint={t('vps.tile.autostart.hint')}
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

        <Tile icon={<Cpu size={14} />} title={t('vps.tile.system')} hint={t('vps.tile.system.hint')} tone="success" value={status.hostname} testId="vps-tile-system">
          <p>{t('vps.tile.uptime', { time: uptime(status.uptime_minutes, t) })}</p>
        </Tile>
      </div>
    </div>
  );
}
