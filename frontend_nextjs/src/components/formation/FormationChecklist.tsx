'use client';

import { useState, type ReactNode } from 'react';
import { Check as CheckIcon, ChevronDown, ChevronRight, Minus, Slash, X } from 'lucide-react';
import { InfoHint, Tooltip } from '@/components/ui/tooltip';
import { useFormat, useLocale, useT, type MessageKey } from '@/i18n';
import { ruleText } from '@/lib/formation/ruleTexts';
import { FINAL_POINT, type ScanHit } from '@/lib/formation/scan';
import { checkScore } from '@/lib/formation/score';
import { blockingUnknowns, exemptFor } from '@/lib/formation/settle';
import type { Check, RuleKind } from '@/lib/formation/types';
import { cn } from '@/lib/utils';

const GROUPS: RuleKind[] = ['required', 'bonus', 'exclusion'];

type RowState = 'met' | 'unmet' | 'excluded' | 'clear' | 'unmeasurable' | 'inactive';

/** Ausschlüsse sind Ereignisse: „erfüllt“ heißt, das Ereignis liegt vor (ausgelöst) */
export const checkRowState = (c: Check): RowState => {
  if (c.inactive) return 'inactive';
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
  inactive: 'border-border bg-muted text-muted-foreground',
};

const GLYPH: Record<RowState, ReactNode> = {
  met: <CheckIcon size={13} strokeWidth={3} />,
  clear: <CheckIcon size={13} strokeWidth={3} />,
  unmet: <span className="block h-2.5 w-2.5 rounded-[2px] border-[1.5px] border-current" />,
  excluded: <X size={13} strokeWidth={3} />,
  unmeasurable: <Minus size={13} strokeWidth={3} />,
  inactive: <Slash size={13} strokeWidth={3} />,
};

export function StateIcon({ state }: { state: RowState }) {
  const t = useT();
  return (
    <span role="img" aria-label={t(`formation.state.${state}` as MessageKey)} className={cn('grid h-5 w-5 place-items-center rounded-md border-[1.5px]', ICON_STYLE[state])}>
      {GLYPH[state]}
    </span>
  );
}

