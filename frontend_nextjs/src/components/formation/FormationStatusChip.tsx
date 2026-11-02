'use client';

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { VerdictPill } from '@/components/formation/CandidateList';
import { Button } from '@/components/ui/button';
import { useT, type MessageKey } from '@/i18n';
import type { ScanHit } from '@/lib/formation/scan';
import { checkScore } from '@/lib/formation/score';

/** Status-Knopf der Kopfleiste: Seite, Urteil und Zähler des gewählten Kandidaten; öffnet und schließt den Reiter „Bedingungen“. */
export function FormationStatusChip({ hit, open, onToggle }: { hit: ScanHit | null; open: boolean; onToggle: () => void }) {
  const t = useT();
  const score = hit ? checkScore(hit.candidate) : null;
  const buy = hit?.candidate.side === 'buy';
  return (
    <Button
      size="sm"
      variant="ghost"
      className="gap-1 px-1.5 text-foreground sm:h-7 sm:px-1.5"
      hint={hit ? t(open ? 'formation.status.close.hint' : 'formation.status.open.hint') : t('formation.status.empty.hint')}
      aria-label={t('formation.conditions')}
      aria-expanded={open}
      aria-controls="formation-conditions"
      disabled={!hit}
      data-testid="formation-status-chip"
      onClick={onToggle}
    >
      {hit && score ? (
        <>
          {buy ? <ArrowUp size={13} aria-hidden="true" className="text-success" /> : <ArrowDown size={13} aria-hidden="true" className="text-danger" />}
          <span className="sr-only">{t(`formation.side.${hit.candidate.side}` as MessageKey)}</span>
          <VerdictPill verdict={hit.candidate.verdict} testId="status-verdict" />
          <span className="tabular-nums text-muted-foreground">{score.requiredMet}/{score.requiredTotal} · {score.bonusMet}/{score.bonusTotal}</span>
        </>
      ) : (
        <span>{t('formation.conditions')}</span>
      )}
      {open ? <ChevronRight size={13} aria-hidden="true" /> : <ChevronLeft size={13} aria-hidden="true" />}
    </Button>
  );
}
