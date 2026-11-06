'use client';

import { useSearchParams } from 'next/navigation';
import { resolveChartMode } from '@/lib/chart/mode';

/**
 * Gilt für die Trend-Regler eine Bestätigung (FRM-42)? Nur im Modus Formation rechnen Formationen, Suche und Alarm mit den
 * Werten. In Setup und Frei gilt jede Änderung sofort und die Seite zeigt keinen offenen Entwurf.
 */
export function useTrendConfirm(): boolean {
  return resolveChartMode(new URLSearchParams(useSearchParams().toString())) === 'formation';
}
