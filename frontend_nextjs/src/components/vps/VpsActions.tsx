'use client';

import { useState } from 'react';
import { ArrowRight, CheckCircle2, DownloadCloud, Globe, Power, RefreshCw, RotateCcw } from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { VpsUpdateCheck } from '@/lib/vps';
import { useT, type MessageKey } from '@/i18n';
import { ACTION_TITLE_KEYS, type PostAction } from './useVps';

// Admin-Prozesse beenden hat seinen eigenen Knopf in der Warnung (VpsElevatedWarning)
type ButtonAction = Exclude<PostAction, 'fix-elevated'>;

const CONFIRM: Record<ButtonAction, { message: MessageKey; info?: MessageKey; variant: 'warning' | 'danger' }> = {
  update: { message: 'vps.confirm.update.message', info: 'vps.confirm.update.info', variant: 'warning' },
  restart: { message: 'vps.confirm.restart.message', info: 'vps.confirm.restart.info', variant: 'warning' },
  'restart-ngrok': { message: 'vps.confirm.restartNgrok.message', variant: 'warning' },
  reboot: { message: 'vps.confirm.reboot.message', info: 'vps.confirm.reboot.info', variant: 'danger' },
};

interface Props {
  busy: PostAction | 'check-update' | null;
  updateCheck: VpsUpdateCheck | null;
  onCheckUpdate: () => void;
  onAction: (action: PostAction) => Promise<void>;
  workerRunning: boolean;
}

export default function VpsActions({ busy, updateCheck, onCheckUpdate, onAction, workerRunning }: Props) {
  const t = useT();
  const [confirm, setConfirm] = useState<ButtonAction | null>(null);
  const cfg = confirm ? CONFIRM[confirm] : null;

  return (
    <>
      <Card>
        <CardHeader title={t('vps.ctrl.title')} description={t('vps.ctrl.subtitle')} icon={<Power size={16} />} />
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 p-3" data-testid="vps-update">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <p className="font-medium text-foreground">{t('vps.ctrl.updates')}</p>
                <p className="text-xs text-muted-foreground">
                  {workerRunning ? t('vps.ctrl.updates.worker') : t('vps.ctrl.updates.noWorker')}
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
                {t('vps.ctrl.check')}
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
                    {t('vps.ctrl.upToDate', { version: updateCheck.local_ver })}
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
              {t('vps.action.update')}
            </Button>
            <Button
              onClick={() => setConfirm('restart')}
              loading={busy === 'restart'}
              disabled={busy !== null}
              data-testid="vps-action-restart"
            >
              <RotateCcw size={16} />
              {t('vps.action.restart')}
            </Button>
            <Button
              onClick={() => setConfirm('restart-ngrok')}
              loading={busy === 'restart-ngrok'}
              disabled={busy !== null}
              data-testid="vps-action-restart-ngrok"
            >
              <Globe size={16} />
              {t('vps.action.restartNgrok')}
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
              {t('vps.action.reboot')}
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
        title={confirm ? t('vps.action.confirmTitle', { action: t(ACTION_TITLE_KEYS[confirm]) }) : ''}
        message={cfg ? t(cfg.message) : ''}
        infoText={cfg?.info ? t(cfg.info) : undefined}
        variant={cfg?.variant ?? 'warning'}
        confirmLabel={confirm ? t(ACTION_TITLE_KEYS[confirm]) : t('confirm.ok')}
      />
    </>
  );
}
