'use client';

import { useEffect, useRef } from 'react';
import { RefreshCw, ScrollText } from 'lucide-react';
import AnimatedTabs from '@/components/ui/animated-tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StatusDot } from '@/components/ui/status-dot';
import { VPS_LOGS, type VpsLog, type VpsStatus } from '@/lib/vps';
import { t as tStatic, useT, type MessageKey } from '@/i18n';

const LABEL_KEYS: Record<VpsLog, MessageKey> = {
  worker: 'vps.log.tab.worker',
  ngrok: 'vps.log.tab.ngrok',
  update: 'vps.log.tab.update',
};

// Beide Logdateien schreiben erst die Neustart-Schleifen aus start.bat
// (run_uvicorn_watchdog.bat -> worker_console.log, run_ngrok_watchdog.bat -> ngrok.log)
function missingLogHint(logName: VpsLog, status: VpsStatus | null, t: typeof tStatic): string | null {
  if (!status) return null;
  if (logName === 'ngrok' && !status.ngrok_watchdog) {
    return t('vps.log.hint.ngrok');
  }
  if (logName === 'worker' && !status.worker_watchdog) {
    return t('vps.log.hint.worker');
  }
  return null;
}

interface Props {
  logName: VpsLog;
  status: VpsStatus | null;
  lines: string[];
  note: string | null;
  loading: boolean;
  onSelect: (log: VpsLog) => void;
  onRefresh: () => void;
}

export default function VpsLogViewer({ logName, status, lines, note, loading, onSelect, onRefresh }: Props) {
  const t = useT();
  const hint = missingLogHint(logName, status, t);
  const scrollRef = useRef<HTMLPreElement>(null);
  // Das Log lädt alle 15 s neu: nur ans Ende springen, wenn man schon unten war
  const stickToBottom = useRef(true);

  useEffect(() => {
    stickToBottom.current = true;
  }, [logName]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  return (
    <Card>
      <CardHeader
        title={t('vps.log.title')}
        description={t('vps.log.subtitle')}
        icon={<ScrollText size={16} />}
        actions={
          <Button size="icon-sm" variant="ghost" onClick={onRefresh} loading={loading} aria-label={t('vps.log.refresh')}>
            {!loading && <RefreshCw size={14} />}
          </Button>
        }
      />
      <CardContent className="space-y-3">
        <AnimatedTabs
          tabs={VPS_LOGS.map((id) => ({ id, label: t(LABEL_KEYS[id]) }))}
          activeTab={logName}
          onChange={(id) => onSelect(id as VpsLog)}
          variant="segment"
          layoutId="vps-log-tabs"
        />
        {hint && (
          <div
            data-testid="vps-log-hint"
            className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/[0.06] p-3 text-xs text-foreground"
          >
            <StatusDot tone="warning" className="mt-1" />
            <p>{hint}</p>
          </div>
        )}
        <pre
          ref={scrollRef}
          onScroll={onScroll}
          data-testid="vps-log-output"
          className="h-96 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground"
        >
          {lines.length > 0 ? lines.join('\n') : <span className="text-muted-foreground">{note || t('vps.log.empty')}</span>}
        </pre>
      </CardContent>
    </Card>
  );
}
