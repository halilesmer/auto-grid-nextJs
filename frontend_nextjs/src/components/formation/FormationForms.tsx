'use client';

import { Tooltip } from '@/components/ui/tooltip';
import { useT, type MessageKey } from '@/i18n';
import type { ContextTimeframe } from '@/lib/formation/params';
import { hitsCount, SCAN_FORMATIONS, type ScanFormation, type ScanHit } from '@/lib/formation/scan';
import { cn } from '@/lib/utils';

export function CountBadge({ count, active }: { count: number; active: boolean }) {
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

export const segment = 'inline-flex h-7 shrink-0 cursor-pointer items-center rounded-[5px] px-1.5 text-xs transition-colors';
export const idle = 'text-muted-foreground hover:bg-accent hover:text-foreground';

/**
 * Die Formationsknöpfe. Mit `onlyWithHits` zeigt die Reihe nur Formationen mit einem Treffer auf `tf`;
 * ohne Treffer steht `emptyNote` statt der Knöpfe. Ohne `onlyWithHits` gelten alle Formationen wie bisher.
 */
export function FormationForms({
  hits,
  tf,
  form,
  onForm,
  onlyWithHits = false,
  emptyNote,
  optionHint,
}: {
  hits: readonly ScanHit[];
  tf: ContextTimeframe;
  form: ScanFormation;
  onForm: (form: ScanFormation) => void;
  onlyWithHits?: boolean;
  /** Kurzer Hinweis, wenn auf `tf` kein Treffer steht (nur mit `onlyWithHits`); der Aufrufer übersetzt ihn */
  emptyNote?: string;
  /** Eigener Hinweistext je Knopf (der Standard sagt „über alle Zeiteinheiten“, was mit `onlyWithHits` nicht gilt) */
  optionHint?: (params: { form: string; count: number }) => string;
}) {
  const t = useT();
  const shown = onlyWithHits ? SCAN_FORMATIONS.filter((x) => hitsCount(hits, { form: x, tf }) > 0) : SCAN_FORMATIONS;
  if (onlyWithHits && shown.length === 0) {
    return emptyNote ? <span className="px-1 text-xs text-muted-foreground" data-testid="formation-forms-empty">{emptyNote}</span> : null;
  }
  return (
    <>
      {shown.map((x) => {
        // Die Zahl zählt über alle Zeiteinheiten, außer die Reihe ist auf `tf` gefiltert
        const count = hitsCount(hits, onlyWithHits ? { form: x, tf } : { form: x });
        const name = t(`formation.form.${x}` as MessageKey);
        return (
          <Tooltip key={x} content={optionHint ? optionHint({ form: name, count }) : t('formation.form.option.hint', { form: name, count })} role="presentation">
            <button type="button" aria-pressed={x === form} data-keep={x === form ? '' : undefined} data-testid={`formation-form-${x}`} onClick={() => onForm(x)} className={cn(segment, 'h-6', x === form ? 'bg-primary text-primary-foreground' : idle)}>
              {name}
              <CountBadge count={count} active={x === form} />
            </button>
          </Tooltip>
        );
      })}
    </>
  );
}
