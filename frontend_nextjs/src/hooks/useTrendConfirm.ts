'use client';

/**
 * Gilt für die Trend-Regler eine Bestätigung (FRM-42)? Seit dem einen Chart (1107-A21.8) ja, auf jeder Zeiteinheit: Formationen, Suche und Alarm
 * stehen immer auf demselben Chart und rechnen mit denselben Trend-Werten, also gilt überall Entwurf und Bestätigen.
 */
export function useTrendConfirm(): boolean {
  return true;
}
