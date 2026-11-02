import type { Candidate } from '@/lib/formation/types';

/** Zähler der Checkliste: inaktive Regeln (gelten für diese Variante nicht) zählen nicht mit */
export function checkScore(candidate: Candidate) {
  const counted = candidate.checks.filter((c) => !c.inactive);
  const required = counted.filter((c) => c.kind === 'required');
  const bonus = counted.filter((c) => c.kind === 'bonus');
  return {
    hasInactive: counted.length < candidate.checks.length,
    requiredTotal: required.length,
    requiredMet: required.filter((c) => c.state === 'met').length,
    requiredUnmeasurable: required.filter((c) => c.state === 'unmeasurable').length,
    bonusTotal: bonus.length,
    bonusMet: bonus.filter((c) => c.state === 'met').length,
  };
}
