import type { Appearance } from '@/lib/chart-workspace/settings';
export type LineMenuTrigger = 'context' | 'double';
/** Einstellung „Çizgi menüsü“ (A7.7): welcher Auslöser das Linienmenü öffnen darf */
export const lineMenuAllows = (mode: Appearance['lineMenu'], trigger: LineMenuTrigger): boolean =>
  mode === 'both' || (trigger === 'context' ? mode === 'right' : mode === 'double');
