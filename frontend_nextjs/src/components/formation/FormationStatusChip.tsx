'use client';

import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Clock, X } from 'lucide-react';
import { VerdictPill } from '@/components/formation/CandidateList';
import { Button } from '@/components/ui/button';
import { useT, type MessageKey } from '@/i18n';
import type { ScanHit } from '@/lib/formation/scan';
import { checkScore } from '@/lib/formation/score';
import type { Verdict } from '@/lib/formation/types';
import { cn } from '@/lib/utils';

/** Urteil als Symbol mit eigener Form je Urteil (nie nur Farbe): gültig ✓, ungültig ✗, im Aufbau Uhr */
const VERDICT_ICON: Record<Verdict, { icon: typeof Check; tone: string }> = {
  valid: { icon: Check, tone: 'text-success' },
  invalid: { icon: X, tone: 'text-danger' },
  forming: { icon: Clock, tone: 'text-warning' },
};

/**
 * Status-Knopf der Kopfleiste: Seite, Urteil und Zähler des gewählten Kandidaten; öffnet und schließt den Reiter „Bedingungen“.
 * Ab 79rem Breite von `formation-main` (1264 px bei 16 px Schrift) steht das Urteil als Pille mit den Zählern (Schwelle: Rechen-Kommentar in FormationToolbar.tsx),
 * darunter nur als Symbol; Seite, Urteil und Zähler stehen dann im Namen (aria-label) und im Hinweis.
 */
export function FormationStatusChip({ hit, open, onToggle }: { hit: ScanHit | null; open: boolean; onToggle: () => void }) {
  const t = useT();
  const score = hit ? checkScore(hit.candidate) : null;
  const buy = hit?.candidate.side === 'buy';
  const summary =
    hit && score
      ? `${t(`formation.side.${hit.candidate.side}` as MessageKey)} · ${t(`formation.verdict.${hit.candidate.verdict}` as MessageKey)} · ${t('formation.group.required')} ${score.requiredMet}/${score.requiredTotal} · ${t('formation.group.bonus')} ${score.bonusMet}/${score.bonusTotal}`
      : null;
  const VerdictIcon = hit ? VERDICT_ICON[hit.candidate.verdict] : null;
  return (
    <Button
      size="sm"
      variant="ghost"
      className="gap-1 px-1.5 text-foreground sm:h-7 sm:px-1.5"
      hint={summary ? t(open ? 'formation.status.close.hint' : 'formation.status.open.hint', { summary }) : t('formation.status.empty.hint')}
      aria-label={summary ? `${t('formation.conditions')}: ${summary}` : t('formation.conditions')}
      aria-expanded={open}
      aria-controls={open ? 'formation-conditions' : undefined}
      disabled={!hit}
      data-testid="formation-status-chip"
      onClick={onToggle}
    >
      {hit && score && VerdictIcon ? (
        <>
          {buy ? <ArrowUp size={13} aria-hidden="true" className="text-success" /> : <ArrowDown size={13} aria-hidden="true" className="text-danger" />}
          <VerdictIcon.icon size={13} aria-hidden="true" className={cn('@min-[79rem]/formation-main:hidden', VerdictIcon.tone)} data-testid="status-verdict-icon" data-verdict={hit.candidate.verdict} />
          <span className="hidden items-center gap-1 @min-[79rem]/formation-main:inline-flex" data-testid="status-full">
            <VerdictPill verdict={hit.candidate.verdict} testId="status-verdict" />
            <span className="tabular-nums text-muted-foreground" data-testid="status-counts">{score.requiredMet}/{score.requiredTotal} · {score.bonusMet}/{score.bonusTotal}</span>
          </span>
        </>
      ) : (
        <span>{t('formation.conditions')}</span>
      )}
      {open ? <ChevronRight size={13} aria-hidden="true" /> : <ChevronLeft size={13} aria-hidden="true" />}
    </Button>
  );
}
