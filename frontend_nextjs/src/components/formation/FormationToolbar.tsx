'use client';

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
        'ml-1.5 inline-block min-w-[18px] rounded-full px-1.5 text-center text-[11px] leading-[18px]',
        active ? 'bg-card text-primary' : 'bg-success text-white',
      )}
    >
      {count}
    </span>
  );
}

const segment = (active: boolean) =>
  cn(
    'inline-flex h-8 cursor-pointer items-center px-3 text-[13px] transition-colors',
    active ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground',
  );

/** Zeiteinheit und Formation wählen; die Badges zählen Treffer (gültig oder im Aufbau) über alle Zeiteinheiten bzw. Formationen. */
export function FormationToolbar({
  hits,
  tf,
  form,
  onTimeframe,
  onForm,
}: {
  hits: readonly ScanHit[];
  tf: ContextTimeframe;
  form: ScanFormation;
  onTimeframe: (tf: ContextTimeframe) => void;
  onForm: (form: ScanFormation) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2.5" data-testid="formation-toolbar">
      <div role="group" aria-label={t('formation.tf.label')} className="inline-flex overflow-hidden rounded-[10px] border border-border bg-card divide-x divide-border">
        {CONTEXT_TIMEFRAMES.map((x) => {
          const count = hitsCount(hits, { tf: x });
          return (
            <Tooltip key={x} content={t('formation.tf.option.hint', { tf: x, count })} role="presentation">
              <button type="button" aria-pressed={x === tf} data-testid={`formation-tf-${x}`} onClick={() => onTimeframe(x)} className={segment(x === tf)}>
                {x}
                <CountBadge count={count} active={x === tf} />
              </button>
            </Tooltip>
          );
        })}
      </div>
      <div role="group" aria-label={t('formation.form.label')} className="flex max-w-full flex-wrap overflow-hidden rounded-[10px] border border-border bg-card">
        {SCAN_FORMATIONS.map((x) => {
          const count = hitsCount(hits, { form: x });
          const name = t(`formation.form.${x}` as MessageKey);
          return (
            <Tooltip key={x} content={t('formation.form.option.hint', { form: name, count })} role="presentation">
              <button type="button" aria-pressed={x === form} data-testid={`formation-form-${x}`} onClick={() => onForm(x)} className={cn(segment(x === form), 'border-r border-border last:border-r-0')}>
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
