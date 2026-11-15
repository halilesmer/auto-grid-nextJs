'use client';

import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';
import { useT } from '@/i18n';
import { hostOf } from '@/lib/connectionCode';
import { useAuthStore } from '@/store/useAuthStore';
import { useConnectionDialogStore } from '@/store/useConnectionDialogStore';
import { useConnectionStore, type ConnectionStatus } from '@/store/useConnectionStore';
import { useSettingsDialogStore } from '@/store/useSettingsDialogStore';
import { SettingsRow } from './parts';

const TONES: Record<ConnectionStatus, 'success' | 'danger' | 'warning' | 'neutral'> = {
  unconfigured: 'neutral',
  checking: 'neutral',
  connected: 'success',
  unauthorized: 'warning',
  unreachable: 'danger',
  insecure: 'danger',
};

const mono = 'flex h-10 min-w-0 items-center truncate rounded-lg border border-border bg-background px-3.5 font-mono text-[13px]';

/** Bu cihazın bağlantısı: worker adresi ve anahtarı bu tarayıcıda kalır (useConnectionStore), VPS'e taşınmaz. */
export default function ConnectionSection() {
  const t = useT();
  const hydrated = useConnectionStore((s) => s.hydrated);
  const baseUrl = useConnectionStore((s) => s.baseUrl);
  const apiKey = useConnectionStore((s) => s.apiKey);
  const status = useConnectionStore((s) => s.status);
  const me = useAuthStore((s) => s.me);
  const showConnection = useConnectionDialogStore((s) => s.show);
  const hide = useSettingsDialogStore((s) => s.hide);

  const shown: ConnectionStatus = hydrated ? status : 'checking';
  const role = me ? t(me.role === 'admin' ? 'sdlg.conn.role.admin' : 'sdlg.conn.role.user') : t('sdlg.conn.role.unknown');

  return (
    <div data-testid="settings-connection">
      <SettingsRow label={t('sdlg.conn.status')}>
        <span className="inline-flex items-center gap-2" data-testid="settings-conn-status" data-status={shown}>
          <StatusDot tone={TONES[shown]} pulse={shown === 'checking'} />
          {t(`connection.status.${shown}`)}
        </span>
      </SettingsRow>
      <SettingsRow label={t('sdlg.conn.host')}>
        <span className={mono} data-testid="settings-conn-host">{baseUrl ? hostOf(baseUrl) : '—'}</span>
      </SettingsRow>
      <SettingsRow label={t('sdlg.conn.key')}>
        <span className={mono}>{apiKey ? '••••••••••••' : t('sdlg.conn.key.none')}</span>
      </SettingsRow>
      <SettingsRow label={t('sdlg.conn.role')}>
        <span data-testid="settings-conn-role">{role}</span>
      </SettingsRow>
      <div className="py-5">
        <Button
          variant="outline"
          hint={t('sdlg.conn.change.hint')}
          data-testid="settings-conn-change"
          onClick={() => {
            hide();
            showConnection();
          }}
        >
          {t('sdlg.conn.change')}
        </Button>
      </div>
    </div>
  );
}
