'use client';

import type { ReactNode } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { useT, type MessageKey } from '@/i18n';
import { CONTEXT_TIMEFRAMES, type ContextTimeframe } from '@/lib/formation/params';
import { hitsCount, SCAN_FORMATIONS, type ScanFormation, type ScanHit } from '@/lib/formation/scan';
import { cn } from '@/lib/utils';

function CountBadge({ count, active }: { count: number; active: boolean }) {
  if (count === 0) return null;
  return (
    <span
      data-testid="hit-badge"
      className={cn(
        'ml-1 inline-block min-w-[14px] rounded-full px-1 text-center text-[10px] font-semibold leading-[14px]',
        active ? 'bg-black/15 text-current' : 'bg-success/15 text-success',
      )}
    >
      {count}
    </span>
  );
}

const segment = 'inline-flex h-7 shrink-0 cursor-pointer items-center rounded-[5px] px-1.5 text-xs transition-colors';
const idle = 'text-muted-foreground hover:bg-accent hover:text-foreground';

/**
 * Kopfleiste im TradingView-Stil: `children` (Symbol und Konto) und Zeiteinheiten in der Leiste, Formationen in der
 * Zeile darunter. Die Badges zählen Treffer (gültig oder im Aufbau) über alle Zeiteinheiten bzw. Formationen.
 * Rechts bleibt ab lg Platz für die Werkzeuge des ChartWorkspace, die dort über der Leiste liegen.
 */
export function FormationToolbar({
  hits,
  tf,
  form,
  onTimeframe,
  onForm,
  actions,
  children,
}: {
  hits: readonly ScanHit[];
  tf: ContextTimeframe;
  form: ScanFormation;
  onTimeframe: (tf: ContextTimeframe) => void;
  onForm: (form: ScanFormation) => void;
  /** Knöpfe hinter den Zeiteinheiten (z. B. Bild der Formation) */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="bg-background" data-testid="formation-toolbar">
      <div className="flex min-w-0 flex-wrap items-center gap-x-1 border-b border-border px-2 lg:h-[38px] lg:flex-nowrap lg:pr-80" data-testid="formation-topbar">
        <div className="flex h-[38px] min-w-0 items-center gap-1 max-lg:w-full lg:h-auto" data-testid="formation-selectors">
          {children}
        </div>
        <span className="mx-1 hidden h-[22px] w-px shrink-0 bg-border lg:block" aria-hidden="true" />
        <div className="flex min-w-0 items-center gap-1 max-lg:w-full">
          <div role="group" aria-label={t('formation.tf.label')} className="flex h-[38px] min-w-0 items-center gap-0.5 overflow-x-auto max-lg:flex-1 lg:h-auto">
            {CONTEXT_TIMEFRAMES.map((x) => {
              const count = hitsCount(hits, { tf: x });
              return (
                <Tooltip key={x} content={t('formation.tf.option.hint', { tf: x, count })} role="presentation">
                  <button type="button" aria-pressed={x === tf} data-testid={`formation-tf-${x}`} onClick={() => onTimeframe(x)} className={cn(segment, x === tf ? 'bg-accent text-foreground' : idle)}>
                    {x}
                    <CountBadge count={count} active={false} />
                  </button>
                </Tooltip>
              );
            })}
          </div>
          {actions && (
            <>
              <span className="mx-1 hidden h-[22px] w-px shrink-0 bg-border lg:block" aria-hidden="true" />
              {actions}
            </>
          )}
        </div>
      </div>
      <div role="group" aria-label={t('formation.form.label')} className="flex h-[30px] items-center gap-0.5 overflow-x-auto border-b border-border px-2" data-testid="formation-forms">
        {SCAN_FORMATIONS.map((x) => {
          const count = hitsCount(hits, { form: x });
          const name = t(`formation.form.${x}` as MessageKey);
          return (
            <Tooltip key={x} content={t('formation.form.option.hint', { form: name, count })} role="presentation">
              <button type="button" aria-pressed={x === form} data-testid={`formation-form-${x}`} onClick={() => onForm(x)} className={cn(segment, 'h-6', x === form ? 'bg-primary text-primary-foreground' : idle)}>
                {name}
                <CountBadge count={count} active={x === form} />
              </button>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
