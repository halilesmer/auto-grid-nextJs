'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CONTEXT_TIMEFRAMES, type ContextTimeframe } from '@/lib/formation/params';
import { SCAN_FORMATIONS, type ScanFormation } from '@/lib/formation/scan';

export const DEFAULT_FORMATION_TF: ContextTimeframe = 'H4';
export const DEFAULT_FORMATION: ScanFormation = 'ABCD';

/**
 * Zustand der Seite /formasyon in der URL (?account=&symbol=&zone=&tf=&form=): Neuladen und geteilte Links zeigen
 * dieselbe Ansicht. Änderungen ersetzen den Verlaufseintrag (wie useAnalysisParams).
 */
export function useFormationParams() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const accountId = params.get('account') || null;
  const zoneId = params.get('zone') || null;
  const symbol = params.get('symbol')?.trim() || null;
  const tfParam = params.get('tf');
  const formParam = params.get('form');
  const tf = (CONTEXT_TIMEFRAMES as readonly string[]).includes(tfParam ?? '') ? (tfParam as ContextTimeframe) : DEFAULT_FORMATION_TF;
  const form = (SCAN_FORMATIONS as readonly string[]).includes(formParam ?? '') ? (formParam as ScanFormation) : DEFAULT_FORMATION;

  // router.replace wirkt erst mit dem nächsten Render: mehrere Änderungen im selben Durchlauf bauen auf der zuletzt gesendeten Adresse auf
  const current = params.toString();
  const pending = useRef<string | null>(null);
  useEffect(() => {
    pending.current = null;
  }, [current]);

  const update = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(pending.current ?? current);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      if (query === (pending.current ?? current)) return;
      pending.current = query;
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [current, pathname, router],
  );

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

  return { accountId, zoneId, symbol, tf, form, setAccount, setSymbol, setView };
}
