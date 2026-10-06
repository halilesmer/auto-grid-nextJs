'use client';

import { useEffect, useRef, useState } from 'react';
import { t } from '@/i18n';
import { getApiErrorMessage, isAbortError as isAbort } from '@/lib/apiError';
import { barsOf, TIMEFRAME_SEC } from '@/lib/analysis/candles';
import { excursion, isFinal, m1Spans, type Excursion, type M1Data } from '@/lib/analysis/excursions';
import type { Trade } from '@/lib/analysis/tradePairing';
import { fetchRates } from '@/services/marketApi';

const M1 = TIMEFRAME_SEC.M1;

/** M1-Kerzen [from, to) eines Symbols, über next_from geblättert (höchstens 50.000 je Antwort) */
async function loadM1(accountId: string, q: { symbol: string; from: number; to: number }, signal: AbortSignal): Promise<M1Data> {
  const data: M1Data = { bars: [], spread: [], missing: [], from: q.from, to: q.from, point: null };
  let from = q.from;
  while (from < q.to) {
    const page = await fetchRates(accountId, { ...q, timeframe: 'M1', from }, signal);
    const cols = barsOf(page, M1);
    data.bars.push(...cols.bars);
    data.spread.push(...cols.spread);
    data.missing.push(...page.missing, ...cols.invalid);
    data.point = page.point ?? data.point;
    if (page.next_from === null) {
      data.to = q.to;
      break;
    }
    // Der Worker liefert nicht weiter: nur bis hier gilt als geladen
    if (page.next_from <= from) {
      data.to = from;
      break;
    }
    data.to = page.next_from;
    from = page.next_from;
  }
  return data;
}

export interface ExcursionsState {
  /** Endgültige Ergebnisse je Trade-ID (isFinal); vorläufige werden nicht gespeichert, der Trade bleibt offen */
  results: ReadonlyMap<string, Excursion>;
  /** Trades ohne Ergebnis */
  pending: number;
  loading: boolean;
  error: string | null;
  /** Beim letzten Knopfdruck reichte die Obergrenze nicht für alle offenen Trades */
  capped: boolean;
  compute: () => void;
}

interface Store {
  accountId: string;
  results: Map<string, Excursion>;
  loading: boolean;
  error: string | null;
  capped: boolean;
}

/**
 * MFE/MAE (ANA-12) der übergebenen Trades, nur auf Knopfdruck: lädt M1 einmal je Symbol über die Spanne der
 * offenen Trades (neueste zuerst, höchstens MAX_EXCURSION_BARS Minuten), Symbole nacheinander. Ergebnisse gelten
 * nur für das Konto, für das sie gerechnet wurden: ein Kontowechsel bricht das Laden ab, unter einem anderen Konto
 * erscheinen sie nie.
 */
export function useExcursions(accountId: string, trades: Trade[]): ExcursionsState {
  const [store, setStore] = useState<Store>(() => ({ accountId, results: new Map(), loading: false, error: null, capped: false }));
  const controller = useRef<AbortController | null>(null);

  // Kontowechsel: Laden abbrechen; der alte Stand bleibt ohne Ladeanzeige, falls das Konto zurückkommt
  useEffect(
    () => () => {
      controller.current?.abort();
      controller.current = null;
      setStore((s) => (s.accountId === accountId && s.loading ? { ...s, loading: false } : s));
    },
    [accountId],
  );

  const current: Store =
    store.accountId === accountId ? store : { accountId, results: new Map(), loading: false, error: null, capped: false };
  const open = trades.filter((tr) => !current.results.has(tr.id));

  const compute = () => {
    if (open.length === 0) return;
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    const spans = m1Spans(open);
    // Symbole ohne Zwischenkerze brauchen nur den point: eine Minute an der neuesten Ausstiegskerze
    for (const tr of [...open].sort((a, b) => b.exitTime - a.exitTime)) {
      if (spans.has(tr.symbol) || tr.entryTime === null) continue;
      const exitBar = Math.floor(tr.exitTime / M1) * M1;
      spans.set(tr.symbol, { from: exitBar, to: exitBar + M1, capped: false });
    }
    const capped = [...spans.values()].some((s) => s.capped);
    const results = new Map(current.results);
    const keep = (trades: Trade[], m1: M1Data | null) => {
      for (const tr of trades) {
        const r = excursion(tr, m1);
        // Vorläufige Ergebnisse nicht speichern: der Trade bleibt offen für den nächsten Knopfdruck
        if (isFinal(r)) results.set(tr.id, r);
      }
    };
    // Trades ohne Kerzenbedarf (kein Einstieg, zu lang) gleich auswerten
    keep(open.filter((tr) => !spans.has(tr.symbol)), null);
    setStore({ accountId, results: new Map(results), loading: true, error: null, capped: false });

    // Nacheinander: der Worker lädt aus MT5 nur eine Spanne zugleich (market_sync._FETCH_SLOT); parallel
    // gestellte Anfragen würden nach 30 s als „busy“ zurückkommen
    (async () => {
      for (const [symbol, span] of spans) {
        const m1 = await loadM1(accountId, { symbol, ...span }, ctrl.signal);
        if (ctrl.signal.aborted) return;
        keep(open.filter((tr) => tr.symbol === symbol), m1);
        setStore({ accountId, results: new Map(results), loading: true, error: null, capped: false });
      }
      setStore({ accountId, results: new Map(results), loading: false, error: null, capped });
    })().catch(async (err) => {
      if (isAbort(err) || ctrl.signal.aborted) return;
      const error = await getApiErrorMessage(err, t('analysis.trades.mfe.failed'));
      // Ergebnisse der schon geladenen Symbole bleiben
      if (!ctrl.signal.aborted) setStore({ accountId, results: new Map(results), loading: false, error, capped: false });
    });
  };

  return {
    results: current.results,
    pending: open.length,
    loading: current.loading,
    error: current.error,
    capped: current.capped,
    compute,
  };
}
