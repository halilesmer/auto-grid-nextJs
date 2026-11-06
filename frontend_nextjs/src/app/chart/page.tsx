'use client';

import { Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { BarChart3, CandlestickChart } from 'lucide-react';

import { FreeChartPanel } from '@/components/chart-workspace/FreeChartPanel';
import { ChartModeSegment, ChartTopBar, type ChartChrome } from '@/components/chart-page/ChartTopBar';
import { ChartNotice } from '@/components/chart-page/ChartOverlays';
import ZoneChartPanel from '@/components/chart/ZoneChartPanel';
import { FormationAccountSelect } from '@/components/formation/FormationSelectors';
import { FormationView } from '@/components/formation/FormationView';
import { useAccounts } from '@/components/account/hooks';
import { BrokerClockNotice } from '@/components/analysis/BrokerClockNotice';
import { DateRangePicker } from '@/components/analysis/DateRangePicker';
import { ZoneSelect } from '@/components/analysis/ZoneSelect';
import { StatsTab } from '@/components/analysis/stats/StatsTab';
import AnimatedTabs from '@/components/ui/animated-tabs';
import { Alert } from '@/components/ui/alert';
import { useAccountSettings } from '@/hooks/useAccountSettings';
import { useChartMode } from '@/hooks/useChartMode';
import { useAnalysisParams, type AnalysisTab } from '@/hooks/useAnalysisParams';
import { useBrokerClock } from '@/hooks/useBrokerClock';
import { useT } from '@/i18n';
import { brokerToday, DAY_SEC, dayStart, presetRange, rangeBounds } from '@/lib/serverTime';
import { selectAccount, useAccountStore, useSettingsStore } from '@/store';
import { useAnalysisPrefsStore } from '@/store/useAnalysisPrefsStore';

/**
 * Modi Setup und Frei der Chartseite (/chart): Tabs Chart und Statistik für ein Konto und eine Zone; Zeitraum in
 * Brokertagen. Der Zustand steht in der URL (useAnalysisParams), Regeln: docs/analyse-regeln.md.
 */
function AnalysisView() {
  const t = useT();
  const {
    tab, symbol, mode, setSymbol,
    accountId: urlAccount,
    zoneId,
    range,
    timeframe,
    setTab,
    setAccount,
    adoptAccount,
    setZone,
    setRange,
    setTimeframe,
  } = useAnalysisParams();
  const accounts = useAccountStore((s) => s.accounts);
  const selected = useAccountStore((s) => s.selectedAccount);
  const settings = useSettingsStore((s) => s.settings);
  const loadedAccount = useSettingsStore((s) => s.loadedAccount);
  const showZoneLines = useAnalysisPrefsStore((s) => s.showZoneLines);
  const showZoneCard = useAnalysisPrefsStore((s) => s.showZoneCard);
  const showLevels = useAnalysisPrefsStore((s) => s.showLevels);
  const showTrades = useAnalysisPrefsStore((s) => s.showTrades);
  const showOrders = useAnalysisPrefsStore((s) => s.showOrders);
  const showPauses = useAnalysisPrefsStore((s) => s.showPauses);
  const showHistory = useAnalysisPrefsStore((s) => s.showHistory);
  const showFractals = useAnalysisPrefsStore((s) => s.showFractals);
  const showGaps = useAnalysisPrefsStore((s) => s.showGaps);
  const prefs = useMemo(
    () => ({ showZoneLines, showZoneCard, showLevels, showTrades, showOrders, showPauses, showHistory, showFractals, showGaps }),
    [showZoneLines, showZoneCard, showLevels, showTrades, showOrders, showPauses, showHistory, showFractals, showGaps],
  );
  const { fetchAccounts } = useAccounts();

  const accountId = urlAccount ?? selected;
  // Erst mit geladener Liste: ein unbekanntes/fremdes Konto aus der Adresse wird nie global gewählt
  const accountKnown = accounts.some((a) => String(a.id) === accountId);

  useEffect(() => {
    useAnalysisPrefsStore.persist.rehydrate();
  }, []);

  // Direkt aufgerufen (Neuladen, Link): Kontoliste selbst laden
  useEffect(() => {
    if (useAccountStore.getState().accounts.length === 0) fetchAccounts();
  }, [fetchAccounts]);

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
  const settingsError = useAccountSettings(accountKnown && (mode === 'setup' || tab === 'stats') ? accountId : null, 'ifMissing');
  const zones = useMemo(
    () => (accountId && loadedAccount === accountId && settings ? (settings.ZONES ?? []) : null),
    [accountId, loadedAccount, settings],
  );

  // Ohne ?zone= die erste Zone des Kontos
  useEffect(() => {
    if ((mode === 'setup' || tab === 'stats') && !zoneId && zones && zones.length > 0) setZone(zones[0].id);
  }, [mode, tab, zoneId, zones, setZone]);

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

  const tabs: { id: AnalysisTab; label: string; hint: string; icon: ReactNode }[] = [
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
  const viewTabs = <AnimatedTabs tabs={tabs} activeTab={tab} onChange={(id) => setTab(id as AnalysisTab)} layoutId="analysis-tabs" variant="segment" className="@min-[30rem]/formation-main:[&_[role=tab]]:h-7 @min-[30rem]/formation-main:[&_[role=tab]]:py-0 @max-[30rem]/formation-main:[&_[role=tab]]:px-2.5 @max-[30rem]/formation-main:[&_[role=tab]]:py-1 @max-[30rem]/formation-main:[&_[role=tab]]:text-xs short:p-0.5 short:[&_[role=tab]]:px-2.5 short:[&_[role=tab]]:h-auto! short:[&_[role=tab]]:py-0.5! short:[&_[role=tab]]:text-xs" />;
  const chrome: ChartChrome = {
    account,
    mode: <ChartModeSegment />,
    zone: zoneSelect,
    range: <DateRangePicker value={range} today={today} onChange={setRange} />,
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

  // Chart-Ansicht: Chart füllt die Seite (ChartPage); Statistik und fehlendes Konto bleiben eine normale Seite
  if (accountKnown && accountId && tab === 'chart') {
    if (mode === 'free') return <FreeChartPanel key={accountId} accountId={accountId} symbol={symbol} onSymbol={setSymbol} timeframe={timeframe} onTimeframe={setTimeframe} range={bounds} offsetSec={offsetSec} clockReady={!clock.loading} chrome={chrome} />;
    return (
      <ZoneChartPanel
        accountId={accountId}
        zoneId={zoneId}
        zones={zones}
        timeframe={timeframe}
        onTimeframe={setTimeframe}
        range={bounds}
        offsetSec={offsetSec}
        clockReady={!clock.loading}
        prefs={prefs}
        chrome={chrome}
      />
    );
  }

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
    return (
      <StatsTab
        key={accountId}
        accountId={accountId}
        zones={zones}
        zoneId={zoneId}
        range={bounds}
        offsetSec={offsetSec}
        clockReady={!clock.loading}
      />
    );
  };

  // Statistik: eine normale Seite, aber mit derselben Kopfleiste wie die Chart-Ansichten (kein Seitentitel mehr, UI-15)
  return (
    <div className="w-full space-y-4 px-0 pb-6 pt-16 md:pb-8" data-testid="analysis-page">
      <h1 className="sr-only">{t('nav.chart')}</h1>
      <div className="@container/formation-main" data-testid="analysis-controls">
        <ChartTopBar flat account={account} mode={chrome.mode} target={accountKnown ? zoneSelect : null} timeframes={null} range={chrome.range} view={viewTabs} tools={null} />
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

/** Die eine Chartseite: je nach Modus Formation (FormationView) oder Setup/Frei mit Statistik (AnalysisView) */
function ChartRoot() {
  const { mode } = useChartMode();
  return mode === 'formation' ? <FormationView /> : <AnalysisView />;
}

export default function ChartPageRoute() {
  // useSearchParams braucht eine Suspense-Grenze, sonst schlägt der Produktions-Build fehl
  return (
    <Suspense fallback={<div className="min-h-125" />}>
      <ChartRoot />
    </Suspense>
  );
}
