'use client';

import type { ReactNode } from 'react';
import { Check as CheckIcon, Minus, X } from 'lucide-react';
import { VerdictPill } from '@/components/formation/CandidateList';
import { Tooltip } from '@/components/ui/tooltip';
import { useFormat, useLocale, useT, type MessageKey } from '@/i18n';
import { ruleText } from '@/lib/formation/ruleTexts';
import { FINAL_POINT, type ScanHit } from '@/lib/formation/scan';
import type { Check, RuleKind } from '@/lib/formation/types';
import { cn } from '@/lib/utils';

const GROUPS: RuleKind[] = ['required', 'bonus', 'exclusion'];

type RowState = 'met' | 'unmet' | 'excluded' | 'clear' | 'unmeasurable';

/** Ausschlüsse sind Ereignisse: „erfüllt“ heißt, das Ereignis liegt vor (ausgelöst) */
const rowState = (c: Check): RowState => {
  if (c.state === 'unmeasurable') return 'unmeasurable';
  if (c.kind === 'exclusion') return c.state === 'met' ? 'excluded' : 'clear';
  return c.state;
};

const ICON_STYLE: Record<RowState, string> = {
  met: 'border-success bg-success/10 text-success',
  clear: 'border-success bg-success/10 text-success',
  unmet: 'border-danger bg-danger/10 text-danger',
  excluded: 'border-danger bg-danger/20 text-danger',
  unmeasurable: 'border-dashed border-muted-foreground text-muted-foreground',
};

const GLYPH: Record<RowState, ReactNode> = {
  met: <CheckIcon size={13} strokeWidth={3} />,
  clear: <CheckIcon size={13} strokeWidth={3} />,
  unmet: <span className="block h-2.5 w-2.5 rounded-[2px] border-[1.5px] border-current" />,
  excluded: <X size={13} strokeWidth={3} />,
  unmeasurable: <Minus size={13} strokeWidth={3} />,
};

function StateIcon({ state }: { state: RowState }) {
  const t = useT();
  return (
    <span role="img" aria-label={t(`formation.state.${state}` as MessageKey)} className={cn('grid h-5 w-5 place-items-center rounded-md border-[1.5px]', ICON_STYLE[state])}>
      {GLYPH[state]}
    </span>
  );
}

/** Checkliste des gewählten Kandidaten: Kopf mit Urteil und Zählern, drei Gruppen, Fußzeile mit Legende. */
export function FormationChecklist({
  hit,
  active,
  onActive,
}: {
  hit: ScanHit;
  active: readonly string[] | null;
  onActive: (ids: string[] | null) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const { number } = useFormat();
  const { candidate } = hit;
  const required = candidate.checks.filter((c) => c.kind === 'required');
  const bonus = candidate.checks.filter((c) => c.kind === 'bonus');
  const requiredMet = required.filter((c) => c.state === 'met').length;
  const requiredUnmeasurable = required.filter((c) => c.state === 'unmeasurable').length;
  const bonusMet = bonus.filter((c) => c.state === 'met').length;
  const share = (n: number) => (required.length === 0 ? 0 : (n / required.length) * 100);
  const title = `${t(`formation.form.${hit.form}` as MessageKey)} ${t(`formation.side.${candidate.side}` as MessageKey)}`;
  const open = candidate.points[FINAL_POINT[hit.form]] === undefined;
  const blockers = candidate.checks.filter((c) => (c.kind === 'exclusion' ? c.state === 'met' : c.kind === 'required' && c.state === 'unmet')).map((c) => c.id);
  let note: string | null = null;
  if (candidate.verdict === 'forming' && open) note = t('formation.note.forming', { point: FINAL_POINT[hit.form] });
  else if (candidate.verdict === 'invalid' && blockers.length > 0) note = t('formation.note.invalid', { ids: blockers.join(', ') });
  const activeSet = active ? new Set(active) : null;

  return (
    <div data-testid="formation-checklist">
      <div className="flex flex-col gap-2 px-3 pb-2 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-[15px]">{title}</strong>
          <VerdictPill verdict={candidate.verdict} />
        </div>
        <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[13px]">
          <span data-testid="score-required">
            {t('formation.score.required')} <b className="tabular-nums">{requiredMet}/{required.length}</b>
            {requiredUnmeasurable > 0 && <span className="text-muted-foreground"> ({t('formation.score.unmeasurable', { n: requiredUnmeasurable })})</span>}
          </span>
          <span data-testid="score-bonus">
            {t('formation.score.bonus')} <b className="tabular-nums">{bonusMet}/{bonus.length}</b>
          </span>
        </div>
        <div className="flex h-1.5 overflow-hidden rounded-[3px] bg-muted" aria-hidden="true">
          <span className="block h-full bg-success" style={{ width: `${share(requiredMet)}%` }} />
          <span className="block h-full bg-danger" style={{ width: `${share(required.length - requiredMet - requiredUnmeasurable)}%` }} />
          <span className="block h-full bg-muted-foreground opacity-40" style={{ width: `${share(requiredUnmeasurable)}%` }} />
        </div>
        {note && <div className="rounded-lg border border-warning/35 bg-warning/10 px-2.5 py-1.5 text-xs text-warning">{note}</div>}
      </div>
      {GROUPS.map((kind) => {
        const rows = candidate.checks.filter((c) => c.kind === kind);
        if (rows.length === 0) return null;
        return (
          <section key={kind} className="border-t border-border" data-testid={`group-${kind}`}>
            <h3 className="px-3 pb-0.5 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t(`formation.group.${kind}` as MessageKey)}</h3>
            {rows.map((c) => {
              const state = rowState(c);
              const highlighted = activeSet !== null && c.drawings.some((d) => activeSet.has(d));
              return (
                <div
                  key={c.id}
                  tabIndex={0}
                  data-testid="check-row"
                  data-rule-id={c.id}
                  data-state={state}
                  data-on={highlighted ? 'true' : 'false'}
                  onMouseEnter={() => onActive(c.drawings)}
                  onFocus={() => onActive(c.drawings)}
                  onMouseLeave={() => onActive(null)}
                  onBlur={() => onActive(null)}
                  className={cn('grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-2 px-3 py-1.5 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary', highlighted && 'bg-muted')}
                >
                  <StateIcon state={state} />
                  <span className="min-w-0">
                    <span className={cn('block text-sm', state === 'unmeasurable' && 'text-muted-foreground')}>
                      {ruleText(locale, c.id) ?? c.id}
                      {c.status !== 'confirmed' && (
                        <Tooltip content={t(`formation.mark.${c.status}.hint` as MessageKey)} role="presentation">
                          <span className="ml-1 cursor-help rounded-[5px] border border-border px-1 text-[10px] text-muted-foreground">{t(`formation.mark.${c.status}` as MessageKey)}</span>
                        </Tooltip>
                      )}
                    </span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">{c.id}</span>
                  </span>
                  <span className="text-right text-xs tabular-nums text-muted-foreground">{c.value === undefined ? '' : number(c.value, { maximumFractionDigits: 3 })}</span>
                </div>
              );
            })}
          </section>
        );
      })}
      <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 px-3 pb-3 pt-2 text-xs text-muted-foreground">
        <span>{t('formation.legend.secondary')}</span>
        <span>{t('formation.legend.assumption')}</span>
        <span>{t('formation.legend.unmeasurable')}</span>
      </div>
    </div>
  );
}
