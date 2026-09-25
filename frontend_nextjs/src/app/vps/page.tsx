'use client';

import { Loader2, RefreshCw, ServerOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import VpsActions from '@/components/vps/VpsActions';
import VpsElevatedWarning from '@/components/vps/VpsElevatedWarning';
import VpsLogViewer from '@/components/vps/VpsLogViewer';
import VpsStatusPanel from '@/components/vps/VpsStatusPanel';
import { useVps } from '@/components/vps/useVps';
import { useFormat, useT } from '@/i18n';

// `...` im Text wird als <code> dargestellt
function withCode(text: string) {
  return text.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));
}

export default function VpsPage() {
  const vps = useVps();
  const t = useT();
  const fmt = useFormat();

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-2 text-xs text-muted-foreground">{t('vps.eyebrow')}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{t('vps.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('vps.subtitle')}
          </p>
        </div>
        {!vps.disabled && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {vps.refreshedAt && <span>{t('vps.updated', { time: fmt.time(vps.refreshedAt) })}</span>}
            <Button size="icon-sm" variant="ghost" onClick={() => void vps.refreshStatus()} aria-label={t('vps.refresh')} hint={t('vps.refresh.hint')}>
              <RefreshCw size={14} />
            </Button>
          </div>
        )}
      </header>

      {vps.loading ? (
        <Card className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t('vps.connecting')}
        </Card>
      ) : vps.disabled ? (
        <Card className="p-5" data-testid="vps-disabled">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ServerOff size={16} className="text-muted-foreground" />
            {t('vps.disabled.title')}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{vps.disabled}</p>
          <p className="mt-2 text-xs text-muted-foreground">{withCode(t('vps.disabled.help'))}</p>
        </Card>
      ) : (
        <>
          <VpsElevatedWarning
            processes={vps.status?.elevated ?? []}
            busy={vps.busy === 'fix-elevated'}
            disabled={vps.busy !== null}
            onFix={() => vps.runAction('fix-elevated')}
          />
          <VpsStatusPanel status={vps.status} sshError={vps.statusError} />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <VpsActions
              busy={vps.busy}
              updateCheck={vps.updateCheck}
              onCheckUpdate={() => void vps.checkUpdate()}
              onAction={vps.runAction}
              workerRunning={Boolean(vps.status?.worker.reachable)}
            />
            <VpsLogViewer
              logName={vps.logName}
              status={vps.status}
              lines={vps.logLines}
              note={vps.logNote}
              loading={vps.logLoading}
              onSelect={vps.selectLog}
              onRefresh={vps.refreshLogs}
            />
          </div>
        </>
      )}
    </div>
  );
}
