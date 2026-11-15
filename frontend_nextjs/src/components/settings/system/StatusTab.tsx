'use client';

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAccounts } from '@/components/account/hooks';
import { Button } from '@/components/ui/button';
import VpsElevatedWarning from '@/components/vps/VpsElevatedWarning';
import { selfHealState, uptime } from '@/components/vps/vpsFormat';
import { useFormat, useT } from '@/i18n';
import { DEV_PANEL_URL, isLocalHostname } from '@/lib/devPanel';
import { useAccountStore } from '@/store/useAccountStore';
import { SettingsRow } from '../parts';
import { LockedValue, SshBadge, SshLockNote, StateValue, type SystemCtx } from './shared';

export default function StatusTab({ ctx }: { ctx: SystemCtx }) {
  const t = useT();
  const fmt = useFormat();
  const { vps, worker, sshLocked } = ctx;
  const accounts = useAccountStore((s) => s.accounts);
  const { fetchAccounts } = useAccounts();
  const showDev = typeof window !== 'undefined' && isLocalHostname(window.location.hostname);

  // LIVE/DEMO rozeti kontrol listesine ihtiyaç duyar; yalnız yönetici botları varken yüklenir
  const hasElevatedBots = Boolean(vps.status?.elevated?.some((p) => p.role === 'bot'));
  useEffect(() => {
    if (hasElevatedBots && useAccountStore.getState().accounts.length === 0) fetchAccounts();
  }, [hasElevatedBots, fetchAccounts]);

  // Son okuma hatalıysa eski değerler gösterilmez
  const ws = worker.error ? null : worker.status;
  const st = vps.status;
  const lastReboot = st?.tunnel_watchdog?.reboots.at(-1);
  const autostartOk = Boolean(st?.autologon && st.tasks.start.exists);
  const on = (v: boolean) => (v ? t('vps.tile.on') : t('vps.tile.off'));
  const yes = (v: boolean) => (v ? t('vps.tile.yes') : t('vps.tile.no'));
  const loopState = (v: boolean) => (v ? t('vps.tile.loop.active') : t('vps.tile.loop.missing'));
  // Tünel süreci çalışıyor ama herkese açık adres cevap vermiyor (watchdog): uyarı
  const tunnelFailing = Boolean(st?.tunnel_watchdog?.failures) && st?.tunnel_watchdog?.last_result === 'tunnel-down';
  let ngrokTone: 'success' | 'warning' | 'danger' = 'success';
  if (st && !st.ngrok.running) ngrokTone = 'danger';
  else if (tunnelFailing) ngrokTone = 'warning';
  const refreshing = () => {
    void worker.refresh();
    void vps.refreshStatus();
  };

  /** SSH satırının değeri: kilitliyse kilit, okunuyorsa bekleme, aksi halde içerik. */
  const ssh = (render: () => React.ReactNode) => {
    if (sshLocked) return <LockedValue />;
    if (vps.loading) return <span className="text-sm text-muted-foreground">{t('sdlg.sys.ssh.loading')}</span>;
    if (!st) return <StateValue tone="danger" detail={vps.statusError}>{t('vps.status.unreachable')}</StateValue>;
    return render();
  };

  /** Worker satırı: son okuma hatalıysa eski „çalışıyor“ gösterilmez (F2), worker ulaşılamıyor sayılır. */
  const workerCell = () => {
    if (worker.error) {
      return (
        <StateValue tone="danger" detail={worker.error} testId="sys-worker-state">
          {t('sdlg.sys.worker.down')}
        </StateValue>
      );
    }
    if (!ws) {
      return (
        <StateValue tone="neutral" testId="sys-worker-state">
          {t('sdlg.sys.reading')}
        </StateValue>
      );
    }
    return (
      <StateValue
        tone="success"
        testId="sys-worker-state"
        detail={t('sdlg.sys.worker.detail', {
          version: ws.version || '–',
          uptime: ws.uptime_sec == null ? '–' : uptime(Math.floor(ws.uptime_sec / 60), t),
        })}
      >
        {t('sdlg.sys.worker.running')}
      </StateValue>
    );
  };

  return (
    <div data-testid="settings-sys-status">
      <SettingsRow label={t('sdlg.sys.worker')} desc={t('sdlg.sys.worker.desc')} testId="sys-row-worker">
        {workerCell()}
      </SettingsRow>
      <SettingsRow label={t('sdlg.sys.bots')} desc={t('sdlg.sys.bots.desc')} testId="sys-row-bots">
        {ws ? (
          <StateValue tone={ws.bots_running > 0 ? 'success' : 'neutral'} testId="sys-bots-state">
            {t('sdlg.sys.bots.value', { running: ws.bots_running, stopped: Math.max(ws.bots_total - ws.bots_running, 0) })}
          </StateValue>
        ) : (
          <span className="text-sm text-muted-foreground">–</span>
        )}
      </SettingsRow>
      <SettingsRow label={t('sdlg.sys.loop')} desc={t('sdlg.sys.loop.desc')} testId="sys-row-loop">
        {ws ? (
          <StateValue tone={ws.supervised ? 'success' : 'warning'} testId="sys-loop-state">
            {ws.supervised ? t('sdlg.sys.loop.on') : t('sdlg.sys.loop.off')}
          </StateValue>
        ) : (
          <span className="text-sm text-muted-foreground">–</span>
        )}
      </SettingsRow>

      <div className="mb-1 mt-7 flex flex-wrap items-center gap-2.5">
        <span className="text-[13px] font-semibold text-foreground/80">{t('sdlg.sys.group.vps')}</span>
        <SshBadge />
      </div>
      <SshLockNote ctx={ctx} />
      {!sshLocked && vps.statusError && st && (
        <div role="alert" data-testid="sys-ssh-stale" className="mt-4 rounded-lg border border-danger/30 bg-danger/[0.06] px-4 py-3 text-[13px]">
          <p className="font-medium text-foreground">{t('vps.status.unreachableStale')}</p>
          <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">{vps.statusError}</p>
        </div>
      )}

      {!sshLocked && st?.elevated && st.elevated.length > 0 && (
        <div className="mt-4">
          <VpsElevatedWarning
            processes={st.elevated}
            busy={vps.busy === 'fix-elevated'}
            disabled={vps.busy !== null}
            accounts={accounts}
            onFix={(stopBots) => vps.runAction('fix-elevated', { stopBots })}
          />
        </div>
      )}

      <SettingsRow label={t('sdlg.sys.ngrok')} desc={t('sdlg.sys.ngrok.desc')} testId="sys-row-ngrok">
        {ssh(() => (
          <StateValue
            tone={ngrokTone}
            detail={st!.ngrok.public_url ? <span className="font-mono text-xs">{st!.ngrok.public_url}</span> : undefined}
            testId="sys-ngrok-state"
          >
            {st!.ngrok.running ? t('vps.tile.ngrok.online') : t('vps.tile.ngrok.offline')}
          </StateValue>
        ))}
      </SettingsRow>
      <SettingsRow label={t('sdlg.sys.vpsver')} desc={t('sdlg.sys.vpsver.desc')} testId="sys-row-vpsver">
        {ssh(() => (
          <StateValue
            tone={st!.git.branch === 'main' ? 'success' : 'warning'}
            detail={
              <>
                <span className="font-mono text-xs">
                  {st!.git.branch || '?'} @ {st!.git.commit || '?'}
                </span>
                {st!.git.updated_at && <span className="block">{t('vps.tile.updatedAt', { time: fmt.dateTime(st!.git.updated_at) })}</span>}
              </>
            }
            testId="sys-vpsver-state"
          >
            {st!.version || '?'}
          </StateValue>
        ))}
      </SettingsRow>
      <SettingsRow label={t('sdlg.sys.host')} desc={t('sdlg.sys.host.desc')} testId="sys-row-host">
        {ssh(() => (
          <StateValue tone="success" detail={t('vps.tile.uptime', { time: uptime(st!.uptime_minutes, t) })} testId="sys-host-state">
            {st!.hostname}
          </StateValue>
        ))}
      </SettingsRow>
      <SettingsRow label={t('sdlg.sys.mt5')} desc={t('sdlg.sys.mt5.desc')} testId="sys-row-mt5">
        {ssh(() => (
          <StateValue tone="neutral" testId="sys-mt5-state">
            {t('sdlg.sys.mt5.value', { n: st!.mt5_terminals })}
          </StateValue>
        ))}
      </SettingsRow>
      <SettingsRow label={t('sdlg.sys.loops')} desc={t('sdlg.sys.loops.desc')} testId="sys-row-loops">
        {ssh(() => (
          <StateValue tone={st!.worker_watchdog && st!.ngrok_watchdog ? 'success' : 'warning'} testId="sys-loops-state">
            {t('sdlg.sys.loops.worker', { state: loopState(st!.worker_watchdog) })} · {t('sdlg.sys.loops.ngrok', { state: loopState(st!.ngrok_watchdog) })}
          </StateValue>
        ))}
      </SettingsRow>
      <SettingsRow label={t('sdlg.sys.heal')} desc={t('sdlg.sys.heal.desc')} testId="sys-row-heal">
        {ssh(() => (
          <StateValue
            tone={st!.tunnel_watchdog?.failures ? 'warning' : 'success'}
            detail={lastReboot ? t('vps.tile.selfHeal.lastReboot', { time: fmt.dateTime(lastReboot) }) : undefined}
            testId="sys-heal-state"
          >
            {selfHealState(st!, t)}
          </StateValue>
        ))}
      </SettingsRow>
      <SettingsRow label={t('sdlg.sys.autostart')} desc={t('sdlg.sys.autostart.desc')} testId="sys-row-autostart">
        {ssh(() => (
          <StateValue
            tone={autostartOk ? 'success' : 'warning'}
            detail={t('sdlg.sys.autostart.detail', {
              autologon: on(st!.autologon),
              task: st!.tasks.start.exists ? t('vps.tile.exists') : t('vps.tile.absent'),
              session: yes(st!.session_active),
            })}
            testId="sys-autostart-state"
          >
            {autostartOk ? t('vps.tile.autostart.ok') : t('vps.tile.autostart.incomplete')}
          </StateValue>
        ))}
      </SettingsRow>
      <SettingsRow label={t('sdlg.sys.elevated')} desc={t('sdlg.sys.elevated.desc')} testId="sys-row-elevated">
        {ssh(() => {
          const count = st!.elevated?.length ?? 0;
          return (
            <StateValue tone={count > 0 ? 'danger' : 'neutral'} testId="sys-elevated-state">
              {count > 0 ? t('sdlg.sys.elevated.count', { count }) : t('sdlg.sys.elevated.none')}
            </StateValue>
          );
        })}
      </SettingsRow>
      {showDev && (
        <SettingsRow label={t('sdlg.sys.dev')} desc={t('sdlg.sys.dev.desc')}>
          <Button variant="outline" hint={t('sdlg.sys.dev.open.hint')} onClick={() => window.open(DEV_PANEL_URL, '_blank', 'noopener,noreferrer')}>
            {t('sdlg.sys.dev.open')}
          </Button>
        </SettingsRow>
      )}

      <div className="flex flex-wrap items-center gap-3 py-5">
        <Button variant="outline" hint={t('sdlg.sys.refresh.hint')} onClick={refreshing} data-testid="sys-refresh">
          <RefreshCw size={14} aria-hidden="true" />
          {t('sdlg.sys.refresh')}
        </Button>
        {vps.refreshedAt && <span className="text-[13px] text-muted-foreground">{t('sdlg.sys.refreshed', { time: fmt.time(vps.refreshedAt) })}</span>}
      </div>
    </div>
  );
}
