'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t } from '@/i18n';
import { getApiErrorMessage, isAbortError as isAbort } from '@/lib/apiError';
import {
  barsOf,
  MAX_CHART_BARS,
  MAX_TOTAL_BARS,
  mergeHead,
  mergeTail,
  olderPage,
  ratesWindow,
  TIMEFRAME_SEC,
  type Bar,
  type MissingRange,
  type OlderEdge,
  type Timeframe,
} from '@/lib/analysis/candles';
import { sharedFetchRates, subscribeTick } from '@/lib/sharedRates';
import type { RatesResponse } from '@/services/marketApi';

/** Endstück nachladen bzw. nach einem Fehler neu versuchen (Plan 11.5); der Worker hält das Endstück 30 s im Cache */
const REFRESH_MS = 60_000;

export interface RatesRequest {
  accountId: string;
  symbol: string;
  timeframe: Timeframe;
  /** MT5-Sekunden, halb offen; from null = „alles“ (die letzten OPEN_RANGE_BARS Kerzen) */
  from: number | null;
  to: number;
}

export interface MarketRates {
  bars: Bar[];
  missing: MissingRange[];
  digits: number | null;
  point: number | null;
  /** Tatsächlich geladener Beginn (bei zu vielen Kerzen oder „alles“ später als gewünscht) */
  from: number;
  to: number;
  /** Ja: nur das Ende des Zeitraums ist geladen (und es wird nicht mehr nachgeladen) */
  clipped: boolean;
  /**
   * Ältere Kerzen (loadOlder): `more` = es gibt noch eine Seite, `none` = der Zeitraum ist ganz geladen,
   * sonst der Grund, warum links Schluss ist (Zeitraumbeginn, Beginn der MT5-Historie, Gesamtgrenze)
   */
  older: 'more' | 'none' | OlderEdge;
  /** Datenbank voll: Kerzen wurden geliefert, aber nicht gespeichert */
  dbFull: boolean;
  /** Zeit der laufenden MT5-Kerze, wenn sie die letzte geladene ist (sonst null: keine Live-Kerze) */
  liveFrom: number | null;
  /** Brokerzeit laut letzter Antwort (null: Worker kennt den Abstand nicht) */
  serverNow: number | null;
  loadedAt: number;
}

export interface MarketRatesState {
  data: MarketRates | null;
  loading: boolean;
  error: string | null;
  /** Eine Seite ältere Kerzen links anfügen (höchstens ein Aufruf zugleich); ohne Wirkung, wenn `data.older` nicht `more` ist */
  loadOlder: () => void;
  loadingOlder: boolean;
}

/** loadOlder ohne laufende Anfrage (kein Zeitraum gewählt oder Anfrage beendet) */
const NO_OLDER = () => {};
/** Pause nach einer fehlgeschlagenen Seite, bevor loadOlder es wieder versucht */
const OLDER_RETRY_MS = 15_000;

function requestKey(r: RatesRequest | null): string | null {
  return r ? `${r.accountId}|${r.symbol}|${r.timeframe}|${r.from ?? ''}|${r.to}` : null;
}

/** Wie es nach einer Seite mit Kerzen links weitergeht: Zeitraumbeginn vor Gesamtgrenze (der Beginn der Historie zeigt sich erst an einer leeren Seite) */
function olderAfter(rangeStart: boolean, total: number): MarketRates['older'] {
  if (rangeStart) return 'range';
  return total >= MAX_TOTAL_BARS ? 'limit' : 'more';
}

function columns(page: RatesResponse, tfSec: number) {
  const { bars, invalid } = barsOf(page, tfSec);
  return { bars, missing: [...page.missing, ...invalid] };
}

export async function loadAll(
  accountId: string,
  q: { symbol: string; timeframe: Timeframe; from: number; to: number },
  signal: AbortSignal,
) {
  const tfSec = TIMEFRAME_SEC[q.timeframe];
  const pages: RatesResponse[] = [];
  let from = q.from;
  // Der Worker liefert höchstens 50.000 Kerzen je Antwort, der Rest über next_from
  while (from < q.to) {
    const page = await sharedFetchRates(accountId, { ...q, from }, signal);
    pages.push(page);
    const count = pages.reduce((n, p) => n + p.t.length, 0);
    if (page.next_from === null || page.next_from <= from || count >= MAX_CHART_BARS) break;
    from = page.next_from;
  }
  const parts = pages.map((p) => columns(p, tfSec));
  const last = pages[pages.length - 1];
  return {
    bars: parts.flatMap((p) => p.bars),
    missing: parts.flatMap((p) => p.missing),
    digits: last?.digits ?? null,
    point: last?.point ?? null,
    liveFrom: last?.live_from ?? null,
    dbFull: pages.some((p) => p.db_full),
    serverNow: last?.server_now ?? null,
  };
}