/** Checkliste des gewählten Kandidaten (Reiter „Bedingungen“): Zähler mit Balken, drei einklappbare Gruppen, Legende im (i)-Tooltip. */
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
  const [collapsed, setCollapsed] = useState<ReadonlySet<RuleKind>>(new Set());
  const { candidate } = hit;
  const { hasInactive, requiredTotal, requiredMet, requiredUnmeasurable, bonusTotal, bonusMet } = checkScore(candidate);
  const share = (n: number) => (requiredTotal === 0 ? 0 : (n / requiredTotal) * 100);
  // Offen heißt: der Endpunkt fehlt und ist noch nicht gemessen; bei `pointHeld` ist er gemessen, nur das Urteil hält ihn zurück
  const open = candidate.points[FINAL_POINT[hit.form]] === undefined && !candidate.pointHeld;
  // Dasselbe Prädikat wie im Prüfer: der Hinweis nennt nur Regeln, die das Urteil „gültig“ wirklich halten
  const unknownIds = blockingUnknowns(candidate.checks, exemptFor(hit.form, candidate.checks));
  const notes: string[] = [];
  let noteHint = false;
  if (candidate.verdict === 'forming' && candidate.pointHeld) notes.push(t('formation.note.held', { point: FINAL_POINT[hit.form] }));
  else if (candidate.verdict === 'forming' && open) notes.push(t('formation.note.forming', { point: FINAL_POINT[hit.form] }));
  if (candidate.verdict === 'forming' && unknownIds.length > 0 && !open) {
    notes.push(t('formation.note.unmeasurable', { ids: unknownIds.join(', ') }));
    noteHint = true;
  } else if (candidate.verdict === 'invalid' && candidate.invalidBy && candidate.invalidBy.length > 0) notes.push(t('formation.note.invalid', { ids: candidate.invalidBy.join(', ') }));
  const activeSet = active ? new Set(active) : null;
  const toggleGroup = (kind: RuleKind) => {
    const next = new Set(collapsed);
    if (!next.delete(kind)) next.add(kind);
    setCollapsed(next);
  };
  const legend = (
    <div className="flex flex-col gap-1" data-testid="checklist-legend">
      <span>{t('formation.legend.secondary')}</span>
      <span>{t('formation.legend.assumption')}</span>
      <span>{t('formation.legend.unmeasurable')}</span>
      <span>{t('formation.legend.clear')}</span>
      {hasInactive && <span>{t('formation.legend.inactive')}</span>}
    </div>
  );

  return (
    <div data-testid="formation-checklist">
      <div className="flex flex-col gap-2 px-3 pb-2 pt-1">
        <div className="flex items-center gap-x-3.5 text-xs">
          <span data-testid="score-required">
            {t('formation.score.required')} <b className="tabular-nums">{requiredMet}/{requiredTotal}</b>
            {requiredUnmeasurable > 0 && <span className="text-muted-foreground"> ({t('formation.score.unmeasurable', { n: requiredUnmeasurable })})</span>}
          </span>
          <span data-testid="score-bonus">
            {t('formation.score.bonus')} <b className="tabular-nums">{bonusMet}/{bonusTotal}</b>
          </span>
          <span className="ml-auto shrink-0" data-testid="checklist-legend-hint"><InfoHint hint={legend} /></span>
        </div>
        <div className="flex h-1.5 overflow-hidden rounded-[3px] bg-muted" aria-hidden="true">
          <span className="block h-full bg-success" style={{ width: `${share(requiredMet)}%` }} />
          <span className="block h-full bg-danger" style={{ width: `${share(requiredTotal - requiredMet - requiredUnmeasurable)}%` }} />
          <span className="block h-full bg-muted-foreground opacity-40" style={{ width: `${share(requiredUnmeasurable)}%` }} />
        </div>
        {notes.length > 0 && (
          <div className="flex items-start gap-1.5 rounded-lg border border-warning/35 bg-warning/10 px-2.5 py-1.5 text-xs text-warning" data-testid="checklist-note">
            <span className="flex flex-col gap-0.5">
              {notes.map((n) => (
                <span key={n}>{n}</span>
              ))}
            </span>
            {noteHint && <InfoHint hint={t('formation.note.unmeasurable.hint')} className="ml-auto shrink-0 text-warning" />}
          </div>
        )}
      </div>
      {GROUPS.map((kind) => {
        const rows = candidate.checks.filter((c) => c.kind === kind);
        if (rows.length === 0) return null;
        const folded = collapsed.has(kind);
        return (
          <section key={kind} className="border-t border-border" data-testid={`group-${kind}`}>
            <h3 className="flex flex-wrap items-baseline gap-x-2 pr-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Tooltip content={t('formation.group.toggle.hint', { group: t(`formation.group.${kind}` as MessageKey) })} role="presentation">
                <button
                  type="button"
                  aria-expanded={!folded}
                  data-testid={`group-toggle-${kind}`}
                  onClick={() => toggleGroup(kind)}
                  className="flex cursor-pointer items-center gap-1 py-1.5 pl-2.5 pr-1 uppercase tracking-wider focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {folded ? <ChevronRight size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
                  {t(`formation.group.${kind}` as MessageKey)}
                </button>
              </Tooltip>
              {kind === 'exclusion' && <span className="text-[11px] font-normal normal-case tracking-normal" data-testid="exclusion-note">{t('formation.group.exclusion.note')}</span>}
            </h3>
            {!folded && rows.map((c) => {
              const state = checkRowState(c);
              const highlighted = activeSet !== null && c.drawings.some((d) => activeSet.has(d));
              return (
                <div
                  key={c.id}
                  tabIndex={0}
                  data-testid={c.veto ? 'veto-row' : 'check-row'}
                  data-rule-id={c.id}
                  data-state={state}
                  data-on={highlighted ? 'true' : 'false'}
                  onMouseEnter={() => onActive(c.drawings)}
                  onFocus={() => onActive(c.drawings)}
                  onMouseLeave={() => onActive(null)}
                  onBlur={() => onActive(null)}
                  className={cn('grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-2 px-3 py-1 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary', highlighted && 'bg-muted')}
                >
                  <StateIcon state={state} />
                  <span className={cn('min-w-0 text-xs', (state === 'unmeasurable' || state === 'inactive') && 'text-muted-foreground')}>
                    {ruleText(locale, c.id) ?? c.id}
                    {c.veto && (
                      <Tooltip content={t('formation.mark.veto.hint')} role="presentation">
                        <span className="ml-1 cursor-help rounded-[5px] border border-danger/40 px-1 text-[10px] text-danger">{t('formation.mark.veto')}</span>
                      </Tooltip>
                    )}
                    {c.status !== 'confirmed' && (
                      <Tooltip content={t(`formation.mark.${c.status}.hint` as MessageKey)} role="presentation">
                        <span className="ml-1 cursor-help rounded-[5px] border border-border px-1 text-[10px] text-muted-foreground">{t(`formation.mark.${c.status}` as MessageKey)}</span>
                      </Tooltip>
                    )}
                    {state === 'inactive' && (
                      <Tooltip content={t('formation.mark.inactive.hint')} role="presentation">
                        <span className="ml-1 cursor-help whitespace-nowrap rounded-[5px] bg-muted px-1 text-[10px] text-muted-foreground">{t('formation.mark.inactive')}</span>
                      </Tooltip>
                    )}
                  </span>
                  <span className="flex flex-col items-end text-[11px] tabular-nums text-muted-foreground">
                    <span>{c.id}</span>
                    {c.value !== undefined && <span className="text-xs text-foreground/80">{number(c.value, { maximumFractionDigits: 3 })}</span>}
                  </span>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
