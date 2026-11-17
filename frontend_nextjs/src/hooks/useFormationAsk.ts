'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/components/ui/animated-toast';
import { t } from '@/i18n';
import type { ContextTimeframe } from '@/lib/formation/params';
import { hitsCount, type ScanHit } from '@/lib/formation/scan';

/** Ergebnis der ersten Suche seit der Freigabe: alle Kandidaten und die auf der Zeiteinheit der Meldung */
export interface AskResult {
  count: number;
  tf: ContextTimeframe;
  tfCount: number;
}

export type AskPhase = 'ask' | 'running' | 'failed' | 'declined' | 'idle';

interface AskInput {
  /** Konto + Symbol der Seite; ein neuer Schlüssel fragt neu (1114-A1.3: die Antwort wird nicht gemerkt) */
  key: string | null;
  /** Favoriten-Liste ist geladen (vorher weiß man nicht, ob gefragt werden muss) */
  favoritesReady: boolean;
  /** Das Symbol ist ein Favorit: keine Frage, die Suche startet nach den Kerzen von selbst (1114-A1.2) */
  favorite: boolean;
  /** Die eigenen Kerzen des Charts sind da (1114-A1.4) */
  chartReady: boolean;
}

/**
 * Frage „Formasyonlar aransın mı?“ (1114-A1), erster Teil: Antwort und Freigabe. `enabled` geht an `useFormationScan`:
 * die Suchanfragen starten erst nach der Antwort und nach den Kerzen des Charts (A1.4).
 */
export function useFormationAsk({ key, favoritesReady, favorite, chartReady: chartHere }: AskInput) {
  // Latch per symbol: the first candles are enough. A later reload of the chart (other timeframe, range) must not stop the search and start it again
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  // State adjustment during render (React docs: "storing information from previous renders"), no effect
  if (chartHere && key && loadedKey !== key) setLoadedKey(key);
  const chartReady = key !== null && loadedKey === key;
  const [answer, setAnswer] = useState<{ key: string; value: 'yes' | 'no' } | null>(null);
  const answered = answer && answer.key === key ? answer.value : null;
  const confirmed = key !== null && (answered === 'yes' || (favorite && favoritesReady));
  const [retrying, setRetrying] = useState(false);
  // Der Schlüssel, für den die erste Suche nach der Freigabe schon gemeldet wurde, und die Meldung des letzten Fehlers
  const [announced, setAnnounced] = useState<string | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!retrying) return;
    const frame = requestAnimationFrame(() => setRetrying(false));
    return () => cancelAnimationFrame(frame);
  }, [retrying]);

  const yes = useCallback(() => {
    if (!key) return;
    setAnnounced(null);
    setAnswer({ key, value: 'yes' });
  }, [key]);
  const no = useCallback(() => {
    if (key) setAnswer({ key, value: 'no' });
  }, [key]);
  const retry = useCallback(() => {
    setAnnounced(null);
    setAttempt((n) => n + 1);
    setRetrying(true);
  }, []);

  return { key, answered, confirmed, chartReady, favoritesReady, retrying, announced, setAnnounced, failedFor, setFailedFor, attempt, enabled: confirmed && chartReady && !retrying, yes, no, retry };
}

export type FormationAsk = ReturnType<typeof useFormationAsk>;

interface StatusInput {
  symbol: string | null;
  scan: { loading: boolean; error: string | null; scanAt: number | null; hits: readonly ScanHit[] };
  /** Zeiteinheit für das Ergebnis (Zeiteinheit des Chart, sonst H4) */
  tf: ContextTimeframe;
  /** Die erste Suche seit der Freigabe ist fertig: die Seite zeigt das Ergebnis (breit: Abzeichen in der Formationsreihe, 1117-C1.2 A; Telefon vorerst die Meldung) */
  onDone: (result: AskResult) => void;
}

/**
 * Zweiter Teil: Zustand der Leiste und das Ergebnis. Es kommt nur nach der ersten Suche seit der Freigabe (A1.6);
 * die stille Neusuche bei M15-Schluss meldet nichts. Wie das Ergebnis erscheint, entscheidet die Seite (`onDone`): die Meldung unten
 * verdeckte auf breiten Ansichten Bedienelemente des Charts (1117-C1.2 A). Ein Fehler meldet weiter rot, die Leiste bietet „Tekrar dene“.
 */
export function useFormationAskStatus(ask: FormationAsk, { symbol, scan, tf, onDone }: StatusInput): AskPhase {
  const { key, enabled, announced, setAnnounced, failedFor, setFailedFor, attempt } = ask;
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  const first = announced !== key;
  useEffect(() => {
    if (!enabled || !key || !symbol || !first || scan.loading) return;
    if (scan.error) {
      const marker = `${key}|${attempt}`;
      if (failedFor === marker) return;
      setFailedFor(marker);
      toast.error(t('formation.ask.failed', { symbol }), { title: t('common.error') });
      return;
    }
    if (scan.scanAt === null) return;
    setAnnounced(key);
    done.current({ count: hitsCount(scan.hits, {}), tf, tfCount: hitsCount(scan.hits, { tf }) });
  }, [enabled, key, symbol, first, scan.loading, scan.error, scan.scanAt, scan.hits, tf, attempt, failedFor, setAnnounced, setFailedFor]);

  if (!key || !ask.chartReady) return 'idle';
  if (ask.confirmed) {
    if (first && scan.error) return 'failed';
    if (first && (scan.loading || ask.retrying || scan.scanAt === null)) return 'running';
    return 'idle';
  }
  if (ask.answered === 'no') return 'declined';
  return ask.favoritesReady ? 'ask' : 'idle';
}
