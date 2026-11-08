'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ChartTimeframe } from '@/lib/analysis/candles';
import { buildChartUrl, parseChartUrl, type ChartRange, type ChartTab, type ChartUrlChange } from '@/lib/chart/chartUrl';
import { SCAN_FORMATIONS, type ScanFormation } from '@/lib/formation/scan';

/**
 * State of the one chart in the URL (plan 1107-A21): `/chart?account=&symbol=&zone=&tf=&form=&at=&range=&tab=`. The reading and
 * writing rules are the pure functions of `lib/chart/chartUrl.ts` (`mode` is ignored on read and removed on every write).
 * A change replaces the history entry. `router.replace` acts with the next render, so several changes in one pass build on the last sent address.
 * `/backtest` keeps its own hook (`useAnalysisParams`, default range `last30`).
 */
export function useChartParams() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const current = params.toString();
  const pending = useRef<string | null>(null);
  useEffect(() => {
    pending.current = null;
  }, [current]);

  const state = useMemo(() => parseChartUrl(new URLSearchParams(current)), [current]);
  const form: ScanFormation | null = (SCAN_FORMATIONS as readonly string[]).includes(state.form ?? '') ? (state.form as ScanFormation) : null;

  const write = useCallback(
    (change: ChartUrlChange) => {
      const base = new URLSearchParams(pending.current ?? current);
      const query = buildChartUrl(base, change).toString();
      if (query === (pending.current ?? current)) return;
      pending.current = query;
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [current, pathname, router],
  );

  // Symbol names are per broker (XAUUSD, XAUUSD.m): a new account starts again with its own first setup
  const setAccount = useCallback((account: string) => write({ account, zone: null, symbol: null, at: null }), [write]);
  // The account from the store goes into the address (page opened without ?account=); everything else stays
  const adoptAccount = useCallback((account: string) => write({ account }), [write]);
  const setSymbol = useCallback((symbol: string) => write({ symbol, zone: null }), [write]);
  const setZone = useCallback((zone: string | null) => write({ zone }), [write]);
  const setTimeframe = useCallback((tf: ChartTimeframe) => write({ tf }), [write]);
  const setForm = useCallback((value: ScanFormation | null) => write({ form: value }), [write]);
  // null = live (the parameter goes away)
  const setAt = useCallback((at: string | null) => write({ at }), [write]);
  const setRange = useCallback((range: ChartRange) => write({ range }), [write]);
  const setTab = useCallback((tab: ChartTab) => write({ tab }), [write]);
  /** A view change in one call: a timeframe and/or a formation (`tf` without formations drops `form` and `at`, 1107-A21.9) */
  const setView = useCallback((next: { tf?: ChartTimeframe; form?: ScanFormation }) => write(next), [write]);

  return {
    tab: state.tab,
    accountId: state.account,
    symbol: state.symbol,
    zoneId: state.zone,
    timeframe: state.tf,
    form,
    atParam: state.at,
    range: state.range,
    setAccount,
    adoptAccount,
    setSymbol,
    setZone,
    setTimeframe,
    setForm,
    setAt,
    setRange,
    setTab,
    setView,
  };
}
