'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@/i18n';
import { runningBar, type Bar, type MissingRange } from '@/lib/analysis/candles';
import { FormationContext, type ContextInput } from '@/lib/formation/context';
import type { ContextTimeframe } from '@/lib/formation/params';
import { formationRequests } from '@/lib/formation/requests';
import { splitDaily } from '@/lib/formation/weekly';
import { scanFormations, scanTime, type ScanHit } from '@/lib/formation/scan';
import { scanSignature } from '@/lib/formation/scanKey';
import { trendFingerprint } from '@/lib/formation/trdPath';
import { pastDayEnd, pastRequestEnd } from '@/lib/formation/asOf';
import { brokerNow, brokerToday, DAY_SEC, dayStart } from '@/lib/serverTime';
import { useMarketRates } from '@/hooks/useMarketRates';
import { useAnalysisPrefsStore } from '@/store/useAnalysisPrefsStore';

export interface FormationScan {
  loading: boolean;
  error: string | null;
  hits: ScanHit[];
  context: FormationContext | null;
  /** Zeitpunkt der Suche (MT5-Sekunden): Anfang der laufenden M15-Kerze */
  scanAt: number | null;
  /** Rechenzeit der letzten Suche in Millisekunden */
  scanMs: number | null;
  /** Wie oft die Suche dieser Seite gerechnet hat (nur zur Beobachtung in Tests: ein Entwurf darf sie nicht erhöhen) */
  scanRuns: number;
  digits: number | null;
  /** Laufende Kerze je Zeiteinheit mit dem gemeinsamen Preis, nur zur Anzeige (null: keine) */
  running: Record<ContextTimeframe, Bar | null>;
  /** Mindestens eine Zeiteinheit hat fehlende Kerzen im geladenen Bereich (Datenlücke, ANA-04); die Seite zeigt im Vergangenheits-Stand einen Hinweis */
  hasGaps: boolean;
}

interface Settled {
  key: string;
  hits: ScanHit[];
  context: FormationContext | null;
  failed: boolean;
  scanAt: number;
  scanMs: number;
  runs: number;
}

const tfData = (data: { bars: Bar[]; liveFrom: number | null } | null) => ({ bars: data?.bars ?? [], liveFrom: data?.liveFrom ?? null });

/**
 * Lädt D1/H4/H1/M15 des Symbols (jeweils mit dem 60-s-Nachladen von useMarketRates) und sucht alle Formationen
 * auf allen Zeiteinheiten. Die Suche läuft neu, sobald sich die geschlossenen Daten einer Zeiteinheit ändern
 * (scanSignature; jede Zeiteinheit lädt mit eigenem Takt, eine höhere kann nach M15 kommen), und bei Wechsel
 * von Konto oder Symbol; zwischen zwei Kerzen ändert sich nichts Geschlossenes.
 */
