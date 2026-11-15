'use client';

import { VERSION } from '@/app/version';
import { Button } from '@/components/ui/button';
import AutoUpdateRow from '@/components/vps/AutoUpdateRow';
import { useT } from '@/i18n';
import { SettingsRow } from '../parts';
import type { SystemCtx } from './shared';

export default function UpdateTab({ ctx }: { ctx: SystemCtx }) {
  const t = useT();
  const { system, worker, vps } = ctx;
  // VPS'te ayarlı değer (SSH okunabiliyorsa): worker cevap vermezse satır bunu gösterir
  const minutes = vps.status?.auto_update_minutes;
  let configured: string | undefined;
  if (vps.status) configured = minutes === '0' ? t('vps.tile.autoUpdate.off') : t('vps.tile.autoUpdate.every', { minutes: minutes || 5 });
  const open = () => {
    system.setUpdateOpen(true);
    system.handleCheckUpdates();
  };
  return (
    <div data-testid="settings-sys-update">
      <SettingsRow label={t('sdlg.sys.version')} desc={t('sdlg.sys.version.desc')}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[13px]" data-testid="settings-version">{VERSION}</span>
          <Button variant="outline" hint={t('sdlg.sys.check.hint')} data-testid="settings-sys-check" onClick={open}>
            {t('sdlg.sys.check')}
          </Button>
        </div>
      </SettingsRow>
      <SettingsRow label={t('sdlg.sys.autoupdate')} desc={t('sdlg.sys.autoupdate.desc')} testId="sys-row-autoupdate">
        <AutoUpdateRow status={worker.error ? null : (worker.status?.auto_update ?? null)} readAt={worker.readAt} configured={configured} />
      </SettingsRow>
      <div className="mt-5 grid gap-3 rounded-xl border border-warning/35 bg-warning/5 px-5 py-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-center md:gap-6">
        <div className="flex flex-col gap-1">
          <span className="font-semibold">{t('sdlg.sys.apply')}</span>
          <span className="text-[13px] leading-snug text-muted-foreground">{t('sdlg.sys.apply.desc')}</span>
        </div>
        <div>
          <Button variant="warning" hint={t('sdlg.sys.apply.btn.hint')} data-testid="settings-sys-apply" onClick={open}>
            {t('sdlg.sys.apply.btn')}
          </Button>
        </div>
      </div>
    </div>
  );
}
