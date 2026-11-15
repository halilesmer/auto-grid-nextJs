'use client';

import { useState } from 'react';
import ConfirmModal from '@/components/ConfirmModal';
import { Button } from '@/components/ui/button';
import { ACTION_TITLE_KEYS } from '@/components/vps/useVps';
import { useT, type MessageKey } from '@/i18n';
import { useAccountStore } from '@/store/useAccountStore';
import { SettingsRow } from '../parts';
import { SshBadge, SshLockNote, type SystemCtx } from './shared';

type Which = 'worker' | 'restart-ngrok' | 'reboot';

const CONFIRM: Record<Which, { message: MessageKey; info?: MessageKey; variant: 'warning' | 'danger'; hint: MessageKey }> = {
  worker: { message: 'vps.online.restart.message', variant: 'warning', hint: 'vps.online.restart.hint' },
  'restart-ngrok': { message: 'vps.confirm.restartNgrok.message', variant: 'warning', hint: 'vps.action.restartNgrok.hint' },
  reboot: { message: 'vps.confirm.reboot.message', info: 'vps.confirm.reboot.info', variant: 'danger', hint: 'vps.action.reboot.hint' },
};

export default function RestartTab({ ctx }: { ctx: SystemCtx }) {
  const t = useT();
  const { vps, worker, sshLocked } = ctx;
  const accounts = useAccountStore((s) => s.accounts);
  const [confirm, setConfirm] = useState<Which | null>(null);
  const cfg = confirm ? CONFIRM[confirm] : null;
  // Worker cevap vermiyorsa ve SSH açıksa aynı düğme worker'ı SSH ile yeniden başlatır (ölü worker'ı kurtarma yolu)
  const workerDown = !worker.status && Boolean(worker.error);
  const workerViaSsh = workerDown && !sshLocked;
  const busyElse = vps.busy !== null || worker.restarting;

  /** Onay penceresinde çalışan botlar ve LIVE/DEMO bilgisi (hesap listesi varsa). */
  const botsLine = () => {
    const bots = vps.status?.bots;
    if (bots) {
      if (bots.length === 0) return t('sdlg.sys.confirm.noBots');
      const list = bots
        .map((b) => {
          const a = accounts.find((x) => String(x.id) === b.account || String(x.login) === b.account);
          if (!a) return b.account;
          return `${b.account} (${a.env_type === 'LIVE' ? t('dashboard.env.live') : t('dashboard.env.demo')})`;
        })
        .join(', ');
      return t('sdlg.sys.confirm.bots', { accounts: list });
    }
    const n = worker.status?.bots_running;
    return n == null ? undefined : t('sdlg.sys.confirm.botsCount', { count: n });
  };

  const confirmMessage = () => {
    if (!cfg) return '';
    return confirm === 'worker' && workerViaSsh ? t('vps.confirm.restart.message') : t(cfg.message);
  };

  const run = async () => {
    const which = confirm;
    setConfirm(null);
    if (vps.busy !== null || worker.restarting) return;
    if (which === 'worker' && workerViaSsh) await vps.runAction('restart');
    else if (which === 'worker') await worker.restart();
    else if (which) await vps.runAction(which);
  };

  const info = cfg ? [cfg.info ? t(cfg.info) : null, botsLine()].filter(Boolean).join(' ') : '';
  const workerHint = () => {
    if (workerDown && sshLocked) return t('sdlg.sys.rs.worker.down.hint');
    if (workerViaSsh) return t('vps.action.restart.hint');
    if (worker.status?.supervised === false) return t('vps.online.unsupervised');
    return busyElse ? t('vps.busy.hint') : t('vps.online.restart.hint');
  };
  const title = (w: Which) => t(ACTION_TITLE_KEYS[w === 'worker' ? 'restart' : w]);
  const lockHint = t('sdlg.sys.ssh.locked.hint');
  /** SSH düğmesinin ipucu: kilit > başka işlem sürüyor > normal. */
  const sshHint = (normal: MessageKey) => {
    if (sshLocked) return lockHint;
    return busyElse ? t('vps.busy.hint') : t(normal);
  };

  return (
    <div data-testid="settings-sys-restart">
      <SettingsRow label={t('sdlg.sys.rs.worker')} desc={t('sdlg.sys.rs.worker.desc')}>
        <Button
          variant="warning"
          loading={worker.restarting || vps.busy === 'restart'}
          disabled={busyElse || (worker.status?.supervised === false && !workerViaSsh) || (workerDown && sshLocked)}
          hint={workerHint()}
          data-testid="sys-restart-worker"
          onClick={() => setConfirm('worker')}
        >
          {t('sdlg.sys.rs.btn')}
        </Button>
      </SettingsRow>

      <SshLockNote ctx={ctx} />

      <SettingsRow
        label={
          <span className="inline-flex flex-wrap items-center gap-2">
            {t('sdlg.sys.rs.ngrok')}
            <SshBadge short />
          </span>
        }
        desc={t('sdlg.sys.rs.ngrok.desc')}
      >
        <Button
          variant="warning"
          loading={vps.busy === 'restart-ngrok'}
          disabled={sshLocked || busyElse}
          hint={sshHint('vps.action.restartNgrok.hint')}
          data-testid="sys-restart-ngrok"
          onClick={() => setConfirm('restart-ngrok')}
        >
          {t('sdlg.sys.rs.btn')}
        </Button>
      </SettingsRow>

      <div className="mt-5 grid gap-3 rounded-xl border border-danger/35 bg-danger/5 px-5 py-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-center md:gap-6">
        <div className="flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-danger">{t('sdlg.sys.rs.reboot')}</span>
            <SshBadge short />
          </span>
          <span className="text-[13px] leading-snug text-muted-foreground">{t('sdlg.sys.rs.reboot.desc')}</span>
        </div>
        <div>
          <Button
            variant="danger"
            loading={vps.busy === 'reboot'}
            disabled={sshLocked || busyElse}
            hint={sshHint('vps.action.reboot.hint')}
            data-testid="sys-restart-reboot"
            onClick={() => setConfirm('reboot')}
          >
            {t('sdlg.sys.rs.reboot.btn')}
          </Button>
        </div>
      </div>

      <p className="mt-5 text-[13px] leading-relaxed text-muted-foreground">{t('sdlg.sys.rs.stopNote')}</p>

      <ConfirmModal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={run}
        title={confirm ? t('vps.action.confirmTitle', { action: title(confirm) }) : ''}
        message={confirmMessage()}
        infoText={info || undefined}
        variant={cfg?.variant ?? 'warning'}
        confirmLabel={confirm ? title(confirm) : t('confirm.ok')}
        confirmHint={cfg ? t(cfg.hint) : ''}
      />
    </div>
  );
}