/**
 * Kerzen für den Chart-Tab aus GET /market/{id}/rates. Eine Antwort für eine andere Auswahl
 * (Konto, Symbol, Zeitrahmen, Zeitraum) wird verworfen. Reicht der Zeitraum bis jetzt, wird alle
 * 60 s das Endstück nachgeladen (die laufende Kerze zählt nie als vollständig); nach einem Fehler
 * wird im selben Takt neu geladen.
 */
export function useMarketRates(request: RatesRequest | null, nowSec: () => number): MarketRatesState {
  const key = requestKey(request);
  const [state, setState] = useState<{ key: string | null; data: MarketRates | null; loading: boolean; error: string | null; loadingOlder: boolean }>({
    key: null,
    data: null,
    loading: false,
    error: null,
    loadingOlder: false,
  });
  const olderRef = useRef<() => void>(NO_OLDER);
  const loadOlder = useCallback(() => olderRef.current(), []);
  // Für den Zeitgeber: aktueller Stand und Uhr, ohne den Effekt neu zu starten
  const latest = useRef(state);
  const clock = useRef(nowSec);
  // Layout-Effekt: ein Kind (ChartCore) ruft loadOlder aus seinem Effekt, und der muss den neuen Stand schon sehen,
  // sonst gälte die gerade geladene Seite als fehlend und dieselbe ginge noch einmal los
  useLayoutEffect(() => {
    latest.current = state;
    clock.current = nowSec;
  });

  useEffect(() => {
    if (!request || !key) return;
    const controller = new AbortController();
    const tfSec = TIMEFRAME_SEC[request.timeframe];
    const win = ratesWindow(request.from, request.to, tfSec);
    const q = { symbol: request.symbol, timeframe: request.timeframe, from: win.from, to: win.to };
    let busy = false;
    let retryAt = 0;
    // Beginn des gewählten Zeitraums, auf den Zeitrahmen ausgerichtet; „alles“ hat keinen (null)
    const rangeFrom = request.from === null ? null : Math.floor(request.from / tfSec) * tfSec;

    // Bis zur ersten Antwort gilt der alte Stand als fremd (state.key ≠ key → loading, siehe unten)
    const load = () => {
      busy = true;
      loadAll(request.accountId, q, controller.signal)
        .then((res) => {
          if (controller.signal.aborted) return;
          setState({
            key,
            data: {
              ...res,
              from: win.from,
              to: win.to,
              clipped: win.clipped,
              older: win.clipped || (rangeFrom !== null && win.from > rangeFrom) ? 'more' : 'none',
              loadedAt: Date.now(),
            },
            loading: false,
            error: null,
            loadingOlder: false,
          });
        })
        .catch(async (err) => {
          if (isAbort(err) || controller.signal.aborted) return;
          const error = await getApiErrorMessage(err, t('analysis.chart.loadFailed'));
          if (!controller.signal.aborted) setState({ key, data: null, loading: false, error, loadingOlder: false });
        })
        .finally(() => {
          busy = false;
        });
    };

    const refreshTail = (cur: MarketRates) => {
      const from = cur.bars[cur.bars.length - 1].time;
      busy = true;
      sharedFetchRates(request.accountId, { ...q, from }, controller.signal)
        .then((page) => {
          if (controller.signal.aborted) return;
          // Ohne Kerzen (Konto beschäftigt, MT5-Fehler) bleibt der bisherige Stand: nie eine echte Kerze verwerfen
          if (page.t.length === 0) return;
          setState((s) => {
            if (s.key !== key || !s.data) return s;
            const merged = mergeTail(s.data, columns(page, tfSec), from);
            return {
              ...s,
              data: {
                ...s.data,
                ...merged,
                liveFrom: page.live_from,
                serverNow: page.server_now ?? s.data.serverNow,
                loadedAt: Date.now(),
              },
            };
          });
        })
        .catch(() => {
          // Endstück beim nächsten Mal; der Rest des Charts bleibt
        })
        .finally(() => {
          busy = false;
        });
    };

    // Seite für Seite nach links bis zum Zeitraumbeginn bzw. zum Beginn der Historie (1107-A4.3), insgesamt höchstens MAX_TOTAL_BARS (1107-A4.4)
    olderRef.current = () => {
      const cur = latest.current;
      if (busy || performance.now() < retryAt || cur.key !== key || !cur.data || cur.data.older !== 'more') return;
      const plan = olderPage(cur.data.from, rangeFrom, tfSec, cur.data.bars.length);
      if ('edge' in plan) {
        setState((s) => {
          if (s.key !== key || !s.data) return s;
          // Beginn der Historie: „unavailable“ vor der ersten Kerze ist kein Datenmangel
          const first = s.data.bars[0]?.time ?? Infinity;
          const missing = plan.edge === 'history' ? s.data.missing.filter((m) => !(m.reason === 'unavailable' && m.to <= first)) : s.data.missing;
          return { ...s, data: { ...s.data, missing, older: plan.edge, clipped: false } };
        });
        return;
      }
      busy = true;
      setState((s) => (s.key === key ? { ...s, loadingOlder: true } : s));
      // Nach einem Fehlschlag (Netz, 5xx, Konto beschäftigt) eine Pause: der Chart steht weiter am linken Rand und ruft sonst sofort wieder
      const failed = () => {
        retryAt = performance.now() + OLDER_RETRY_MS;
        setState((s) => (s.key === key ? { ...s, loadingOlder: false } : s));
      };
      sharedFetchRates(request.accountId, { ...q, from: plan.from, to: plan.to }, controller.signal)
        .then((page) => {
          if (controller.signal.aborted) return;
          // „unavailable“ am Seitenbeginn: entweder der Beginn der MT5-Historie oder ein langes Loch mittendrin (market_sync.empty);
          // erst eine Seite ohne Kerzen davor entscheidet es. Bis dahin bleibt das Loch in der Liste „fehlt“
          const isStart = (m: MissingRange) => m.reason === 'unavailable' && m.from <= plan.from;
          const others = page.missing.filter((m) => !isStart(m));
          if (page.t.length === 0) {
            // Ohne Kerzen und mit anderem Grund (Konto beschäftigt, MT5-Fehler) bleibt alles, wie es ist; Wiederholung nach der Pause
            if (others.length > 0) return failed();
            // Keine Kerzen und nichts als „unavailable“: der Beginn der Historie. Die Bereiche davor zählen dann nicht als fehlend
            setState((s) => {
              if (s.key !== key || !s.data) return s;
              const first = s.data.bars[0]?.time ?? Infinity;
              const missing = s.data.missing.filter((m) => !(m.reason === 'unavailable' && m.to <= first));
              return { ...s, loadingOlder: false, data: { ...s.data, missing, older: 'history', clipped: false } };
            });
            return;
          }
          const head = columns(page, tfSec);
          setState((s) => {
            if (s.key !== key || !s.data) return s;
            const merged = mergeHead(s.data, head, plan.to);
            const older = olderAfter(rangeFrom !== null && plan.from <= rangeFrom, merged.bars.length);
            return { ...s, loadingOlder: false, data: { ...s.data, ...merged, from: plan.from, older, clipped: older === 'more' ? s.data.clipped : false } };
          });
        })
        .catch((err) => {
          if (isAbort(err) || controller.signal.aborted) return;
          failed();
        })
        .finally(() => {
          busy = false;
        });
    };

    load();
    // Gleiches Konto, Symbol, Zeitrahmen und Ende: ein Takt für alle Hooks (1107-A21.19)
    const unsubscribe = subscribeTick(`${request.accountId}|${request.symbol}|${request.timeframe}|${win.to}`, REFRESH_MS, () => {
      const cur = latest.current;
      if (busy || cur.key !== key) return;
      if (!cur.data) {
        if (cur.error) load();
        return;
      }
      // Nur, wenn der Zeitraum bis jetzt reicht
      if (win.to > clock.current() - tfSec && cur.data.bars.length > 0) refreshTail(cur.data);
    });

    return () => {
      controller.abort();
      unsubscribe();
      olderRef.current = NO_OLDER;
    };
    // request steckt vollständig im key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (state.key !== key) return { data: null, loading: Boolean(key), error: null, loadOlder, loadingOlder: false };
  return { data: state.data, loading: state.loading, error: state.error, loadOlder, loadingOlder: state.loadingOlder };
}
