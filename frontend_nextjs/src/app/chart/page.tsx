'use client';

import { Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { BarChart3, CandlestickChart, FlaskConical } from 'lucide-react';

import ZoneChartPanel from '@/components/chart/ZoneChartPanel';
import { AccountDropdown } from '@/components/account/components';
import { useAccounts } from '@/components/account/hooks';
import { AnalysisSettingsPanel } from '@/components/analysis/AnalysisSettingsPanel';
import { BrokerClockNotice, formatOffset } from '@/components/analysis/BrokerClockNotice';
import { DateRangePicker } from '@/components/analysis/DateRangePicker';
import { LicenseInfo } from '@/components/analysis/LicenseInfo';
import { ZoneSelect } from '@/components/analysis/ZoneSelect';
import AnimatedTabs from '@/components/ui/animated-tabs';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { useAccountSettings } from '@/hooks/useAccountSettings';
import { useAnalysisParams, type AnalysisTab } from '@/hooks/useAnalysisParams';
import { useBrokerClock } from '@/hooks/useBrokerClock';
import { useT } from '@/i18n';
import { brokerToday, DAY_SEC, dayStart, presetRange, rangeBounds } from '@/lib/serverTime';
import { selectAccount, useAccountStore, useSettingsStore } from '@/store';
import { useAnalysisPrefsStore } from '@/store/useAnalysisPrefsStore';

function Placeholder({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  const t = useT();
  return (
    <Card>
      <CardHeader icon={icon} title={title} actions={<Badge hint={t('chart.soon.hint')}>{t('chart.soon')}</Badge>} />
      <p className="px-5 pb-6 pt-4 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </Card>
  );
}

/**
 * Analyse-Seite (/chart): Tabs Chart, Statistik, Backtest für ein Konto und eine Zone; Zeitraum in
 * Brokertagen. Der Zustand steht in der URL (useAnalysisParams), Regeln: docs/analyse-regeln.md.
 */
function AnalysisView() {
  const t = useT();
  const {
    tab,
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
  const activeAccount = useAccountStore((s) => s.activeAccount);
  const settings = useSettingsStore((s) => s.settings);
  const loadedAccount = useSettingsStore((s) => s.loadedAccount);
  const showZoneLines = useAnalysisPrefsStore((s) => s.showZoneLines);
  const showZoneCard = useAnalysisPrefsStore((s) => s.showZoneCard);
  const showLevels = useAnalysisPrefsStore((s) => s.showLevels);
  const showTrades = useAnalysisPrefsStore((s) => s.showTrades);
  const showPauses = useAnalysisPrefsStore((s) => s.showPauses);
  const showRsi = useAnalysisPrefsStore((s) => s.showRsi);
  const showHistory = useAnalysisPrefsStore((s) => s.showHistory);
  const showFractals = useAnalysisPrefsStore((s) => s.showFractals);
  const prefs = useMemo(
    () => ({ showZoneLines, showZoneCard, showLevels, showTrades, showPauses, showRsi, showHistory, showFractals }),
    [showZoneLines, showZoneCard, showLevels, showTrades, showPauses, showRsi, showHistory, showFractals],
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
  const settingsError = useAccountSettings(accountKnown ? accountId : null, 'ifMissing');
  const zones = useMemo(
    () => (accountId && loadedAccount === accountId && settings ? (settings.ZONES ?? []) : null),
    [accountId, loadedAccount, settings],
  );

  // Ohne ?zone= die erste Zone des Kontos
  useEffect(() => {
    if (!zoneId && zones && zones.length > 0) setZone(zones[0].id);
  }, [zoneId, zones, setZone]);

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
    { id: 'backtest', label: t('analysis.tab.backtest'), hint: t('analysis.tab.backtest.hint'), icon: <FlaskConical size={14} /> },
  ];

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
    if (tab === 'chart') {
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
        />
      );
    }
    if (tab === 'stats') {
      return <Placeholder icon={<BarChart3 size={16} />} title={t('analysis.stats.title')} text={t('analysis.stats.text')} />;
    }
    return <Placeholder icon={<FlaskConical size={16} />} title={t('analysis.backtest.title')} text={t('analysis.backtest.text')} />;
  };

  return (
    <div className="w-full space-y-5 px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{t('analysis.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('analysis.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {clock.clock?.reliable && (
            <Badge tone="info" hint={t('analysis.clock.badge.hint')} data-testid="broker-clock">
              {t('analysis.clock.badge', { offset: formatOffset(clock.clock.offset_sec) })}
            </Badge>
          )}
          <LicenseInfo />
          <AnalysisSettingsPanel />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2" data-testid="analysis-controls">
        {/* Handy: jede Auswahl in eigener Zeile, sonst werden Konto- und Zonenname abgeschnitten */}
        <div className="w-full sm:w-auto">
          <AccountDropdown
            accounts={accounts}
            selectedAccount={accountId}
            activeAccount={activeAccount}
            onSelect={(id) => {
              if (id !== accountId) setAccount(id);
            }}
          />
        </div>
        {accountKnown && (
          <div className="w-full sm:w-auto">
            <ZoneSelect zones={zones} value={zoneId} onChange={setZone} />
          </div>
        )}
        <DateRangePicker value={range} today={today} onChange={setRange} />
      </div>

      {accountKnown && <BrokerClockNotice state={clock} />}
      {accountKnown && settingsError && (
        <Alert tone="danger" title={t('analysis.zone.failed')}>
          {settingsError}
        </Alert>
      )}

      <AnimatedTabs tabs={tabs} activeTab={tab} onChange={(id) => setTab(id as AnalysisTab)} layoutId="analysis-tabs" />

      {renderTab()}
    </div>
  );
}

export default function AnalysisPage() {
  // useSearchParams braucht eine Suspense-Grenze, sonst schlägt der Produktions-Build fehl
  return (
    <Suspense fallback={<div className="min-h-125" />}>
      <AnalysisView />
    </Suspense>
  );
}
