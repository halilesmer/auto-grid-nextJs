'use client';

import { Plug } from 'lucide-react';
import { StatusDot } from '@/components/ui/status-dot';
import { Tooltip } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { hostOf } from '@/lib/connectionCode';
import { cn } from '@/lib/utils';
import { useConnectionDialogStore } from '@/store/useConnectionDialogStore';
import { useConnectionStore, type ConnectionStatus } from '@/store/useConnectionStore';

const TONES: Record<ConnectionStatus, 'success' | 'danger' | 'warning' | 'neutral'> = {
  unconfigured: 'neutral',
  checking: 'neutral',
  connected: 'success',
  unauthorized: 'warning',
  unreachable: 'danger',
  insecure: 'danger',
};

/**
 * Verbindungsstatus zum Worker im Header; Klick öffnet den Verbindungsdialog.
 * `bar` = schmale Zeile unter dem Header (Handy), `inline` = Chip in der Kopfzeile (ab `sm`).
 */
export default function ConnectionChip({ variant }: { variant: 'inline' | 'bar' }) {
  const t = useT();
  const hydrated = useConnectionStore((s) => s.hydrated);
  const baseUrl = useConnectionStore((s) => s.baseUrl);
  const status = useConnectionStore((s) => s.status);
  const show = useConnectionDialogStore((s) => s.show);

  // Vor dem Lesen des Speichers weder „nicht verbunden" noch „VPS verbinden" zeigen (Flackern)
  const shown: ConnectionStatus = hydrated ? status : 'checking';
  const statusText = t(`connection.status.${shown}`);
  const target = baseUrl ? hostOf(baseUrl) : t('connection.chip.connect');
  const label = hydrated ? target : statusText;
  const bar = variant === 'bar';

  return (
    <Tooltip
      content={t('connection.chip.hint', { status: statusText })}
      className={bar ? 'flex w-full sm:hidden' : 'hidden sm:flex'}
    >
      <button
        type="button"
        data-testid={bar ? 'connection-chip-bar' : 'connection-chip'}
        data-status={shown}
        aria-label={`${t('connection.chip.aria', { status: statusText })}${baseUrl ? ` (${label})` : ''}`}
        onClick={() => show()}
        className={cn(
          'flex min-w-0 cursor-pointer items-center gap-2 text-xs font-medium text-foreground transition-colors',
          bar
            ? 'h-8 w-full justify-center border-t border-border bg-muted/40 px-4 hover:bg-muted/70'
            : 'h-8 max-w-[14rem] rounded-lg border border-border bg-muted/50 px-2.5 hover:bg-muted',
        )}
      >
        <StatusDot tone={TONES[shown]} pulse={shown === 'checking'} />
        <Plug size={13} className="shrink-0 text-muted-foreground" />
        <span className="truncate">{label}</span>
        {baseUrl && <span className="hidden shrink-0 text-muted-foreground lg:inline">· {statusText}</span>}
      </button>
    </Tooltip>
  );
}
