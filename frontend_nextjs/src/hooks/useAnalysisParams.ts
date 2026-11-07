'use client';

import { useCallback, useMemo } from 'react';
import { useUrlUpdate } from '@/hooks/useUrlUpdate';
import { resolveChartMode, timeframeParam } from '@/lib/chart/mode';
import { isDayString, isTimeString, RANGE_PRESETS, type DayRange, type RangePreset } from '@/lib/serverTime';
import { DEFAULT_TIMEFRAME, type ChartTimeframe } from '@/lib/analysis/candles';

export const ANALYSIS_TABS = ['chart', 'stats'] as const;
export type AnalysisTab = (typeof ANALYSIS_TABS)[number];

/** Gewählter Zeitraum: Vorauswahl (relativ zu „heute“, beim Neuladen neu berechnet) oder feste Tage. */
export type RangeSelection = { preset: RangePreset } | { custom: DayRange };

export const DEFAULT_RANGE: RangeSelection = { preset: 'last30' };

/**
 * Zustand der Modi Setup und Frei der Chartseite in der URL (/chart?mode=&tab=&account=&zone=&tf=&range= bzw. &from=&to=):
 * Neuladen und geteilte Links zeigen dieselbe Ansicht. Änderungen ersetzen den Eintrag im
 * Verlauf (kein „Zurück“ durch jeden Klick).
 */
export function useAnalysisParams() {
  const { params, update } = useUrlUpdate();

  const tabParam = params.get('tab');
  const tab: AnalysisTab = (ANALYSIS_TABS as readonly string[]).includes(tabParam ?? '')
    ? (tabParam as AnalysisTab)
    : 'chart';
  const accountId = params.get('account') || null;
  const zoneId = params.get('zone') || null;
  const symbol = params.get('symbol')?.trim() || null;
  // Diese Hülle rendert nur Setup und Frei; Formation hat ihre eigene Ansicht (FormationView)
  const mode: 'free' | 'setup' = resolveChartMode(params) === 'free' ? 'free' : 'setup';
  const rangeParam = params.get('range');
  const fromParam = params.get('from');
  const toParam = params.get('to');
  const fromTimeParam = params.get('ft');
  const toTimeParam = params.get('tt');
  const tfParam = params.get('tf');
  const timeframe = timeframeParam(mode, tfParam);

  const range = useMemo<RangeSelection>(() => {
    if (isDayString(fromParam) && isDayString(toParam) && fromParam <= toParam) {
      const custom: DayRange = { from: fromParam, to: toParam };
      if (isTimeString(fromTimeParam)) custom.fromTime = fromTimeParam;
      if (isTimeString(toTimeParam)) custom.toTime = toTimeParam;
      return { custom };
    }
    if ((RANGE_PRESETS as readonly string[]).includes(rangeParam ?? '')) return { preset: rangeParam as RangePreset };
    return DEFAULT_RANGE;
  }, [rangeParam, fromParam, toParam, fromTimeParam, toTimeParam]);

  const setTab = useCallback((value: AnalysisTab) => update({ tab: value === 'chart' ? null : value }), [update]);
  // Neues Konto: die alte Zone fällt weg; ein durch einen alten zone=-Link gewählter Setup-Modus bleibt.
  const setAccount = useCallback((value: string) => update({ account: value, zone: null, ...(mode === 'setup' ? { mode: 'setup' } : {}) }), [update, mode]);
  // Konto aus dem Store in die URL schreiben (Seite ohne ?account= geöffnet): Zone bleibt
  const adoptAccount = useCallback((value: string) => update({ account: value }), [update]);
  const setSymbol = useCallback((value: string | null) => update({ symbol: value, mode: 'free', zone: null }), [update]);
  const setZone = useCallback((value: string | null) => update({ zone: value }), [update]);
  const setTimeframe = useCallback(
    (value: ChartTimeframe) => update({ tf: value === DEFAULT_TIMEFRAME ? null : value }),
    [update],
  );
  const setRange = useCallback(
    (value: RangeSelection) =>
      update(
        'preset' in value
          ? { range: value.preset, from: null, to: null, ft: null, tt: null }
          : { range: null, from: value.custom.from, to: value.custom.to, ft: value.custom.fromTime ?? null, tt: value.custom.toTime ?? null },
      ),
    [update],
  );

  return { tab, accountId, zoneId, symbol, mode, setSymbol, range, timeframe, setTab, setAccount, adoptAccount, setZone, setRange, setTimeframe };
}
