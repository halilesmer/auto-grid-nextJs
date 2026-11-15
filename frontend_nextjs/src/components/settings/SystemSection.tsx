'use client';

import { VERSION } from '@/app/version';
import { Button } from '@/components/ui/button';
import type { useSystemActions } from '@/hooks/useSystemActions';
import { useT } from '@/i18n';
import { DEV_PANEL_URL, isLocalHostname } from '@/lib/devPanel';
import { useAccountStore } from '@/store/useAccountStore';
import { SettingsRow } from './parts';

/** Sürüm, güncelleme ve worker'ı kapatma (yalnız admin). Diyaloglar SettingsDialog'da durur. */
export default function SystemSection({ system }: { system: ReturnType<typeof useSystemActions> }) {
  const t = useT();
  const activeAccount = useAccountStore((s) => s.activeAccount);
  const showDev = typeof window !== 'undefined' && isLocalHostname(window.location.hostname);

  return (
    <div data-testid="settings-system">
      <SettingsRow label={t('sdlg.sys.version')} desc={t('sdlg.sys.version.desc')}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[13px]" data-testid="settings-version">{VERSION}</span>
          <Button
            variant="outline"
            hint={t('sdlg.sys.check.hint')}
            data-testid="settings-sys-check"
            onClick={() => {
              system.setUpdateOpen(true);
              system.handleCheckUpdates();
            }}
          >
            {t('sdlg.sys.check')}
          </Button>
        </div>
      </SettingsRow>
      {showDev && (
        <SettingsRow label={t('sdlg.sys.dev')} desc={t('sdlg.sys.dev.desc')}>
          <Button
            variant="outline"
            hint={t('sdlg.sys.dev.open.hint')}
            onClick={() => window.open(DEV_PANEL_URL, '_blank', 'noopener,noreferrer')}
          >
            {t('sdlg.sys.dev.open')}
          </Button>
        </SettingsRow>
      )}
      <div className="mt-5 grid gap-3 rounded-xl border border-danger/35 bg-danger/5 px-5 py-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-center md:gap-6">
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-danger">{t('sdlg.sys.shutdown')}</span>
          <span className="text-[13px] text-muted-foreground">{t('sdlg.sys.shutdown.desc')}</span>
        </div>
        <div>
          <Button
            variant="danger"
            hint={activeAccount ? t('sdlg.sys.shutdown.btn.hint') : t('dashboard.shutdown.noAccount.hint')}
            disabled={!activeAccount}
            data-testid="settings-sys-shutdown"
            onClick={() => system.setShutdownOpen(true)}
          >
            {t('sdlg.sys.shutdown.btn')}
          </Button>
        </div>
      </div>
    </div>
  );
}
