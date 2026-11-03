'use client';

import { useCallback } from 'react';
import { useUrlUpdate } from '@/hooks/useUrlUpdate';
import { DEFAULT_FORMATION_TF } from '@/lib/chart/mode';
import { CONTEXT_TIMEFRAMES, type ContextTimeframe } from '@/lib/formation/params';
import { SCAN_FORMATIONS, type ScanFormation } from '@/lib/formation/scan';

export { DEFAULT_FORMATION_TF };
export const DEFAULT_FORMATION: ScanFormation = 'ABCD';

/**
 * Zustand des Modus Formation in der URL (/chart?mode=formation&account=&symbol=&zone=&tf=&form=): Neuladen und geteilte Links zeigen
 * dieselbe Ansicht. Änderungen ersetzen den Verlaufseintrag (wie useAnalysisParams).
 */
export function useFormationParams() {
  const { params, update: write } = useUrlUpdate();

  const accountId = params.get('account') || null;
  const zoneId = params.get('zone') || null;
  const symbol = params.get('symbol')?.trim() || null;
  const tfParam = params.get('tf');
  const formParam = params.get('form');
  const tf = (CONTEXT_TIMEFRAMES as readonly string[]).includes(tfParam ?? '') ? (tfParam as ContextTimeframe) : DEFAULT_FORMATION_TF;
  const form = (SCAN_FORMATIONS as readonly string[]).includes(formParam ?? '') ? (formParam as ScanFormation) : DEFAULT_FORMATION;

  // Jede Änderung schreibt `mode=formation` mit: ein `symbol=` allein würde die Adresse sonst als Modus Frei lesen
  const update = useCallback((changes: Record<string, string | null>) => write({ mode: 'formation', ...changes }), [write]);

  // Konto aus dem Store in die Adresse schreiben; der Modus bleibt, wie er aus der Adresse gelesen wird
  const adoptAccount = useCallback((value: string) => write({ account: value }), [write]);
  // Symbolnamen gelten je Broker (XAUUSD, XAUUSD.m): ein neues Konto beginnt wieder mit seinem ersten Setup
  const setAccount = useCallback((value: string) => update({ account: value, zone: null, symbol: null }), [update]);
  const setSymbol = useCallback((value: string) => update({ symbol: value, zone: null }), [update]);
  const setView = useCallback(
    (next: { tf?: ContextTimeframe; form?: ScanFormation }) =>
      update({
        ...(next.tf ? { tf: next.tf === DEFAULT_FORMATION_TF ? null : next.tf } : {}),
        ...(next.form ? { form: next.form === DEFAULT_FORMATION ? null : next.form } : {}),
      }),
    [update],
  );

  return { accountId, zoneId, symbol, tf, form, setAccount, adoptAccount, setSymbol, setView };
}
