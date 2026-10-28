'use client';

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

export function VerdictPill({ verdict }: { verdict: Verdict }) {
  const t = useT();
  return (
    <span data-testid="verdict-pill" data-verdict={verdict} className={cn('whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs', PILL[verdict])}>
      {t(`formation.verdict.${verdict}` as MessageKey)}
    </span>
  );
}

/** Kandidaten der gewählten Formation und Zeiteinheit; der Chart zeigt immer nur den gewählten. */
export function CandidateList({ hits, selected, onSelect }: { hits: readonly ScanHit[]; selected: ScanHit | null; onSelect: (hit: ScanHit) => void }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-1.5 p-2" data-testid="candidate-list">
      {hits.map((hit) => {
        const title = `${t(`formation.form.${hit.form}` as MessageKey)} ${t(`formation.side.${hit.candidate.side}` as MessageKey)}`;
        return (
          <Tooltip key={`${hit.form}-${hit.tf}`} content={t('formation.cand.item.hint', { title, tf: hit.tf })} role="presentation">
            <button
              type="button"
              aria-pressed={hit === selected}
              data-testid="candidate-item"
              onClick={() => onSelect(hit)}
              className={cn(
                'flex w-full cursor-pointer items-center gap-2 rounded-[9px] border border-transparent px-2.5 py-2 text-left',
                hit === selected && 'border-border bg-muted',
              )}
            >
              <span className="min-w-0 flex-1 text-sm">
                {title}
                <small className="block text-xs text-muted-foreground">{hit.tf}</small>
              </span>
              <VerdictPill verdict={hit.candidate.verdict} />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
