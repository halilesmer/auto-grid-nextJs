'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@/i18n';
import { runningBar, type Bar } from '@/lib/analysis/candles';
import { FormationContext, type ContextInput } from '@/lib/formation/context';
import type { ContextTimeframe } from '@/lib/formation/params';
import { formationRequests } from '@/lib/formation/requests';
import { scanFormations, scanTime, type ScanHit } from '@/lib/formation/scan';
import { brokerNow, brokerToday, DAY_SEC, dayStart } from '@/lib/serverTime';
import { useMarketRates } from '@/hooks/useMarketRates';

export interface FormationScan {
  loading: boolean;
  error: string | null;
  hits: ScanHit[];
  context: FormationContext | null;
  /** Zeitpunkt der Suche (MT5-Sekunden): Anfang der laufenden M15-Kerze */
  scanAt: number | null;
  /** Rechenzeit der letzten Suche in Millisekunden */
  scanMs: number | null;
  digits: number | null;
  /** Laufende Kerze je Zeiteinheit mit dem gemeinsamen Preis, nur zur Anzeige (null: keine) */
  running: Record<ContextTimeframe, Bar | null>;
}

interface Settled {
  key: string;
  hits: ScanHit[];
  context: FormationContext | null;
  error: string | null;
  scanAt: number;
  scanMs: number;
}

/**
 * Lädt D1/H4/H1/M15 des Symbols (jeweils mit dem 60-s-Nachladen von useMarketRates) und sucht alle Formationen
 * auf allen Zeiteinheiten. Die Suche läuft neu, sobald sich die letzte geschlossene M15-Kerze ändert, und bei
 * Wechsel von Konto oder Symbol; zwischen zwei M15-Kerzen ändert sich keine geschlossene Kerze.
 */
export function useFormationScan(accountId: string | null, symbol: string | null, offsetSec: number | null, clockReady: boolean): FormationScan {
  const nowSec = useCallback(() => (offsetSec !== null ? brokerNow(offsetSec) : Date.now() / 1000), [offsetSec]);
  const to = dayStart(brokerToday(offsetSec ?? 0)) + DAY_SEC;
  const requests = useMemo(() => {
    if (!accountId || !symbol || !clockReady) return null;
    return formationRequests(accountId, symbol, to);
  }, [accountId, symbol, clockReady, to]);
  const d1 = useMarketRates(requests?.D1 ?? null, nowSec);
  const h4 = useMarketRates(requests?.H4 ?? null, nowSec);
  const h1 = useMarketRates(requests?.H1 ?? null, nowSec);
  const m15 = useMarketRates(requests?.M15 ?? null, nowSec);
  const ready = requests !== null;

  const loadError = d1.error ?? h4.error ?? h1.error ?? m15.error;
  const allLoaded = Boolean(d1.data && h4.data && h1.data && m15.data && m15.data.bars.length > 0);

  const lastM15 = m15.data?.bars[m15.data.bars.length - 1];
  const at = lastM15 && m15.data ? scanTime(lastM15.time, m15.data.liveFrom === lastM15.time) : null;
  const key = allLoaded && at !== null ? `${accountId}|${symbol}|${at}` : null;

  // Neuester Stand der Kerzen für die Suche, ohne sie bei jedem Nachladen neu zu starten
  const latest = useRef<ContextInput>({});
  useEffect(() => {
    const bars = (b: Bar[] | undefined) => b ?? [];
    latest.current = { D1: bars(d1.data?.bars), H4: bars(h4.data?.bars), H1: bars(h1.data?.bars), M15: bars(m15.data?.bars) };
  });

  const [settled, setSettled] = useState<Settled | null>(null);
  useEffect(() => {
    if (!key || at === null) return;
    // Rechnung nach dem nächsten Anstrich, damit die Seite nicht beim Laden einfriert
    const timer = setTimeout(() => {
      const started = performance.now();
      try {
        const context = new FormationContext(symbol as string, latest.current);
        const hits = scanFormations(context, at);
        setSettled({ key, hits, context, error: null, scanAt: at, scanMs: Math.round(performance.now() - started) });
      } catch (err) {
        // Ungültige Kerzen vom Worker (Reihenfolge, NaN): als Meldung zeigen statt die Seite zu stören
        setSettled({ key, hits: [], context: null, error: err instanceof Error ? err.message : t('formation.scan.failed'), scanAt: at, scanMs: Math.round(performance.now() - started) });
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [key, at, symbol]);

  // Gemeinsamer Preis: Schluss der laufenden M15-Kerze, so zeigen alle Zeiteinheiten denselben aktuellen Preis
  const price = lastM15 && lastM15.time === m15.data?.liveFrom ? lastM15.close : null;
  const running = useMemo<Record<ContextTimeframe, Bar | null>>(() => ({
    D1: runningBar(d1.data, price),
    H4: runningBar(h4.data, price),
    H1: runningBar(h1.data, price),
    M15: runningBar(m15.data, price),
  }), [d1.data, h4.data, h1.data, m15.data, price]);

  const current = settled && settled.key === key ? settled : null;
  return {
    loading: ready && !loadError && !current,
    error: loadError ?? current?.error ?? null,
    hits: current?.hits ?? [],
    context: current?.context ?? null,
    scanAt: current?.scanAt ?? null,
    scanMs: current?.scanMs ?? null,
    digits: m15.data?.digits ?? null,
    running,
  };
}
