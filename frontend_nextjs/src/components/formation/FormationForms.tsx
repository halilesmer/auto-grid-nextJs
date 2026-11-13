'use client';

import { Check, ChevronDown, CircleDashed, Clock, Eye, EyeOff } from 'lucide-react';
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Tooltip } from '@/components/ui/tooltip';
import { useT, type MessageKey } from '@/i18n';
import type { ContextTimeframe } from '@/lib/formation/params';
import { checkScore } from '@/lib/formation/score';
import { formState, hitsCount, reasonOf, SCAN_FORMATIONS, type HitState, type ScanFormation, type ScanHit } from '@/lib/formation/scan';
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
  hidden,
  onToggle,
  toggleHint,
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
  /** Aç/kapa (1112-A1): verilirse seçili düğmeye yeniden tık `onToggle` çağırır; `hidden` çizimin gizli olduğunu gösterir */
  hidden?: boolean;
  onToggle?: () => void;
  /** Gizli/açık durumuna göre ayrı ipucu (yalnız `onToggle` ile) */
  toggleHint?: (params: { form: string; count: number; hidden: boolean }) => string;
}) {
  const t = useT();
  if (!onlyWithHits) return <FormButtons names={SCAN_FORMATIONS} hits={hits} form={form} onForm={onForm} optionHint={optionHint} hidden={hidden} onToggle={onToggle} toggleHint={toggleHint} />;
  // A candidate is any analysis of the formation on `tf`, also an invalid or a forming one without badge: the conditions explain why it fails
  const candidates = SCAN_FORMATIONS.filter((x) => hits.some((h) => h.form === x && h.tf === tf));
  if (candidates.length === 0) {
    return emptyNote ? <span className="px-1 text-xs text-muted-foreground" data-testid="formation-forms-empty">{emptyNote}</span> : null;
  }
  // Die Reihe zeigt gültige, im Aufbau befindliche und nahe Kandidaten (1113-A4) und die gewählte; die übrigen stehen im Menü dahinter (UI-25)
  const counted = candidates.filter((x) => x === form || formState(hits, x, tf)?.state !== 'other');
  const rest = candidates.filter((x) => !counted.includes(x));
  return (
    <>
      <FormButtons names={counted} hits={hits} tf={tf} form={form} onForm={onForm} optionHint={optionHint} hidden={hidden} onToggle={onToggle} toggleHint={toggleHint} />
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
            const best = formState(hits, x, tf);
            const score = best ? checkScore(best.hit.candidate) : null;
            const reason = best ? reasonOf(best.hit) : null;
            return (
              <DropdownMenuItem key={x} icon={null} hint={t('formation.forms.item.hint', { form: name })} data-testid={`formation-more-${x}`} onSelect={() => onForm(x)}>
                <span className="flex w-full items-center justify-between gap-3">
                  <span>{name}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground" data-testid={`formation-more-why-${x}`}>
                    {score && `${score.requiredMet}/${score.requiredTotal}`}
                    {reason && ` · ${t(reason.kind === 'exclusion' ? 'formation.forms.reason.exclusion' : 'formation.forms.reason.missing', { id: reason.id })}`}
                  </span>
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenu>
      )}
    </>
  );
}

/** Look je Zustand (1113-A4): Farbe = Zustand, Füllung = Auswahl; „nah dran“ behält den gestrichelten Rahmen */
const STATE_ICON = { valid: Check, forming: Clock, near: CircleDashed, other: null } as const;

function stateLook(state: HitState | null, selected: boolean, off: boolean): string {
  if (!state) {
    if (!selected) return idle;
    return off ? 'border border-primary text-primary hover:bg-accent' : 'bg-primary text-primary-foreground';
  }
  if (state === 'valid') return selected && !off ? 'bg-success text-success-foreground' : cn('text-success hover:bg-accent', selected && 'border border-success');
  if (state === 'forming') return selected && !off ? 'bg-warning text-warning-foreground' : cn('text-warning hover:bg-accent', selected && 'border border-warning');
  return cn('border border-dashed border-warning/60 text-warning', selected && !off ? 'bg-warning/15' : 'hover:bg-accent');
}

function FormButtons({
  names,
  hits,
  tf,
  form,
  onForm,
  optionHint,
  hidden = false,
  onToggle,
  toggleHint,
}: {
  names: readonly ScanFormation[];
  hits: readonly ScanHit[];
  /** Mit `tf` zählt das Badge nur diese Zeiteinheit, sonst alle */
  tf?: ContextTimeframe;
  form: ScanFormation;
  onForm: (form: ScanFormation) => void;
  optionHint?: (params: { form: string; count: number }) => string;
  hidden?: boolean;
  onToggle?: () => void;
  toggleHint?: (params: { form: string; count: number; hidden: boolean }) => string;
}) {
  const t = useT();
  return (
    <>
      {names.map((x) => {
        const count = hitsCount(hits, tf ? { form: x, tf } : { form: x });
        const name = t(`formation.form.${x}` as MessageKey);
        const selected = x === form;
        const toggling = !!onToggle && selected;
        const off = toggling && hidden;
        const best = tf ? formState(hits, x, tf) : null;
        const state: HitState | null = best && best.state !== 'other' ? best.state : null;
        const score = best ? checkScore(best.hit.candidate) : null;
        const look = stateLook(state, selected, off);
        const StateIcon = state ? STATE_ICON[state] : null;
        const Icon = off ? EyeOff : Eye;
        const countHint = optionHint ? optionHint({ form: name, count }) : t('formation.form.option.hint', { form: name, count });
        const plainHint =
          state && score
            ? t('formation.forms.stateBtn.hint', { form: name, state: t(`formation.forms.state.${state}` as MessageKey), met: score.requiredMet, total: score.requiredTotal })
            : countHint;
        const hint = toggling && toggleHint ? toggleHint({ form: name, count, hidden }) : plainHint;
        return (
          <Tooltip key={x} content={hint} role="presentation">
            <button
              type="button"
              aria-pressed={selected && !off}
              aria-label={state && score ? t('formation.forms.aria', { form: name, state: t(`formation.forms.state.${state}` as MessageKey), met: score.requiredMet, total: score.requiredTotal }) : undefined}
              data-state={state ?? undefined}
              data-keep={selected ? '' : undefined}
              data-hidden={off ? '' : undefined}
              data-testid={`formation-form-${x}`}
              onClick={() => (toggling && onToggle ? onToggle() : onForm(x))}
              className={cn(segment, 'h-6', look)}
            >
              {toggling && <Icon size={12} className="mr-1" aria-hidden="true" />}
              {StateIcon && <StateIcon size={12} className="mr-1 shrink-0" aria-hidden="true" />}
              {name}
              {state === 'near' && score && <span className="ml-1 text-[10px] tabular-nums opacity-85">{score.requiredMet}/{score.requiredTotal}</span>}
              <CountBadge count={count} active={selected && !off && state !== 'near'} />
            </button>
          </Tooltip>
        );
      })}
    </>
  );
}
