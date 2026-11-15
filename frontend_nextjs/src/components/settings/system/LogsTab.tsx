'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { Segmented } from '../parts';
import { LockedValue, SshBadge, SshLockNote, type SystemCtx } from './shared';

type Source = 'worker' | 'ngrok';
const EMPTY: string[] = [];

export default function LogsTab({ ctx }: { ctx: SystemCtx }) {
  const t = useT();
  const { vps, worker, sshLocked } = ctx;
  const [source, setSource] = useState<Source>('worker');
  const ngrok = source === 'ngrok';
  const boxRef = useRef<HTMLPreElement>(null);
  const stick = useRef(true);

  // Kaynak değişince ngrok logu SSH'tan okunur; worker logu worker üzerinden zaten gelir
  const { selectLog, setLogPolling } = vps;
  useEffect(() => {
    if (!ngrok || sshLocked) return undefined;
    selectLog('ngrok');
    setLogPolling(true);
    return () => setLogPolling(false);
  }, [ngrok, sshLocked, selectLog, setLogPolling]);

  const ngrokLines = sshLocked ? EMPTY : vps.logLines;
  const lines = ngrok ? ngrokLines : worker.lines;
  const note = ngrok ? vps.logNote : worker.error;
  const loading = ngrok && !sshLocked && vps.logLoading;

  useEffect(() => {
    stick.current = true;
  }, [source]);
  useEffect(() => {
    const el = boxRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const refresh = () => {
    if (ngrok) vps.refreshLogs();
    else void worker.refresh();
  };

  return (
    <div data-testid="settings-sys-logs">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 pt-5">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<Source>
            value={source}
            onChange={setSource}
            ariaLabel={t('sdlg.sys.log.source.aria')}
            testId="sys-log-source"
            options={[
              { value: 'worker', label: t('vps.log.tab.worker'), hint: t('vps.log.tab.worker.hint') },
              { value: 'ngrok', label: t('vps.log.tab.ngrok'), hint: t('vps.log.tab.ngrok.hint') },
            ]}
          />
          {ngrok && <SshBadge />}
          <span className="text-[13px] text-muted-foreground">{t('sdlg.sys.log.lines')}</span>
        </div>
        <Button
          variant="outline"
          loading={loading}
          disabled={ngrok && sshLocked}
          hint={ngrok && sshLocked ? t('sdlg.sys.ssh.locked.hint') : t('vps.log.refresh.hint')}
          data-testid="sys-log-refresh"
          onClick={refresh}
        >
          {!loading && <RefreshCw size={14} aria-hidden="true" />}
          {t('vps.log.refresh')}
        </Button>
      </div>
      {ngrok && <SshLockNote ctx={ctx} />}
      <pre
        ref={boxRef}
        onScroll={() => {
          const el = boxRef.current;
          if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        data-testid="sys-log-output"
        tabIndex={0}
        aria-label={t('sdlg.sys.log.output.aria')}
        className="mt-3 h-96 max-w-full overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground"
      >
        {lines.length > 0 && lines.join('\n')}
        {lines.length === 0 && ngrok && sshLocked && <LockedValue />}
        {lines.length === 0 && !(ngrok && sshLocked) && <span className="text-muted-foreground">{note || t('vps.log.empty')}</span>}
      </pre>
    </div>
  );
}
