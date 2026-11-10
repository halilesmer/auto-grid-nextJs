'use client';

import { ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/dropdown-menu';
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
 * Die Formationsknöpfe. Mit `onlyWithHits` zeigt die Reihe nur Formationen mit gezähltem Treffer auf `tf`
 * (Badge) und die gewählte; Formationen mit nur ungültigen oder frühen Kandidaten stehen im Menü dahinter (UI-25).
 * Ohne Kandidat steht `emptyNote` statt der Knöpfe. Ohne `onlyWithHits` gelten alle Formationen wie bisher.
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
  if (!onlyWithHits) return <FormButtons names={SCAN_FORMATIONS} hits={hits} form={form} onForm={onForm} optionHint={optionHint} />;
  // A candidate is any analysis of the formation on `tf`, also an invalid or a forming one without badge: the conditions explain why it fails
  const candidates = SCAN_FORMATIONS.filter((x) => hits.some((h) => h.form === x && h.tf === tf));
  if (candidates.length === 0) {
    return emptyNote ? <span className="px-1 text-xs text-muted-foreground" data-testid="formation-forms-empty">{emptyNote}</span> : null;
  }
  // Die Reihe zeigt nur gezählte Formationen (Badge) und die gewählte; die übrigen Kandidaten stehen im Menü dahinter (UI-25)
  const counted = candidates.filter((x) => x === form || hitsCount(hits, { form: x, tf }) > 0);
  const rest = candidates.filter((x) => !counted.includes(x));
  return (
    <>
      <FormButtons names={counted} hits={hits} tf={tf} form={form} onForm={onForm} optionHint={optionHint} />
      {rest.length > 0 && (
        <DropdownMenu
          label={t('formation.forms.more', { count: rest.length })}
          hint={t('formation.forms.more.hint')}
          variant="ghost"
          size="xs"
          align="left"
          panelClassName="w-60 p-1.5"
          floating
          triggerProps={{ 'data-testid': 'formation-forms-more', className: cn(segment, idle, 'h-6 gap-0.5 rounded-[5px] px-1.5 text-xs') }}
          icon={
            <>
              {counted.length === 0 && <span>{t('formation.forms.candidates')}</span>}
              <span className="tabular-nums text-[11px]">{rest.length}</span>
              <ChevronDown size={13} aria-hidden="true" />
            </>
          }
        >
          <div className="px-3 pb-1 pt-0.5 text-[11px] text-muted-foreground">{t('formation.forms.more.caption')}</div>
          {rest.map((x) => {
            const name = t(`formation.form.${x}` as MessageKey);
            const forming = hits.some((h) => h.form === x && h.tf === tf && h.candidate.verdict !== 'invalid');
            return (
              <DropdownMenuItem key={x} icon={null} hint={t('formation.forms.item.hint', { form: name })} data-testid={`formation-more-${x}`} onSelect={() => onForm(x)}>
                <span className="flex w-full items-center justify-between gap-3">
                  <span>{name}</span>
                  <span className="text-[11px] text-muted-foreground">{t(forming ? 'formation.forms.state.forming' : 'formation.forms.state.invalid')}</span>
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenu>
      )}
    </>
  );
}

function FormButtons({
  names,
  hits,
  tf,
  form,
  onForm,
  optionHint,
}: {
  names: readonly ScanFormation[];
  hits: readonly ScanHit[];
  /** Mit `tf` zählt das Badge nur diese Zeiteinheit, sonst alle */
  tf?: ContextTimeframe;
  form: ScanFormation;
  onForm: (form: ScanFormation) => void;
  optionHint?: (params: { form: string; count: number }) => string;
}) {
  const t = useT();
  return (
    <>
      {names.map((x) => {
        const count = hitsCount(hits, tf ? { form: x, tf } : { form: x });
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
