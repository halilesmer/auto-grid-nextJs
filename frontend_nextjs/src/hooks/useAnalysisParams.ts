'use client';

import { useCallback, useMemo } from 'react';
import { useUrlUpdate } from '@/hooks/useUrlUpdate';
import { isDayString, isTimeString, RANGE_PRESETS, type DayRange, type RangePreset } from '@/lib/serverTime';

/** Gewählter Zeitraum: Vorauswahl (relativ zu „heute“, beim Neuladen neu berechnet) oder feste Tage. */
export type RangeSelection = { preset: RangePreset } | { custom: DayRange };

export const DEFAULT_RANGE: RangeSelection = { preset: 'last30' };

/**
 * URL state of the page `/backtest` (?account=&zone=&range= or &from=&to=). The one chart (`/chart`) has its own hook
 * (`useChartParams`, default range "All"). Changes replace the history entry, so one click is not one "Back" step.
 */
export function useAnalysisParams() {
  const { params, update } = useUrlUpdate();

  const accountId = params.get('account') || null;
  const zoneId = params.get('zone') || null;
  const rangeParam = params.get('range');
  const fromParam = params.get('from');
  const toParam = params.get('to');
  const fromTimeParam = params.get('ft');
  const toTimeParam = params.get('tt');

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

  // New account: the old zone is dropped
  const setAccount = useCallback((value: string) => update({ account: value, zone: null }), [update]);
  // Write the account from the store into the URL (page opened without ?account=): the zone stays
  const adoptAccount = useCallback((value: string) => update({ account: value }), [update]);
  const setZone = useCallback((value: string | null) => update({ zone: value }), [update]);
  const setRange = useCallback(
    (value: RangeSelection) =>
      update(
        'preset' in value
          ? { range: value.preset, from: null, to: null, ft: null, tt: null }
          : { range: null, from: value.custom.from, to: value.custom.to, ft: value.custom.fromTime ?? null, tt: value.custom.toTime ?? null },
      ),
    [update],
  );

  return { accountId, zoneId, range, setAccount, adoptAccount, setZone, setRange };
}
