'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { isDayString, RANGE_PRESETS, type DayRange, type RangePreset } from '@/lib/serverTime';
import { DEFAULT_TIMEFRAME, isTimeframe, type Timeframe } from '@/lib/analysis/candles';

export const ANALYSIS_TABS = ['chart', 'stats'] as const;
export type AnalysisTab = (typeof ANALYSIS_TABS)[number];

/** Gewählter Zeitraum: Vorauswahl (relativ zu „heute“, beim Neuladen neu berechnet) oder feste Tage. */
export type RangeSelection = { preset: RangePreset } | { custom: DayRange };

export const DEFAULT_RANGE: RangeSelection = { preset: 'last30' };

/**
 * Zustand der Analyse-Seite in der URL (/chart?tab=&account=&zone=&tf=&range= bzw. &from=&to=):
 * Neuladen und geteilte Links zeigen dieselbe Ansicht. Änderungen ersetzen den Eintrag im
 * Verlauf (kein „Zurück“ durch jeden Klick).
 */
export function useAnalysisParams() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tabParam = params.get('tab');
  const tab: AnalysisTab = (ANALYSIS_TABS as readonly string[]).includes(tabParam ?? '')
    ? (tabParam as AnalysisTab)
    : 'chart';
  const accountId = params.get('account') || null;
  const zoneId = params.get('zone') || null;
  const rangeParam = params.get('range');
  const fromParam = params.get('from');
  const toParam = params.get('to');
  const tfParam = params.get('tf');
  const timeframe: Timeframe = isTimeframe(tfParam) ? tfParam : DEFAULT_TIMEFRAME;

  const range = useMemo<RangeSelection>(() => {
    if (isDayString(fromParam) && isDayString(toParam) && fromParam <= toParam) {
      return { custom: { from: fromParam, to: toParam } };
    }
    if ((RANGE_PRESETS as readonly string[]).includes(rangeParam ?? '')) return { preset: rangeParam as RangePreset };
    return DEFAULT_RANGE;
  }, [rangeParam, fromParam, toParam]);

  // router.replace wirkt erst mit dem nächsten Render: mehrere Änderungen im selben Durchlauf (z. B.
  // Konto übernehmen + erste Zone wählen) bauen auf der zuletzt gesendeten Adresse auf, nicht auf der alten
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

  const setTab = useCallback((value: AnalysisTab) => update({ tab: value === 'chart' ? null : value }), [update]);
  // Neues Konto: die Zone gehörte zum alten Konto und fällt weg
  const setAccount = useCallback((value: string) => update({ account: value, zone: null }), [update]);
  // Konto aus dem Store in die URL schreiben (Seite ohne ?account= geöffnet): Zone bleibt
  const adoptAccount = useCallback((value: string) => update({ account: value }), [update]);
  const setZone = useCallback((value: string | null) => update({ zone: value }), [update]);
  const setTimeframe = useCallback(
    (value: Timeframe) => update({ tf: value === DEFAULT_TIMEFRAME ? null : value }),
    [update],
  );
  const setRange = useCallback(
    (value: RangeSelection) =>
      update(
        'preset' in value
          ? { range: value.preset, from: null, to: null }
          : { range: null, from: value.custom.from, to: value.custom.to },
      ),
    [update],
  );

  return { tab, accountId, zoneId, range, timeframe, setTab, setAccount, adoptAccount, setZone, setRange, setTimeframe };
}
