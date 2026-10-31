'use client';

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { loadAll } from '@/hooks/useMarketRates';
import { useBrokerClock } from '@/hooks/useBrokerClock';
import { useFavorites, useFavoritesLoader } from '@/hooks/useFavorites';
import { isAbortError } from '@/lib/apiError';
import { ratesWindow, TIMEFRAME_SEC, type Bar } from '@/lib/analysis/candles';
import { evaluateAlarm, type AlarmMemory, type AlarmNotice } from '@/lib/formation/alarm';
import { announce } from '@/lib/formation/alarmNotify';
import { save, serverSnapshot, snapshot, subscribe } from '@/lib/formation/alarmStore';
import { FormationContext, type ContextInput } from '@/lib/formation/context';
import { CONTEXT_TIMEFRAMES } from '@/lib/formation/params';
import { formationRequests } from '@/lib/formation/requests';
import { formedHits, scanFormations, scanTime, type FormedHit, type ScanHit } from '@/lib/formation/scan';
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
  | { type: 'notices'; accountId: string; notices: AlarmNotice[]; sinceOpening: boolean }
  | { type: 'snapshot'; accountId: string; results: Record<string, FormedHit[]>; gaps: Record<string, ScanGap>; doneAt: Record<string, number>; lastRunAt: number | null };

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

/** Konten, deren erster Durchlauf nach dem Öffnen der App schon gemeldet hat: danach gibt es keine Sammelmeldung „seit dem letzten Öffnen“ mehr */
const reportedSinceOpening = new Set<string>();

/** Alarm-Produkte, die dieser Tab schon verglichen hat. Ein Tab, der den Lock mitten im Durchlauf übernimmt, vergleicht sie einmal neu, auch wenn `doneAt` sie schon als gesucht führt. */
const comparedHere = new Set<string>();

/** Alarm-Auswertung für ein Produkt: Stand vergleichen und merken. Ohne gemerkten Stand (Produkt neu im Alarm) merkt sie still. */
function compareAlarm(accountId: string, symbol: string, hits: readonly ScanHit[], pending: Record<string, AlarmMemory>): AlarmNotice[] {
  const scope = `${accountId}|${symbol}`;
  const current = snapshot();
  const known = pending[scope] ?? current.memory[scope];
  const result = evaluateAlarm(symbol, hits, known ?? {}, current.prefs, known === undefined);
  // Der Stand wird erst mit der Meldung gespeichert (flushAlarm): schließt der Tab mitten im Durchlauf, wird nichts als gesehen gemerkt, das nie gemeldet wurde
  pending[scope] = result.memory;
  comparedHere.add(scope);
  return result.notices;
}

/** Ein Produkt: vier Zeiteinheiten laden, suchen, nur gebildete Treffer behalten. Rechenzeit geht in `spent`. */
async function scanSymbol(accountId: string, symbol: string, to: number, signal: AbortSignal, spent: { ms: number }): Promise<{ formed: FormedHit[]; hits: ScanHit[]; gap: ScanGap | null }> {
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
  if (!m15 || !last) return { formed: [], hits: [], gap: 'missing' };
  const at = scanTime(last.time, m15.liveFrom === last.time);
  const hits = scanFormations(new FormationContext(symbol, input), at);
  spent.ms += performance.now() - started;
  return { formed: formedHits(hits), hits, gap };
}

interface AlarmRun {
  /** Produkte dieses Durchlaufs, für die der Alarm gilt (Favoriten bei „Alle Favoriten“ plus Glocken-Produkte) */
  symbols: ReadonlySet<string>;
  /** Die Produkte, für die der Alarm jetzt gilt (kann sich mitten im Durchlauf ändern, z. B. Glocke aus) */
  currentSymbols: () => ReadonlySet<string>;
  navigate: (url: string) => void;
}

/**
 * Meldet die gesammelten Treffer eines Durchlaufs; der erste vollständige Durchlauf nach dem Öffnen fasst Verpasstes zusammen.
 * Ein abgebrochener Durchlauf (Kontowechsel, neue Uhr) zählt nicht als erster: sonst kämen die Treffer des nächsten einzeln.
 */
