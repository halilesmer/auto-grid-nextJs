'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, RotateCcw, ScrollText } from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import { toast } from '@/components/ui/animated-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useT } from '@/i18n';
import { getApiErrorMessage } from '@/lib/apiError';
import { axiosInstance } from '@/lib/api';
import { stripAnsi } from '@/lib/vps';
import { uptime } from './VpsStatusPanel';

// Öffentliche Version (Vercel): die SSH-Route ist aus, der Worker-Admin-Zugang (API-Key im Browser)
// steuert stattdessen den Worker direkt – Status, Neustart und Konsolenlog (VPS-09).
// Bewusst nur lokaler State wie useVps: niemand sonst braucht diese Daten.

interface WorkerStatus {
  version: string;
  uptime_sec: number | null;
  supervised: boolean;
  bots_running: number;
  bots_total: number;
}

const POLL_MS = 15_000;
const FAST_POLL_MS = 3_000;
const FAST_POLL_DURATION_MS = 60_000;

function Tile({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-sm font-semibold text-foreground" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

export default function VpsOnlinePanel() {
  const t = useT();
  const [status, setStatus] = useState<WorkerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const fastUntil = useRef(0);
  // Erst wenn der Worker nach dem Neustart-Befehl einmal weg war (oder nach Ablauf) gilt er als wieder da
  const restartedAt = useRef(0);
  const sawDown = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [st, log] = await Promise.all([
        axiosInstance.get<WorkerStatus>('/system/worker/status'),
        axiosInstance.get<{ lines: string[] }>('/system/worker/log', { params: { lines: 300 } }),
      ]);
      setStatus(st.data);
      setLines((log.data.lines ?? []).map(stripAnsi));
      setError(null);
      if (restartedAt.current && (sawDown.current || Date.now() - restartedAt.current > FAST_POLL_DURATION_MS)) {
        restartedAt.current = 0;
        sawDown.current = false;
        setRestarting(false);
      }
    } catch (err) {
      if (restartedAt.current) sawDown.current = true;
      setError(await getApiErrorMessage(err, t('vps.online.loadFailed')));
    }
  }, [t]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const loop = async () => {
      await refresh();
      if (cancelled) return;
      timer = setTimeout(loop, Date.now() < fastUntil.current ? FAST_POLL_MS : POLL_MS);
    };
    void loop();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [refresh]);

  const restart = async () => {
    setConfirmOpen(false);
    setRestarting(true);
    try {
      await axiosInstance.post('/system/restart');
      toast.success(t('vps.online.restarting'), { title: t('vps.action.restart') });
      restartedAt.current = Date.now();
      sawDown.current = false;
      fastUntil.current = Date.now() + FAST_POLL_DURATION_MS;
    } catch (err) {
      setRestarting(false);
      toast.error(await getApiErrorMessage(err, t('vps.action.failed')), { title: t('vps.action.restart') });
    }
  };

  return (
    <>
      <Card data-testid="vps-online">
        <CardHeader
          title={t('vps.online.title')}
          description={t('vps.online.subtitle')}
          icon={<ScrollText size={16} />}
          actions={
            <Button size="icon-sm" variant="ghost" onClick={() => void refresh()} aria-label={t('vps.refresh')} hint={t('vps.refresh.hint')}>
              <RefreshCw size={14} />
            </Button>
          }
        />
        <CardContent className="space-y-4">
          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/[0.06] p-3 text-xs text-foreground" data-testid="vps-online-error">
              {error}
            </p>
          )}
          {status && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <Tile label={t('vps.online.version')} value={status.version || '–'} testId="vps-online-version" />
                <Tile label={t('vps.online.uptime')} value={status.uptime_sec == null ? '–' : uptime(Math.floor(status.uptime_sec / 60), t)} testId="vps-online-uptime" />
                <Tile
                  label={t('vps.online.bots')}
                  value={t('vps.online.botsValue', { running: status.bots_running, total: status.bots_total })}
                  testId="vps-online-bots"
                />
              </div>
              {!status.supervised && (
                <p className="text-xs text-warning" data-testid="vps-online-unsupervised">
                  {t('vps.online.unsupervised')}
                </p>
              )}
            </>
          )}
          <Button
            onClick={() => setConfirmOpen(true)}
            loading={restarting}
            disabled={restarting || !status?.supervised}
            hint={status?.supervised === false ? t('vps.online.unsupervised') : t('vps.online.restart.hint')}
            data-testid="vps-online-restart"
          >
            <RotateCcw size={16} />
            {t('vps.action.restart')}
          </Button>
          <pre
            data-testid="vps-online-log"
            className="h-80 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground"
          >
            {lines.length > 0 ? lines.join('\n') : <span className="text-muted-foreground">{t('vps.log.empty')}</span>}
          </pre>
        </CardContent>
      </Card>

      {/* Außerhalb der Card: deren backdrop-blur würde das fixed-Modal auf die Card begrenzen */}
      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={restart}
        title={t('vps.action.confirmTitle', { action: t('vps.action.restart') })}
        message={t('vps.online.restart.message')}
        variant="warning"
        confirmLabel={t('vps.action.restart')}
        confirmHint={t('vps.online.restart.hint')}
      />
    </>
  );
}
