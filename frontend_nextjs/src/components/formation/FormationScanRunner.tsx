'use client';

import { useEffect, useMemo } from 'react';
import { loadAll } from '@/hooks/useMarketRates';
import { useBrokerClock } from '@/hooks/useBrokerClock';
import { useFavorites, useFavoritesLoader } from '@/hooks/useFavorites';
import { isAbortError } from '@/lib/apiError';
import { ratesWindow, TIMEFRAME_SEC, type Bar } from '@/lib/analysis/candles';
import { FormationContext, type ContextInput } from '@/lib/formation/context';
import { CONTEXT_TIMEFRAMES } from '@/lib/formation/params';
import { formationRequests } from '@/lib/formation/requests';
import { formedHits, scanFormations, scanTime, type FormedHit } from '@/lib/formation/scan';
import { brokerNow, brokerToday, DAY_SEC, dayStart } from '@/lib/serverTime';
import { useAccountStore } from '@/store/useAccountStore';
import { useFavoritesScanStore, type ScanGap } from '@/store/useFavoritesScanStore';

const LOCK_NAME = 'grid-favorites-scan';
const CHANNEL_NAME = 'grid-favorites-scan';
/** Wie oft geprüft wird, ob eine neue M15-Kerze begonnen hat */
const CHECK_MS = 30_000;
const SLOT_SEC = TIMEFRAME_SEC.M15;

type Message =
  | { type: 'put'; accountId: string; symbol: string; formed: FormedHit[]; at: number; gap: ScanGap | null }
  | { type: 'hello'; accountId: string }
  | { type: 'snapshot'; accountId: string; results: Record<string, FormedHit[]>; gaps: Record<string, ScanGap>; doneAt: Record<string, number> };

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done);
  });

/** Ein Produkt: vier Zeiteinheiten laden, suchen, nur gebildete Treffer behalten. Rechenzeit geht in `spent`. */
async function scanSymbol(accountId: string, symbol: string, to: number, signal: AbortSignal, spent: { ms: number }): Promise<{ formed: FormedHit[]; gap: ScanGap | null }> {
  const requests = formationRequests(accountId, symbol, to);
  const loaded = await Promise.all(
    CONTEXT_TIMEFRAMES.map(async (tf) => {
      const r = requests[tf];
      const win = ratesWindow(r.from, r.to, TIMEFRAME_SEC[tf]);
      return [tf, await loadAll(accountId, { symbol, timeframe: tf, from: win.from, to: win.to }, signal)] as const;
    }),
  );
  const started = performance.now();
  const input: ContextInput = {};
  let gap: ScanGap | null = null;
  for (const [tf, res] of loaded) {
    input[tf] = res.bars;
    if (res.missing.length > 0) gap = 'missing';
  }
  const m15 = loaded.find(([tf]) => tf === 'M15')?.[1];
  const last: Bar | undefined = m15?.bars[m15.bars.length - 1];
  if (!m15 || !last) return { formed: [], gap: 'missing' };
  const at = scanTime(last.time, m15.liveFrom === last.time);
  const formed = formedHits(scanFormations(new FormationContext(symbol, input), at));
  spent.ms += performance.now() - started;
  return { formed, gap };
}

