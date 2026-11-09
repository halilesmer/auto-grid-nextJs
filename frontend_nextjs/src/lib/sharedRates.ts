import axios from 'axios';
import { fetchRates, type RatesQuery, type RatesResponse } from '@/services/marketApi';

/**
 * 1107-A21.19: Hooks, die denselben Kerzenbereich lesen (Chart, Formationssuche, Trendzug), teilen
 * 1. eine laufende Anfrage (gleiches Konto, Symbol, Zeitrahmen, from, to) und
 * 2. einen 60-s-Takt je (Konto, Symbol, Zeitrahmen, Ende), der alle Abonnenten im selben Zug weckt.
 * Ohne Abonnenten läuft nichts mehr (Anfrage wird abgebrochen, Takt gestoppt).
 */

interface InFlight {
  promise: Promise<RatesResponse>;
  controller: AbortController;
  refs: number;
}

const inFlight = new Map<string, InFlight>();

// Wie ein abgebrochener axios-Aufruf, damit isAbortError ihn erkennt
const abortError = () => new axios.CanceledError('canceled');

/** Wie fetchRates, aber eine gleiche laufende Anfrage wird mitgenutzt; `signal` bricht nur diesen Abonnenten ab */
export function sharedFetchRates(accountId: string, query: RatesQuery, signal: AbortSignal): Promise<RatesResponse> {
  if (signal.aborted) return Promise.reject(abortError());
  // Schlüssel aus allen Feldern der Anfrage: ein neues Feld trennt Anfragen von selbst
  const key = `${accountId}|${JSON.stringify(Object.entries(query).sort())}`;
  let entry = inFlight.get(key);
  if (!entry) {
    const controller = new AbortController();
    const created: InFlight = { controller, refs: 0, promise: undefined as unknown as Promise<RatesResponse> };
    created.promise = fetchRates(accountId, query, controller.signal).finally(() => {
      if (inFlight.get(key) === created) inFlight.delete(key);
    });
    // Kein Abonnent mehr, der zuhört: Fehler nach dem Abbruch nicht als unbehandelt melden
    created.promise.catch(() => {});
    inFlight.set(key, created);
    entry = created;
  }
  const shared = entry;
  shared.refs += 1;
  return new Promise<RatesResponse>((resolve, reject) => {
    let done = false;
    const release = () => {
      signal.removeEventListener('abort', onAbort);
      shared.refs -= 1;
    };
    const onAbort = () => {
      if (done) return;
      done = true;
      release();
      // Der letzte Abonnent geht: die Anfrage selbst abbrechen und aus der Liste nehmen
      if (shared.refs === 0) {
        if (inFlight.get(key) === shared) inFlight.delete(key);
        shared.controller.abort();
      }
      reject(abortError());
    };
    signal.addEventListener('abort', onAbort);
    shared.promise.then(
      (res) => {
        if (done) return;
        done = true;
        release();
        resolve(res);
      },
      (err) => {
        if (done) return;
        done = true;
        release();
        reject(err);
      },
    );
  });
}

interface Ticker {
  timer: ReturnType<typeof setInterval>;
  subs: Set<() => void>;
}

const tickers = new Map<string, Ticker>();

/** Ruft `fn` alle `ms` Millisekunden, zusammen mit allen anderen Abonnenten desselben `key`; gibt die Abmeldung zurück */
export function subscribeTick(key: string, ms: number, fn: () => void): () => void {
  let ticker = tickers.get(key);
  if (!ticker) {
    const subs = new Set<() => void>();
    ticker = { subs, timer: setInterval(() => [...subs].forEach((f) => { try { f(); } catch { /* ein Abonnent darf die übrigen nicht aufhalten */ } }), ms) };
    tickers.set(key, ticker);
  }
  const mine = ticker;
  // Eigene Hülle, damit dieselbe Funktion zweimal angemeldet werden kann
  const entry = () => fn();
  mine.subs.add(entry);
  return () => {
    mine.subs.delete(entry);
    if (mine.subs.size === 0) {
      clearInterval(mine.timer);
      if (tickers.get(key) === mine) tickers.delete(key);
    }
  };
}
