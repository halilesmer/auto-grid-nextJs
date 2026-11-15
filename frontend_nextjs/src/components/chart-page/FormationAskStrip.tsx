'use client';

import { Loader2, ScanSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import type { AskPhase } from '@/hooks/useFormationAsk';

interface FormationAskStripProps {
  phase: AskPhase;
  symbol: string;
  onYes: () => void;
  onNo: () => void;
  onRetry: () => void;
}

/**
 * Dünne Leiste im Hinweisbereich unter der Kopfleiste (1114-A1.1; wie früher der Ladehinweis, so bleibt die Höhe der Kopfleiste gleich): fragt, ob für das Symbol nach Formationen gesucht wird, zeigt die laufende
 * Suche mit Fortschrittslinie und den Fehler mit „Tekrar dene“. Kein Modal: der Chart bleibt bedienbar.
 */
export function FormationAskStrip({ phase, symbol, onYes, onNo, onRetry }: FormationAskStripProps) {
  const t = useT();
  if (phase === 'idle' || phase === 'declined') return null;
  const shell = 'pointer-events-auto w-fit max-w-full overflow-hidden rounded-lg border border-border bg-card/95 text-xs shadow-sm backdrop-blur';
  if (phase === 'running') {
    return (
      <div className={shell} role="status" data-testid="formation-ask-running">
        <div className="flex items-center gap-2 px-3 py-1.5 text-muted-foreground">
          <Loader2 size={13} className="shrink-0 animate-spin" aria-hidden="true" />
          <span className="min-w-0">{t('formation.ask.running')}</span>
        </div>
        <div className="relative h-0.5 bg-accent" aria-hidden="true">
          <div className="absolute inset-y-0 left-0 w-1/3 animate-[ask-slide_1.2s_ease-in-out_infinite] bg-primary motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-50" />
        </div>
      </div>
    );
  }
  const failed = phase === 'failed';
  return (
    <div className={shell} data-testid={failed ? 'formation-ask-failed' : 'formation-ask'}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-1.5">
        <span className="flex min-w-[12rem] flex-1 items-center gap-2">
          <ScanSearch size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0">{failed ? t('formation.ask.failed', { symbol }) : t('formation.ask.question', { symbol })}</span>
        </span>
        <span className="flex gap-1.5">
          {failed ? (
            <Button size="xs" variant="outline" hint={t('formation.ask.retry.hint')} data-testid="formation-ask-retry" onClick={onRetry}>{t('formation.ask.retry')}</Button>
          ) : (
            <>
              <Button size="xs" variant="primary" hint={t('formation.ask.yes.hint')} data-testid="formation-ask-yes" onClick={onYes}>{t('formation.ask.yes')}</Button>
              <Button size="xs" variant="outline" hint={t('formation.ask.no.hint')} data-testid="formation-ask-no" onClick={onNo}>{t('formation.ask.no')}</Button>
            </>
          )}
        </span>
      </div>
    </div>
  );
}
