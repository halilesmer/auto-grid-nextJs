'use client';

import { useEffect, useMemo } from 'react';

import { useAccounts } from '@/components/account/hooks';
import { useAccountSettings } from '@/hooks/useAccountSettings';
import { useBrokerClock } from '@/hooks/useBrokerClock';
import { useChartParams } from '@/hooks/useChartParams';
import { brokerToday, DAY_SEC, dayStart, presetRange, rangeBounds } from '@/lib/serverTime';
import { selectAccount, useAccountStore, useSettingsStore } from '@/store';

/** Neuer Versuch nach einem fehlgeschlagenen Laden der Konten */
const ACCOUNTS_RETRY_MS = 10_000;

/**
 * Gemeinsamer Stand von /chart und /stats (UI-23): Konto aus der Adresse (sonst das gewählte), Zonen des Kontos, Brokeruhr und
 * der Zeitraum in MT5-Sekunden. Die Adresse ist die Quelle (useChartParams, Regeln: lib/chart/chartUrl.ts, docs/analyse-regeln.md).
 */
export function useChartContext() {
  const params = useChartParams();
  const { accountId: urlAccount, range, adoptAccount } = params;
  const accounts = useAccountStore((s) => s.accounts);
  const selected = useAccountStore((s) => s.selectedAccount);
  const settings = useSettingsStore((s) => s.settings);
  const loadedAccount = useSettingsStore((s) => s.loadedAccount);
  const { fetchAccounts } = useAccounts();

  const accountId = urlAccount ?? selected;
  // Erst mit geladener Liste: ein unbekanntes/fremdes Konto aus der Adresse wird nie global gewählt
  const accountKnown = accounts.some((a) => String(a.id) === accountId);

  // Direkt aufgerufen (Neuladen, Link): Kontoliste selbst laden. Schlägt das erste Laden fehl (der Worker startet gerade neu), bliebe die Auswahl sonst leer:
  // neuer Versuch im Takt, erst nach dem Ende des vorigen geplant (eine hängende Anfrage stapelt keine weiteren)
  const accountsLoaded = accounts.length > 0;
  useEffect(() => {
    if (accountsLoaded) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      await fetchAccounts();
      if (!stopped) timer = setTimeout(load, ACCOUNTS_RETRY_MS);
    };
    void load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [accountsLoaded, fetchAccounts]);

  // Die Adresse ist die Quelle: sie wählt das Konto global (Dashboard und WebSocket folgen). Ohne
  // ?account= wird das schon gewählte Konto in die Adresse übernommen. Die Kontoauswahl ändert nur die
  // Adresse; so gibt es keinen Zwischenstand, in dem Store und Adresse verschiedene Konten nennen.
  useEffect(() => {
    if (urlAccount) {
      if (accountKnown && urlAccount !== useAccountStore.getState().selectedAccount) selectAccount(urlAccount);
    } else if (selected) {
      adoptAccount(selected);
    }
  }, [urlAccount, selected, accountKnown, adoptAccount]);

  // Ungespeicherte Zonen-Änderungen bleiben: nur laden, wenn noch nicht die Zonen dieses Kontos da sind
  const settingsError = useAccountSettings(accountKnown ? accountId : null, 'ifMissing');
  const zones = useMemo(
    () => (accountId && loadedAccount === accountId && settings ? (settings.ZONES ?? []) : null),
    [accountId, loadedAccount, settings],
  );

  const clock = useBrokerClock(accountKnown ? accountId : null);
  // Ohne sichere Messung in UTC (docs/analyse-regeln.md §1); der Hinweis darüber sagt es
  const offsetSec = clock.clock?.reliable ? clock.clock.offset_sec : null;
  const today = brokerToday(offsetSec ?? 0);
  // Zeitraum in MT5-Sekunden, halb offen; „alles“ endet mit dem heutigen Brokertag
  const bounds = useMemo(() => {
    const days = 'preset' in range ? presetRange(range.preset, today) : range.custom;
    const b = rangeBounds(days);
    return { from: b.from, to: b.to ?? dayStart(today) + DAY_SEC };
  }, [range, today]);

  return { params, accounts, accountId, accountKnown, zones, settingsError, clock, offsetSec, today, bounds };
}
