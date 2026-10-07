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

interface SymbolLogLinesProps {
  error: string | null;
  lines: string[] | null;
  setupIds: string[];
}

function SymbolLogLines({ error, lines, setupIds }: SymbolLogLinesProps) {
  const t = useT();
  if (error) return <span className="text-danger">{error}</span>;
  if (lines === null) return <span className="text-muted-foreground/60">{t('zone.logs.loading')}</span>;
  if (lines.length === 0) return <span className="text-muted-foreground/60">{t('zone.logs.empty')}</span>;
  // Tek setup'ta satırın kime ait olduğu belli; birden fazlasında satır setup numarasıyla başlar
  const showSetup = setupIds.length > 1;
  return (
    <>
      {lines.map((line, i) => {
        const { zoneId, text } = splitZoneTag(line);
        // Kart başlığıyla aynı numara; 0 = bu arada silinmiş setup'ın eski yanıtı
        const setupNo = zoneId ? setupIds.indexOf(zoneId) + 1 : 0;
        return (
          <span key={i} className={logLineColor(line)}>
            {showSetup && (
              <span data-testid="log-setup-badge" className="mr-1.5 rounded bg-primary/15 px-1 py-px text-[10.5px] font-semibold text-primary">
                {setupNo > 0 ? t('zone.setup.title', { n: setupNo }) : t('logs.zoneBadge.unknown')}
              </span>
            )}
            {text}
            {'\n'}
          </span>
        );
      })}
    </>
  );
}

/** Sembolün tüm setup'larının robot logları ("[Z:<id>]" etiketli satırlar); yalnızca açıkken yoklanır. */
export function SymbolLogs({ setupIds }: { setupIds: string[] }) {
  const t = useT();
  const accountId = useAccountStore((s) => s.selectedAccount);
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  // Üst bileşen her render'da yeni bir dizi verir (canlı veri, alan girişi); sorgu ve yoklama
  // yalnız id'ler değişince yeniden başlar
  const idsKey = JSON.stringify(setupIds);

  const fetchLogs = useCallback(async () => {
    if (!accountId) return;
    try {
      const zoneIds: string[] = JSON.parse(idsKey); // idsKey bir string[]'den üretildi
      setLines(await zoneApi.getSymbolLogs(accountId, zoneIds, LINES));
      setError(null);
    } catch (err) {
      setError(await getApiErrorMessage(err, t('logs.loadFailed')));
    }
  }, [accountId, idsKey, t]);

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
          <SymbolLogLines error={error} lines={lines} setupIds={setupIds} />
        </pre>
      )}
    </div>
  );
}
