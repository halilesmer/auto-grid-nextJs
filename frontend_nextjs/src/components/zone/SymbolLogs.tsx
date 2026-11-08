'use client';

import { RefreshCw, ScrollText, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/apiError';
import { logLineColor, splitZoneTag } from '@/lib/logLines';
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

/**
 * Sembol kartı log panelinin durumunu setup'larına verir (1108-A5 K1): `openFor` panelin hangi setup'ın altında
 * açık olduğunu söyler; bir sembolün tüm setup menüleri aynı paneli açar.
 */
export interface SymbolLogsContextValue {
  symbol: string;
  setupIds: string[];
  openFor: string | null;
  show: (zoneId: string) => void;
  close: () => void;
}

export const SymbolLogsContext = createContext<SymbolLogsContextValue | null>(null);

/** Sembol kartının dışında (ör. tek başına render edilen ZoneCard) null: menüde "Sembol logları" görünmez. */
export function useSymbolLogs() {
  return useContext(SymbolLogsContext);
}

/**
 * Sembolün tüm setup'larının robot logları ("[Z:<id>]" etiketli satırlar). Panel, açılan setup'ın başlığının
 * altında sağa hizalı durur; yalnızca açıkken yoklanır. Escape ve dışarı tıklama kapatır.
 */
export function SymbolLogsPanel({ zoneId }: { zoneId: string }) {
  const t = useT();
  const ctx = useSymbolLogs();
  const accountId = useAccountStore((s) => s.selectedAccount);
  const [lines, setLines] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const open = ctx?.openFor === zoneId;
  const close = ctx?.close;
  const setupIds = ctx?.setupIds;
  // Üst bileşen her render'da yeni bir dizi verir (canlı veri, alan girişi); sorgu ve yoklama
  // yalnız id'ler değişince yeniden başlar
  const idsKey = JSON.stringify(setupIds ?? []);

  // Schließen per Escape oder Button: Fokus zurück auf das ⋯ des Setups, das das Panel geöffnet hat
  const closeAndRestoreFocus = useCallback(() => {
    const trigger = panelRef.current?.closest('[data-testid="zone-card"]')?.querySelector<HTMLElement>('[data-zone-menu-trigger]');
    close?.();
    trigger?.focus();
  }, [close]);

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
    if (!open) {
      // Alte Zeilen gelten nicht für die nächste Öffnung (Setup-Nummern können sich geändert haben)
      const reset = setTimeout(() => {
        setLines(null);
        setError(null);
      }, 0);
      return () => clearTimeout(reset);
    }
    const first = setTimeout(fetchLogs, 0);
    const interval = setInterval(fetchLogs, POLL_INTERVAL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [open, fetchLogs]);

  useEffect(() => {
    if (!open || !close) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAndRestoreFocus();
    };
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, close, closeAndRestoreFocus]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines, open]);

  if (!ctx || !open || !accountId) return null;

  return (
    <div
      ref={panelRef}
      data-testid="symbol-logs-panel"
      role="region"
      aria-label={t('zone.logs.toggle')}
      className="absolute inset-x-2 top-full z-20 mt-1 ml-auto max-w-[600px] overflow-hidden rounded-lg border border-border bg-popover shadow-[var(--shadow-float)] sm:inset-x-4"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <ScrollText size={14} aria-hidden className="shrink-0 text-muted-foreground" />
        <span className="shrink-0 text-xs font-semibold text-foreground">{t('zone.logs.toggle')}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
          {t('zone.logs.subtitle', { symbol: ctx.symbol.toUpperCase(), lines: LINES })}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void fetchLogs()}
          hint={t('logs.refresh.hint')}
          aria-label={t('logs.refresh')}
        >
          <RefreshCw size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={closeAndRestoreFocus}
          hint={t('zone.logs.close.hint')}
          aria-label={t('zone.logs.close')}
        >
          <X size={14} />
        </Button>
      </div>
      <pre
        ref={logRef}
        data-testid="zone-log-output"
        className="h-[200px] overflow-auto whitespace-pre-wrap break-all bg-muted/60 p-3 font-mono text-[11.5px] leading-relaxed text-foreground/75 dark:bg-background/50"
      >
        <SymbolLogLines error={error} lines={lines} setupIds={ctx.setupIds} />
      </pre>
    </div>
  );
}
