'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT, type MessageKey } from '@/i18n';
import { VPS_LOGS, type VpsLog } from '@/lib/vps';
import { Segmented } from '../parts';
import { LockedValue, SshBadge, SshLockNote, type SystemCtx } from './shared';

type Source = VpsLog;
const LABEL_KEYS: Record<Source, MessageKey> = {
  worker: 'vps.log.tab.worker',
  ngrok: 'vps.log.tab.ngrok',
  update: 'vps.log.tab.update',
  tunnel: 'vps.log.tab.tunnel',
};
const HINT_KEYS: Record<Source, MessageKey> = {
  worker: 'vps.log.tab.worker.hint',
  ngrok: 'vps.log.tab.ngrok.hint',
  update: 'vps.log.tab.update.hint',
  tunnel: 'vps.log.tab.tunnel.hint',
};
const EMPTY: string[] = [];

export default function LogsTab({ ctx }: { ctx: SystemCtx }) {
  const t = useT();
  const { vps, worker, sshLocked, sshPending } = ctx;
  const [source, setSource] = useState<Source>('worker');
  // worker logu worker'dan gelir; öbürleri SSH ile okunur
  const viaSsh = source !== 'worker';
  const boxRef = useRef<HTMLPreElement>(null);
  const stick = useRef(true);

  // Kaynak değişince ngrok logu SSH'tan okunur; worker logu worker üzerinden zaten gelir
  const { selectLog, setLogPolling } = vps;
  useEffect(() => {
    if (!viaSsh || sshLocked) return undefined;
    selectLog(source);
    setLogPolling(true);
    return () => setLogPolling(false);
  }, [viaSsh, source, sshLocked, selectLog, setLogPolling]);

  const sshLines = sshLocked ? EMPTY : vps.logLines;
  const lines = viaSsh ? sshLines : worker.lines;
  const loading = viaSsh && !sshLocked && vps.logLoading;
  // Worker logu okunamadıysa „log boş“ denmez: neden gösterilir, eski satırlar eski diye işaretlenir (F6)
  const workerLogError = !viaSsh ? worker.logError : null;
  const note = viaSsh ? vps.logNote : null;
  // start.bat'taki yeniden başlatma döngüsü olmadan log dosyası oluşmaz
  const st = vps.status;
  let missing: string | null = null;
  if (!sshLocked && st) {
    if (source === 'ngrok' && !st.ngrok_watchdog) missing = t('vps.log.hint.ngrok');
    if (source === 'worker' && !st.worker_watchdog) missing = t('vps.log.hint.worker');
  }

  useEffect(() => {
    stick.current = true;
  }, [source]);
  useEffect(() => {
    const el = boxRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const refresh = () => {
    if (viaSsh) vps.refreshLogs();
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
            options={VPS_LOGS.map((id) => ({ value: id, label: t(LABEL_KEYS[id]), hint: t(HINT_KEYS[id]) }))}
          />
          {viaSsh && <SshBadge />}
          <span className="text-[13px] text-muted-foreground">{t('sdlg.sys.log.lines')}</span>
        </div>
        <Button
          variant="outline"
          loading={loading}
          disabled={viaSsh && (sshLocked || sshPending)}
          hint={viaSsh && sshLocked ? t('sdlg.sys.ssh.locked.hint') : t('vps.log.refresh.hint')}
          data-testid="sys-log-refresh"
          onClick={refresh}
        >
          {!loading && <RefreshCw size={14} aria-hidden="true" />}
          {t('vps.log.refresh')}
        </Button>
      </div>
      {viaSsh && <SshLockNote ctx={ctx} />}
      {missing && (
        <p role="note" data-testid="sys-log-missing" className="mb-3 rounded-lg border border-warning/35 bg-warning/[0.06] px-4 py-3 text-[13px] leading-relaxed">
          {missing}
        </p>
      )}
      {workerLogError && (
        <div role="alert" data-testid="sys-log-error" className="mb-3 rounded-lg border border-danger/30 bg-danger/[0.06] px-4 py-3 text-[13px]">
          <p className="break-words font-medium text-foreground">{t('sdlg.sys.log.readFailed', { reason: workerLogError })}</p>
          {lines.length > 0 && (
            <p data-testid="sys-log-stale" className="mt-0.5 text-muted-foreground">
              {t('sdlg.sys.log.stale')}
            </p>
          )}
        </div>
      )}
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
        {lines.length === 0 && viaSsh && sshLocked && <LockedValue />}
        {lines.length === 0 && !(viaSsh && sshLocked) && !workerLogError && <span className="text-muted-foreground">{note || t('vps.log.empty')}</span>}
      </pre>
    </div>
  );
}
