'use client';

import { Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { BarChart3, CandlestickChart } from 'lucide-react';

import { ChartPage } from '@/components/chart-page/ChartPage';
import { OneChart } from '@/components/chart-page/OneChart';
import { ChartTopBar, type ChartChrome } from '@/components/chart-page/ChartTopBar';
import { ChartNotice } from '@/components/chart-page/ChartOverlays';
import { FormationAlarmMenu } from '@/components/formation/FormationAlarmMenu';
import { FormationAccountSelect } from '@/components/formation/FormationSelectors';
import { useAccounts } from '@/components/account/hooks';
import { BrokerClockNotice } from '@/components/analysis/BrokerClockNotice';
import { DateRangePicker } from '@/components/analysis/DateRangePicker';
import { ZoneSelect } from '@/components/analysis/ZoneSelect';
import { StatsTab } from '@/components/analysis/stats/StatsTab';
import AnimatedTabs from '@/components/ui/animated-tabs';
import { Alert } from '@/components/ui/alert';
import { useAccountSettings } from '@/hooks/useAccountSettings';
import { useBrokerClock } from '@/hooks/useBrokerClock';
import { useChartParams } from '@/hooks/useChartParams';
import { useFormationAlarm } from '@/hooks/useFormationAlarm';
import { useT } from '@/i18n';
import type { ChartTab } from '@/lib/chart/chartUrl';
import { brokerToday, DAY_SEC, dayStart, presetRange, rangeBounds } from '@/lib/serverTime';
import { selectAccount, useAccountStore, useSettingsStore } from '@/store';

/** Neuer Versuch nach einem fehlgeschlagenen Laden der Konten */
const ACCOUNTS_RETRY_MS = 10_000;

/**
 * Der Chart ohne bekanntes Konto: Kopfleiste mit Kontoauswahl und Alarm (der Alarm ruht und sagt warum), auf der Fläche der Hinweis.
 */
function NoAccountChart({ accountId, accountsKnown, chrome }: { accountId: string | null; accountsKnown: boolean; chrome: ChartChrome }) {
  const t = useT();
  const alarm = useFormationAlarm(null, null);
  let alert: ReactNode = null;
  if (!accountId) alert = <Alert className="absolute left-3 right-20 top-64 bg-background" tone="info" title={t('analysis.noAccount.title')}>{t('analysis.noAccount.text')}</Alert>;
  else if (accountsKnown) alert = <Alert className="absolute left-3 right-20 top-64 bg-background" tone="warning" title={t('analysis.noAccount.title')}>{t('analysis.account.notFound', { id: accountId })}</Alert>;
  return (
    <ChartPage
      title={t('nav.chart')}
      testId="chart-page"
      panelShown={false}
      panel={null}
      notices={null}
      floating={null}
      topBar={<ChartTopBar account={chrome.account} target={null} timeframes={null} range={chrome.range} view={chrome.view} tools={<FormationAlarmMenu symbol={null} alarm={alarm} pastView={false} />} />}
      surface={alert}
    />
  );
}

/**
 * Die eine Chartseite (/chart, plan 1107-A21): der Chart (`OneChart`) oder die Statistik für ein Konto und ein Setup; Zeitraum in Brokertagen, Standard „Alle“.
 * Der Zustand steht in der URL (useChartParams, Regeln: lib/chart/chartUrl.ts, docs/analyse-regeln.md). Alte Links mit `mode=`, `zone=` oder `tab=stats` öffnen die richtige Ansicht.
 */
function ChartRoot() {
  const t = useT();
  const { tab, accountId: urlAccount, symbol: urlSymbol, zoneId, range, setTab, setAccount, adoptAccount, setZone, setRange } = useChartParams();
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

  // Das Symbol des Charts: ?symbol=, sonst das Symbol der Zone aus ?zone= (alte Links), sonst das erste Setup des Kontos
  const symbol = useMemo(() => {
    if (urlSymbol) return urlSymbol;
    const zone = zones?.find((z) => z.id === zoneId) ?? zones?.[0];
    return zone?.symbol?.toUpperCase().trim() || null;
  }, [urlSymbol, zones, zoneId]);

  // Die Statistik gilt für ein Setup: ohne ?zone= das erste des Kontos
  useEffect(() => {
    if (tab === 'stats' && !zoneId && zones && zones.length > 0) setZone(zones[0].id);
  }, [tab, zoneId, zones, setZone]);

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

  const tabs: { id: ChartTab; label: string; hint: string; icon: ReactNode }[] = [
    { id: 'chart', label: t('analysis.tab.chart'), hint: t('analysis.tab.chart.hint'), icon: <CandlestickChart size={14} /> },
    { id: 'stats', label: t('analysis.tab.stats'), hint: t('analysis.tab.stats.hint'), icon: <BarChart3 size={14} /> },
  ];

  const account = (
    <FormationAccountSelect
      accounts={accounts}
      value={accountId}
      onChange={(id) => {
        if (id !== accountId) setAccount(id);
      }}
    />
  );
  const zoneSelect = (
    <div className="w-full sm:w-auto">
      <ZoneSelect zones={zones} value={zoneId} onChange={setZone} />
    </div>
  );
  const viewTabs = <AnimatedTabs tabs={tabs} activeTab={tab} onChange={(id) => setTab(id as ChartTab)} layoutId="analysis-tabs" variant="segment" className="[&_[role=tab]]:text-xs @min-[30rem]/formation-main:[&_[role=tab]]:h-7 @min-[30rem]/formation-main:[&_[role=tab]]:py-0 @max-[30rem]/formation-main:[&_[role=tab]]:px-2.5 @max-[30rem]/formation-main:[&_[role=tab]]:py-1 @max-[30rem]/formation-main:[&_[role=tab]]:text-xs short:p-0.5 short:[&_[role=tab]]:px-2.5 short:[&_[role=tab]]:h-auto! short:[&_[role=tab]]:py-0.5! short:[&_[role=tab]]:text-xs" />;
  const rangePicker = <DateRangePicker value={range} today={today} onChange={setRange} />;
  const chrome: ChartChrome = {
    account,
    zone: zoneSelect,
    range: rangePicker,
    view: viewTabs,
    notices: (
      <>
        <ChartNotice>
          <BrokerClockNotice state={clock} />
        </ChartNotice>
        {settingsError && (
          <ChartNotice>
            <Alert tone="danger" title={t('analysis.zone.failed')}>
              {settingsError}
            </Alert>
          </ChartNotice>
        )}
      </>
    ),
  };

  // Chart-Ansicht: der Chart füllt die Seite (ChartPage); Statistik und fehlendes Konto bleiben eine normale Seite
  if (accountKnown && accountId && tab === 'chart') {
    return <OneChart key={accountId} accountId={accountId} symbol={symbol} zones={zones} range={bounds} offsetSec={offsetSec} clockReady={!clock.loading} chrome={chrome} />;
  }

  // Chart ohne Konto (keins gewählt oder unbekannt): wie früher die Formationsseite, mit Kopfleiste und Alarm
  if (tab === 'chart') return <NoAccountChart accountId={accountId} accountsKnown={accounts.length > 0} chrome={chrome} />;

  const renderTab = () => {
    if (!accountId) {
      return (
        <Alert tone="info" title={t('analysis.noAccount.title')}>
          {t('analysis.noAccount.text')}
        </Alert>
      );
    }
    if (!accountKnown) {
      return (
        accounts.length > 0 && (
          <Alert tone="warning" title={t('analysis.noAccount.title')}>
            {t('analysis.account.notFound', { id: accountId })}
          </Alert>
        )
      );
    }
    return <StatsTab key={accountId} accountId={accountId} zones={zones} zoneId={zoneId} range={bounds} offsetSec={offsetSec} clockReady={!clock.loading} />;
  };

  // Statistik: eine normale Seite, aber mit derselben Kopfleiste wie der Chart (kein Seitentitel mehr, UI-15)
  return (
    <div className="w-full space-y-4 px-0 pb-6 pt-16 md:pb-8" data-testid="analysis-page">
      <h1 className="sr-only">{t('nav.chart')}</h1>
      <div className="@container/formation-main" data-testid="analysis-controls">
        <ChartTopBar flat account={account} target={accountKnown ? zoneSelect : null} timeframes={null} range={rangePicker} view={viewTabs} tools={null} />
      </div>
      <div className="space-y-5 px-4 md:px-8">
        {accountKnown && <BrokerClockNotice state={clock} />}
        {accountKnown && settingsError && (
          <Alert tone="danger" title={t('analysis.zone.failed')}>
            {settingsError}
          </Alert>
        )}
        {renderTab()}
      </div>
    </div>
  );
}

export default function ChartPageRoute() {
  // useSearchParams braucht eine Suspense-Grenze, sonst schlägt der Produktions-Build fehl
  return (
    <Suspense fallback={<div className="min-h-125" />}>
      <ChartRoot />
    </Suspense>
  );
}
