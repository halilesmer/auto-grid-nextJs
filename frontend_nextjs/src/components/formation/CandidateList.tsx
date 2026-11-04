'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { useT, type MessageKey } from '@/i18n';
import type { ScanHit } from '@/lib/formation/scan';
import type { Verdict } from '@/lib/formation/types';
import { cn } from '@/lib/utils';

const PILL: Record<Verdict, string> = {
  valid: 'border-success/40 bg-success/10 text-success',
  invalid: 'border-danger/40 bg-danger/10 text-danger',
  forming: 'border-warning/40 bg-warning/10 text-warning',
};

export function VerdictPill({ verdict, testId = 'verdict-pill' }: { verdict: Verdict; testId?: string }) {
  const t = useT();
  return (
    <span data-testid={testId} data-verdict={verdict} className={cn('whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs', PILL[verdict])}>
      {t(`formation.verdict.${verdict}` as MessageKey)}
    </span>
  );
}

/** Kandidaten der gewählten Formation und Zeiteinheit als Umschalter (Seite · Urteil); der Chart zeigt immer nur den gewählten. */
export function CandidateList({ hits, selected, onSelect }: { hits: readonly ScanHit[]; selected: ScanHit | null; onSelect: (hit: ScanHit) => void }) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-1.5 px-3 py-2" role="group" aria-label={t('formation.cand.label')} data-testid="candidate-list">
      {hits.map((hit) => {
        const title = `${t(`formation.form.${hit.form}` as MessageKey)} ${t(`formation.side.${hit.candidate.side}` as MessageKey)}`;
        const buy = hit.candidate.side === 'buy';
        const veto = hit.candidate.checks.some((c) => c.veto && c.state === 'met');
        return (
          <Tooltip key={`${hit.form}-${hit.tf}-${hit.candidate.side}`} content={veto ? `${t('formation.cand.item.hint', { title, tf: hit.tf })} ${t('formation.mark.veto.hint')}` : t('formation.cand.item.hint', { title, tf: hit.tf })} role="presentation">
            <button
              type="button"
              aria-pressed={hit === selected}
              data-testid="candidate-item"
              onClick={() => onSelect(hit)}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                hit === selected && 'bg-muted',
              )}
            >
              {buy ? <ArrowUp size={12} aria-hidden="true" className="text-success" /> : <ArrowDown size={12} aria-hidden="true" className="text-danger" />}
              <span>{t(`formation.side.${hit.candidate.side}` as MessageKey)}</span>
              <VerdictPill verdict={hit.candidate.verdict} />
              {veto && (
                <span data-testid="veto-badge" className="whitespace-nowrap rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-xs text-danger">
                  {t('formation.mark.veto')}
                </span>
              )}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