function flushAlarm(accountId: string, run: { notices: AlarmNotice[]; memory: Record<string, AlarmMemory>; completed: boolean }, alarm: AlarmRun, post: (m: Message) => void) {
  const { completed } = run;
  // Ein Produkt, dessen Glocke seit dem Vergleich ausgeschaltet wurde, meldet nichts und behält keinen Stand
  const live = alarm.currentSymbols();
  const inAlarm = (symbol: string) => live.has(symbol);
  const notices = run.notices.filter((notice) => inAlarm(notice.symbol));
  const memory = Object.fromEntries(Object.entries(run.memory).filter(([scope]) => inAlarm(scope.slice(accountId.length + 1))));
  if (Object.keys(memory).length > 0) {
    const current = snapshot();
    save({ ...current, memory: { ...current.memory, ...memory } });
  }
  const sinceOpening = !reportedSinceOpening.has(accountId);
  if (completed) reportedSinceOpening.add(accountId);
  announce(accountId, notices, { sinceOpening, prefs: snapshot().prefs, navigate: alarm.navigate });
  // Die anderen Tabs zeigen die Karte; Systemmeldung und Ton löst nur dieser Tab aus
  if (notices.length > 0) post({ type: 'notices', accountId, notices, sinceOpening });
}

async function scanLoop(accountId: string, symbols: string[], offsetSec: number | null, signal: AbortSignal, post: (m: Message) => void, alarm: AlarmRun) {
  const store = useFavoritesScanStore;
  while (!signal.aborted) {
    const nowSec = offsetSec !== null ? brokerNow(offsetSec) : Date.now() / 1000;
    const slot = Math.floor(nowSec / SLOT_SEC) * SLOT_SEC;
    const to = dayStart(brokerToday(offsetSec ?? 0)) + DAY_SEC;
    // Ein Alarm-Produkt ohne gemerkten Stand (gerade eingeschaltet) oder von diesem Tab noch nie verglichen (Lock übernommen) wird gleich verglichen, nicht erst mit der nächsten Kerze
    const needsCompare = (s: string) => {
      const scope = `${accountId}|${s}`;
      return alarm.symbols.has(s) && !store.getState().gaps[s] && (snapshot().memory[scope] === undefined || !comparedHere.has(scope));
    };
    const todo = symbols.filter((s) => store.getState().doneAt[s] !== slot || needsCompare(s));
    if (todo.length === 0) {
      // Ein abgebrochener Durchgang kann eine Anzeige hinterlassen haben
      store.getState().setProgress(accountId, null);
      // Alles ist schon gesucht (z. B. nach Übernahme des Locks): der Durchlauf nach dem Öffnen war damit der erste
      reportedSinceOpening.add(accountId);
    } else {
      const spent = { ms: 0 };
      const run = { notices: [] as AlarmNotice[], memory: {} as Record<string, AlarmMemory>, completed: false };
      store.getState().setProgress(accountId, { done: 0, total: todo.length });
      try {
        for (const [i, symbol] of todo.entries()) {
          if (signal.aborted) return;
          let formed: FormedHit[] = store.getState().results[symbol] ?? [];
          let hits: ScanHit[] = [];
          let gap: ScanGap | null = null;
          try {
            ({ formed, hits, gap } = await scanSymbol(accountId, symbol, to, signal, spent));
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
          // Mit Lücke oder Fehler wird nicht verglichen: der gemerkte Stand bleibt, damit nichts verloren geht
          if (gap === null && alarm.symbols.has(symbol)) run.notices.push(...compareAlarm(accountId, symbol, hits, run.memory));
          store.getState().setProgress(accountId, { done: i + 1, total: todo.length });
          // Oberfläche zwischen zwei Produkten freigeben
          await sleep(0, signal);
        }
        run.completed = true;
      } finally {
        // Auch ein abgebrochener Durchgang meldet, was er schon verglichen und gemerkt hat
        flushAlarm(accountId, run, alarm, post);
      }
      store.getState().addMs(accountId, Math.round(spent.ms), true);
      store.getState().setProgress(accountId, null);
    }
    await sleep(CHECK_MS, signal);
  }
}

/** Konto-Teil eines Alarm-Schlüssels `${konto}|${symbol}` → Symbole dieses Kontos */
const symbolsOf = (accountId: string, scopes: readonly string[]) => scopes.filter((x) => x.startsWith(`${accountId}|`)).map((x) => x.slice(accountId.length + 1));

/**
 * Suche über die Favoriten (FRM-29) und Alarm (FRM-30), ohne Oberfläche. Im Layout, damit beides unabhängig von der Seite läuft.
 * Gesucht werden die Favoriten und die Produkte mit eingeschalteter Glocke; der Alarm gilt für die Glocken-Produkte und, bei
 * „Alle Favoriten“, für die Favoriten. Es sucht und meldet nur ein Tab (Web Lock); die anderen Tabs bekommen die Ergebnisse
 * über einen BroadcastChannel. Ohne gewähltes Konto oder ohne Produkt ruht die Suche.
 */
export default function FormationScanRunner() {
  const router = useRouter();
  const accountId = useAccountStore((s) => s.selectedAccount);
  useFavoritesLoader(accountId);
  const favorites = useFavorites(accountId);
  const clock = useBrokerClock(accountId);
  const stored = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const offsetSec = clock.clock?.reliable ? clock.clock.offset_sec : null;
  const favoritesKey = favorites.symbols.join('|');
  const bellKey = accountId ? symbolsOf(accountId, stored.enabled).sort().join('|') : '';
  const favoritesAlarm = accountId !== null && stored.favoritesEnabled.includes(accountId);
  // Aus Schlüsseln abgeleitet, damit eine neue Liste mit gleichem Inhalt die Suche nicht neu startet
  const { symbols, alarmSymbols } = useMemo(() => {
    const favorite = favoritesKey ? favoritesKey.split('|') : [];
    const bells = bellKey ? bellKey.split('|') : [];
    return { symbols: [...new Set([...favorite, ...bells])], alarmSymbols: [...new Set([...(favoritesAlarm ? favorite : []), ...bells])] };
  }, [favoritesKey, bellKey, favoritesAlarm]);
  const alarmKey = alarmSymbols.join('|');
  // Der Durchlauf liest die aktuellen Alarm-Produkte über diese Referenz, nicht die beim Start
  const alarmKeyRef = useRef(alarmKey);
  useEffect(() => {
    alarmKeyRef.current = alarmKey;
  }, [alarmKey]);
  const active = accountId !== null && favorites.ready && !clock.loading;

  useEffect(() => {
    const store = useFavoritesScanStore.getState();
    if (store.accountId !== accountId) store.reset(accountId);
  }, [accountId]);

  useEffect(() => {
    if (accountId && favorites.ready) useFavoritesScanStore.getState().prune(symbols);
  }, [accountId, favorites.ready, symbols]);

  // Der gemerkte Stand eines Produkts, das nicht mehr im Alarm ist, fällt weg: beim Wiedereinschalten wird er still neu gemerkt
  useEffect(() => {
    if (!accountId || !favorites.ready) return;
    const current = snapshot();
    const keep = new Set(alarmKey ? alarmKey.split('|') : []);
    const stale = Object.keys(current.memory).filter((scope) => scope.startsWith(`${accountId}|`) && !keep.has(scope.slice(accountId.length + 1)));
    if (stale.length === 0) return;
    save({ ...current, memory: Object.fromEntries(Object.entries(current.memory).filter(([scope]) => !stale.includes(scope))) });
  }, [accountId, favorites.ready, alarmKey]);

  // Klick auf eine Systemmeldung: der Service Worker fokussiert das Fenster und schickt die Adresse
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
    const onMessage = (event: MessageEvent<{ type?: string; url?: string }>) => {
      if (event.data?.type === 'formation-alarm-open' && typeof event.data.url === 'string') router.push(event.data.url);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [router]);

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
          const { results, gaps, doneAt, lastRunAt } = store;
          post({ type: 'snapshot', accountId, results, gaps, doneAt, lastRunAt });
        }
        if (m.type === 'notices' && !holding) announce(accountId, m.notices, { sinceOpening: m.sinceOpening, prefs: { ...snapshot().prefs, system: false, sound: false }, navigate: (url) => router.push(url) });
        if (m.type === 'snapshot' && !holding) store.applySnapshot(accountId, { results: m.results, gaps: m.gaps, doneAt: m.doneAt, lastRunAt: m.lastRunAt });
      };
      post({ type: 'hello', accountId });
    }
    const asSet = (key: string) => new Set(key ? key.split('|') : []);
    const alarm: AlarmRun = { symbols: asSet(alarmKey), currentSymbols: () => asSet(alarmKeyRef.current), navigate: (url) => router.push(url) };
    // Der Kanal bleibt offen, bis auch ein abgebrochener Durchlauf seine Meldungen verschickt hat (flushAlarm)
    let finished: Promise<void> = Promise.resolve();
    const run = () => {
      finished = (async () => {
        holding = true;
        try {
          await scanLoop(accountId, symbols, offsetSec, controller.signal, post, alarm);
        } finally {
          holding = false;
        }
      })();
      return finished;
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
      void finished.finally(() => channel?.close());
    };
  }, [active, accountId, symbols, alarmKey, offsetSec, router]);

  return null;
}
