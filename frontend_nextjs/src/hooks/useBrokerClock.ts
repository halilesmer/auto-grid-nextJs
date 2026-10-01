'use client';

import { useEffect, useState } from 'react';
import { t } from '@/i18n';
import { getApiErrorMessage } from '@/lib/apiError';
import { fetchBrokerClock, type BrokerClock } from '@/services/marketApi';

export interface BrokerClockState {
  /** Gemessener Abstand der Brokeruhr zu UTC in Sekunden; null = unbekannt */
  clock: BrokerClock | null;
  error: string | null;
  loading: boolean;
}

/** Ohne sichere Messung (Fehler, Konto belegt, Markt zu) erneut fragen */
const RETRY_MS = 60_000;

/**
 * Brokeruhr des Kontos (für „Heute“, „diese Woche“ … im Kalender). Der Worker merkt sich die Messung
 * 10 min; hier wird beim Kontowechsel gefragt und, solange keine sichere Messung da ist, jede Minute
 * erneut. Eine verspätete Antwort für ein anderes Konto wird verworfen.
 */
export function useBrokerClock(accountId: string | null): BrokerClockState {
  const [state, setState] = useState<BrokerClockState & { accountId: string | null; attempt: number }>({
    accountId: null,
    clock: null,
    error: null,
    loading: false,
    attempt: 0,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!accountId) return;
    let stale = false;
    fetchBrokerClock(accountId)
      .then((clock) => {
        if (!stale) setState({ accountId, clock, error: null, loading: false, attempt });
      })
      .catch(async (err) => {
        const error = await getApiErrorMessage(err, t('analysis.clock.fetchFailed'));
        if (!stale) setState({ accountId, clock: null, error, loading: false, attempt });
      });
    return () => {
      stale = true;
    };
  }, [accountId, attempt]);

  const unsure = state.accountId === accountId && !state.loading && !state.clock?.reliable;
  useEffect(() => {
    if (!unsure) return;
    const timer = setTimeout(() => setAttempt((a) => a + 1), RETRY_MS);
    return () => clearTimeout(timer);
  }, [unsure, state.attempt]);

  // Antwort für dieses Konto steht noch aus: Werte des vorigen Kontos nie zeigen
  if (state.accountId !== accountId) return { clock: null, error: null, loading: Boolean(accountId) };
  return { clock: state.clock, error: state.error, loading: state.loading };
}
