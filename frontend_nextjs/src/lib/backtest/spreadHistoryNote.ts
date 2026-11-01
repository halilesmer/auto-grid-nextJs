/**
 * Live gilt die Lernhistorie des relativen Spread-Schutzes je Symbol, gemeinsam für alle Zonen (core/spread_guard.py).
 * Der Backtest rechnet jedes Setup allein; dieser Hinweis sagt, wenn Live-Grenzen deshalb abweichen können.
 */
import type { RunProblem } from '@/lib/backtest/runContext';

interface GuardedZone {
  id?: unknown;
  symbol?: unknown;
  /** Wird nicht ausgewertet: auch inaktive Zonen lernen live mit */
  is_active?: unknown;
  spread_guard?: { enabled?: boolean; mode?: string };
}

const usesRelativeGuard = (zone: GuardedZone) => zone.spread_guard?.enabled === true && zone.spread_guard.mode === 'relative';

/**
 * `others`: Zonen der übrigen Setups und die gespeicherten aktiven Zonen des Kontos. Zählt nur Zonen mit anderer id
 * (dieselbe Zone als Kopie ist live nur einmal da) und gleichem Symbol. Auch inaktive Zonen zählen: der Worker
 * übergibt dem Schutz alle gespeicherten Zonen (core/spread_guard.py, `observe`).
 */
export function spreadHistoryNote(tested: GuardedZone, others: readonly GuardedZone[]): RunProblem | null {
  if (!usesRelativeGuard(tested)) return null;
  const ids = new Set<unknown>();
  for (const zone of others) {
    if (zone.id === tested.id || zone.symbol !== tested.symbol || !usesRelativeGuard(zone)) continue;
    ids.add(zone.id);
  }
  return ids.size > 0 ? { code: 'run.spreadHistoryShared', params: { count: ids.size } } : null;
}