export function useFormationScan(
  accountId: string | null,
  symbol: string | null,
  offsetSec: number | null,
  clockReady: boolean,
  /** Suche zu einem Zeitpunkt in der Vergangenheit (MT5-Sekunden, auf 15 min gerundet, aus resolveAsOf); null = live */
  pastAt: number | null = null,
): FormationScan {
  const nowSec = useCallback(() => (offsetSec !== null ? brokerNow(offsetSec) : Date.now() / 1000), [offsetSec]);
  const dayEnd = pastAt !== null ? pastDayEnd(pastAt) : dayStart(brokerToday(offsetSec ?? 0)) + DAY_SEC;
  const to = pastAt !== null ? pastRequestEnd(pastAt) : dayEnd;
  const requests = useMemo(() => {
    if (!accountId || !symbol || !clockReady) return null;
    return formationRequests(accountId, symbol, to);
  }, [accountId, symbol, clockReady, to]);
  const d1 = useMarketRates(requests?.D1 ?? null, nowSec);
  const h4 = useMarketRates(requests?.H4 ?? null, nowSec);
  const h1 = useMarketRates(requests?.H1 ?? null, nowSec);
  const m15 = useMarketRates(requests?.M15 ?? null, nowSec);
  const ready = requests !== null;
  // Grundlage der Formationen (Trend-Einstellungen im Chart); ein Wechsel löst eine neue Suche aus
  const trend = useAnalysisPrefsStore((st) => st.trend);
  const trendKey = trendFingerprint(trend);
  useEffect(() => { useAnalysisPrefsStore.persist.rehydrate(); }, []);

  const loadError = d1.error ?? h4.error ?? h1.error ?? m15.error;
  const allLoaded = Boolean(d1.data && h4.data && h1.data && m15.data && m15.data.bars.length > 0);

  const lastM15 = m15.data?.bars[m15.data.bars.length - 1];
  const liveAt = lastM15 && m15.data ? scanTime(lastM15.time, m15.data.liveFrom === lastM15.time) : null;
  // Nie hinter die laufende Kerze: ohne verlässliche Brokeruhr könnte pastAt in der Zukunft liegen (vorläufige Werte)
  const at = pastAt !== null && liveAt !== null ? Math.min(pastAt, liveAt) : (pastAt ?? liveAt);
  const signature = allLoaded && at !== null
    ? scanSignature({ D1: tfData(d1.data), H4: tfData(h4.data), H1: tfData(h1.data), M15: tfData(m15.data) }, at)
    : null;
  // Ein neuer fehlender Bereich trennt Fraktal-Nachbarn: auch ohne neue Kerze neu suchen
  const gaps = [d1, h4, h1, m15].map((r) => r.data?.missing.map((m) => `${m.from}-${m.to}`).join(';') ?? '').join(',');
  const key = signature !== null ? `${accountId}|${symbol}|${at}|${trendKey}|${signature}|${gaps}` : null;

  // Neuester Stand der Kerzen für die Suche, ohne sie bei jedem Nachladen neu zu starten
  const latest = useRef<ContextInput>({});
  useEffect(() => {
    const input = (d: { bars: Bar[]; missing: MissingRange[] } | null) => ({ bars: d?.bars ?? [], missing: d?.missing ?? [] });
    const daily = splitDaily(d1.data?.bars ?? [], d1.data?.missing ?? [], dayEnd);
    latest.current = { D1: daily.d1, W1: daily.w1, H4: input(h4.data), H1: input(h1.data), M15: input(m15.data) };
  });

  const [settled, setSettled] = useState<Settled | null>(null);
  useEffect(() => {
    if (!key || at === null) return;
    // Rechnung nach dem nächsten Anstrich, damit die Seite nicht beim Laden einfriert
    const timer = setTimeout(() => {
      const started = performance.now();
      try {
        const context = new FormationContext(symbol as string, latest.current, { trend });
        const hits = scanFormations(context, at);
        setSettled((prev) => ({ key, hits, context, failed: false, scanAt: at, scanMs: Math.round(performance.now() - started), runs: (prev?.runs ?? 0) + 1 }));
      } catch (err) {
        // Ungültige Kerzen vom Worker (Reihenfolge, NaN): Meldung statt die Seite zu stören; die technische
        // Meldung der Bibliothek ist deutsch und nur für Entwickler, daher nur in der Konsole
        console.error('Formation scan failed', err);
        setSettled((prev) => ({ key, hits: [], context: null, failed: true, scanAt: at, scanMs: Math.round(performance.now() - started), runs: (prev?.runs ?? 0) + 1 }));
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [key, at, symbol, trend]);

  // Gemeinsamer Preis: Schluss der laufenden M15-Kerze, so zeigen alle Zeiteinheiten denselben aktuellen Preis
  const price = pastAt === null && lastM15 && lastM15.time === m15.data?.liveFrom ? lastM15.close : null;
  const running = useMemo<Record<ContextTimeframe, Bar | null>>(() => ({
    D1: runningBar(d1.data, price),
    H4: runningBar(h4.data, price),
    H1: runningBar(h1.data, price),
    M15: runningBar(m15.data, price),
  }), [d1.data, h4.data, h1.data, m15.data, price]);

  const current = settled && settled.key === key ? settled : null;
  // Ein Stand vor der ersten M15-Kerze des Verlaufs: nichts zu suchen, die Seite zeigt den Lückenhinweis statt ewig zu laden (A13.6.5)
  const beforeHistory = pastAt !== null && m15.data !== null && m15.data.bars.length === 0;
  // Bei jedem Render übersetzt, damit ein Sprachwechsel die stehende Meldung mitnimmt
  const scanError = current?.failed ? t('formation.scan.badData') : null;
  return {
    loading: ready && !loadError && !current && !beforeHistory,
    error: loadError ?? scanError,
    hits: current?.hits ?? [],
    context: current?.context ?? null,
    scanAt: current?.scanAt ?? null,
    scanMs: current?.scanMs ?? null,
    scanRuns: settled?.runs ?? 0,
    digits: m15.data?.digits ?? null,
    running,
    hasGaps: beforeHistory || gaps.replace(/[,]/g, '') !== '',
  };
}
