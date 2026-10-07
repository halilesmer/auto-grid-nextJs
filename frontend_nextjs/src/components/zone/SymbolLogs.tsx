'use client';

import { ChevronDown, RefreshCw, ScrollText } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/apiError';
import { logLineColor, splitZoneTag } from '@/lib/logLines';
import { cn } from '@/lib/utils';
import { zoneApi } from '@/services/zoneApi';
import { useAccountStore } from '@/store';
import { useT } from '@/i18n';

const POLL_INTERVAL_MS = 10_000;
const LINES = 100;

function SymbolLogLines({ error, lines }: { error: string | null; lines: string[] | null }) {
  const t = useT();
  if (error) return <span className="text-danger">{error}</span>;
  if (lines === null) return <span className="text-muted-foreground/60">{t('zone.logs.loading')}</span>;
  if (lines.length === 0) return <span className="text-muted-foreground/60">{t('zone.logs.empty')}</span>;
  return (
    <>
      {lines.map((line, i) => (
        <span key={i} className={logLineColor(line)}>
          {splitZoneTag(line).text}
          {'\n'}
        </span>
      ))}
    </>
  );
}

/** Bölgenin kendi robot logları ("[Z:<id>]" etiketli satırlar); yalnızca açıkken yoklanır. */
export function SymbolLogs({ zoneId }: { zoneId: string }) {
  const t = useT();
  const accountId = useAccountStore((s) => s.selectedAccount);
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  const fetchLogs = useCallback(async () => {
    if (!accountId) return;
    try {
      setLines(await zoneApi.getZoneLogs(accountId, zoneId, LINES));
      setError(null);
    } catch (err) {
      setError(await getApiErrorMessage(err, t('logs.loadFailed')));
    }
  }, [accountId, zoneId, t]);

  useEffect(() => {
    if (!open) return;
    const first = setTimeout(fetchLogs, 0);
    const interval = setInterval(fetchLogs, POLL_INTERVAL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [open, fetchLogs]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines, open]);

  if (!accountId) return null;

  return (
    <div className="rounded-lg border border-border/60">
      <div className="flex items-center justify-between gap-2 px-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          hint={t('zone.logs.toggle.hint')}
          className="min-w-0"
        >
          <ScrollText size={14} />
          {t('zone.logs.toggle')}
          <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
        </Button>
        {open && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void fetchLogs()}
            hint={t('logs.refresh.hint')}
            aria-label={t('logs.refresh')}
          >
            <RefreshCw size={14} />
          </Button>
        )}
      </div>
      {open && (
        <pre
          ref={logRef}
          data-testid="zone-log-output"
          className="max-h-56 overflow-auto whitespace-pre-wrap break-all border-t border-border/60 bg-muted/60 p-3 font-mono text-[11.5px] leading-relaxed text-foreground/75 dark:bg-background/50"
        >
          <SymbolLogLines error={error} lines={lines} />
        </pre>
      )}
    </div>
  );
}