async function scanLoop(accountId: string, symbols: string[], offsetSec: number | null, signal: AbortSignal, post: (m: Message) => void) {
  const store = useFavoritesScanStore;
  while (!signal.aborted) {
    const nowSec = offsetSec !== null ? brokerNow(offsetSec) : Date.now() / 1000;
    const slot = Math.floor(nowSec / SLOT_SEC) * SLOT_SEC;
    const to = dayStart(brokerToday(offsetSec ?? 0)) + DAY_SEC;
    const todo = symbols.filter((s) => store.getState().doneAt[s] !== slot);
    if (todo.length === 0) {
      // Ein abgebrochener Durchgang kann eine Anzeige hinterlassen haben
      store.getState().setProgress(accountId, null);
    } else {
      const spent = { ms: 0 };
      store.getState().setProgress(accountId, { done: 0, total: todo.length });
      for (const [i, symbol] of todo.entries()) {
        if (signal.aborted) return;
        let formed: FormedHit[] = store.getState().results[symbol] ?? [];
        let gap: ScanGap | null = null;
        try {
          ({ formed, gap } = await scanSymbol(accountId, symbol, to, signal, spent));
        } catch (err) {
          if (isAbortError(err) || signal.aborted) return;
          // Fehler eines Produkts (Worker, ungültige Kerzen) stoppt die anderen nicht; der alte Stand bleibt, die Zeile gilt als unvollständig
          console.error(`Favorites scan failed for ${symbol}`, err);
          gap = 'error';
        }
        // Bis hierher kann der Durchgang abgebrochen worden sein (Kontowechsel): dann nichts mehr schreiben
        if (signal.aborted) return;
        // Nach einem Fehler gilt der Takt nicht als erledigt: der nächste Prüfschritt (30 s) versucht es erneut
        const at = gap === 'error' ? (store.getState().doneAt[symbol] ?? 0) : slot;
        store.getState().put(accountId, symbol, formed, at, gap);
        post({ type: 'put', accountId, symbol, formed, at, gap });
        store.getState().setProgress(accountId, { done: i + 1, total: todo.length });
        // Oberfläche zwischen zwei Produkten freigeben
        await sleep(0, signal);
      }
      store.getState().addMs(accountId, Math.round(spent.ms), true);
      store.getState().setProgress(accountId, null);
    }
    await sleep(CHECK_MS, signal);
  }
}

/**
 * Suche über die Favoriten (FRM-29), ohne Oberfläche. Im Layout, damit sie unabhängig von der Seite läuft und der Alarm später
 * dieselben Ergebnisse nutzt. Es sucht nur ein Tab (Web Lock); die anderen Tabs bekommen die Ergebnisse über einen BroadcastChannel.
 * Ohne gewähltes Konto oder ohne Favoriten ruht sie.
 */
export default function FormationScanRunner() {
  const accountId = useAccountStore((s) => s.selectedAccount);
  useFavoritesLoader(accountId);
  const favorites = useFavorites(accountId);
  const clock = useBrokerClock(accountId);
  const offsetSec = clock.clock?.reliable ? clock.clock.offset_sec : null;
  const symbolsKey = favorites.symbols.join('|');
  const symbols = useMemo(() => (symbolsKey ? symbolsKey.split('|') : []), [symbolsKey]);
  const active = accountId !== null && favorites.ready && !clock.loading;

  useEffect(() => {
    const store = useFavoritesScanStore.getState();
    if (store.accountId !== accountId) store.reset(accountId);
  }, [accountId]);

  useEffect(() => {
    if (accountId && favorites.ready) useFavoritesScanStore.getState().prune(symbols);
  }, [accountId, favorites.ready, symbols]);

  useEffect(() => {
    if (!active || !accountId || symbols.length === 0) return;
    const controller = new AbortController();
    let holding = false;
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;
    const post = (m: Message) => channel?.postMessage(m);
    if (channel) {
      channel.onmessage = (e: MessageEvent<Message>) => {
        const m = e.data;
        const store = useFavoritesScanStore.getState();
        if (m.accountId !== accountId) return;
        if (m.type === 'put' && !holding) store.put(accountId, m.symbol, m.formed, m.at, m.gap);
        if (m.type === 'hello' && holding) {
          const { results, gaps, doneAt } = store;
          post({ type: 'snapshot', accountId, results, gaps, doneAt });
        }
        if (m.type === 'snapshot' && !holding) store.applySnapshot(accountId, { results: m.results, gaps: m.gaps, doneAt: m.doneAt });
      };
      post({ type: 'hello', accountId });
    }
    const run = async () => {
      holding = true;
      try {
        await scanLoop(accountId, symbols, offsetSec, controller.signal, post);
      } finally {
        holding = false;
      }
    };
    if (typeof navigator !== 'undefined' && navigator.locks) {
      // Wartet, bis der Tab mit dem Lock schließt; Abbrechen während des Wartens wirft AbortError
      navigator.locks.request(`${LOCK_NAME}:${accountId}`, { signal: controller.signal }, run).catch((err) => {
        if (!isAbortError(err)) console.error('Favorites scan lock failed', err);
      });
    } else {
      void run();
    }
    return () => {
      controller.abort();
      channel?.close();
    };
  }, [active, accountId, symbols, offsetSec]);

  return null;
}
