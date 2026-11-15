'use client';

import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';
import { useFormat, useT, type MessageKey } from '@/i18n';
import { runConnectionCheck } from '@/lib/connectionCheck';
import { hostOf } from '@/lib/connectionCode';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/useAuthStore';
import { useConnectionDialogStore } from '@/store/useConnectionDialogStore';
import { useConnectionStore, type ConnectionStatus } from '@/store/useConnectionStore';
import { useSettingsDialogStore } from '@/store/useSettingsDialogStore';
import { SettingsRow } from './parts';
import { ACTION_KEY } from './connectionUi';

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
  const failure = useConnectionStore((s) => s.failure);
  const lastCheckedAt = useConnectionStore((s) => s.lastCheckedAt);
  const lastOkAt = useConnectionStore((s) => s.lastOkAt);
  const probing = useConnectionStore((s) => s.probing);
  const f = useFormat();
  const me = useAuthStore((s) => s.me);
  const showConnection = useConnectionDialogStore((s) => s.show);
  const hide = useSettingsDialogStore((s) => s.hide);

  const shown: ConnectionStatus = hydrated ? status : 'checking';
  // Anahtar reddedildiyse rol güvenilir değil (önceki anahtardan kalmış olabilir)
  const role = me && shown !== 'unauthorized' ? t(me.role === 'admin' ? 'sdlg.conn.role.admin' : 'sdlg.conn.role.user') : t('sdlg.conn.role.unknown');
  const when = (ms: number | null) => (ms ? f.time(ms) : t('sdlg.conn.meta.none'));

  // Hata durumunda sebep: mevcut connection.test.* metinleri
  const cause = ((): string | null => {
    if (shown === 'insecure') return t('connection.test.insecure');
    if (shown === 'unauthorized') return t(failure?.reason === 'missingKey' ? 'connection.test.missingKey' : 'connection.test.unauthorized');
    if (shown !== 'unreachable') return null;
    if (failure?.reason === 'timeout') return t('connection.test.timeout');
    if (failure?.reason === 'notWorker') return t('connection.test.notWorker');
    if (failure?.ngrokCode) return t('connection.test.unreachable.ngrok', { code: failure.ngrokCode });
    return t('connection.test.unreachable');
  })();
  const action = shown in ACTION_KEY ? ACTION_KEY[shown as keyof typeof ACTION_KEY] : null;
  const openDialog = () => {
    hide();
    showConnection();
  };

  return (
    <div data-testid="settings-connection">
      <SettingsRow label={t('sdlg.conn.status')}>
        <div className="flex flex-col gap-1.5">
          <span className="inline-flex items-center gap-2" data-testid="settings-conn-status" data-status={shown}>
            <StatusDot tone={TONES[shown]} pulse={shown === 'checking'} />
            {t(`connection.status.${shown}`)}
          </span>
          {baseUrl && (
            <span className="text-xs text-muted-foreground" data-testid="settings-conn-meta">
              {probing ? t('sdlg.cb.checking') : t('sdlg.conn.meta', { checked: when(lastCheckedAt), ok: when(lastOkAt) })}
            </span>
          )}
          {cause && (
            <p
              role="alert"
              data-testid="settings-conn-cause"
              className={cn(
                'mt-1 rounded-lg border px-3 py-2 text-[13px] leading-snug text-foreground/90',
                shown === 'unauthorized' ? 'border-warning/40 bg-warning/5' : 'border-danger/35 bg-danger/5',
              )}
            >
              {cause}
            </p>
          )}
        </div>
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
      <div className="flex flex-wrap gap-2 py-5">
        {shown === 'unreachable' && (
          <Button
            variant="outline"
            disabled={probing}
            hint={t('sdlg.conn.retry.hint')}
            data-testid="settings-conn-retry"
            onClick={() => void runConnectionCheck()}
          >
            {probing ? t('sdlg.cb.retrying') : t('sdlg.cb.retry')}
          </Button>
        )}
        <Button
          variant={action === 'connect' ? 'primary' : 'outline'}
          hint={t(action ? (`sdlg.cb.${action}.hint` as MessageKey) : 'sdlg.conn.change.hint')}
          data-testid="settings-conn-change"
          onClick={openDialog}
        >
          {t(action ? (`sdlg.cb.${action}` as MessageKey) : 'sdlg.conn.change')}
        </Button>
      </div>
    </div>
  );
}
