'use client';

import { Suspense, useMemo, type ReactNode } from 'react';

import { ChartPage } from '@/components/chart-page/ChartPage';
import { OneChart } from '@/components/chart-page/OneChart';
import { ChartTopBar, type ChartChrome } from '@/components/chart-page/ChartTopBar';
import { ChartNotice } from '@/components/chart-page/ChartOverlays';
import { FormationAlarmMenu } from '@/components/formation/FormationAlarmMenu';
import { FormationAccountSelect } from '@/components/formation/FormationSelectors';
import { BrokerClockNotice } from '@/components/analysis/BrokerClockNotice';
import { DateRangePicker } from '@/components/analysis/DateRangePicker';
import { Alert } from '@/components/ui/alert';
import { useChartContext } from '@/hooks/useChartContext';
import { useFormationAlarm } from '@/hooks/useFormationAlarm';
import { useT } from '@/i18n';

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
      topBar={<ChartTopBar account={chrome.account} target={null} timeframes={null} range={chrome.range} tools={<FormationAlarmMenu symbol={null} alarm={alarm} pastView={false} />} />}
      surface={alert}
    />
  );
}

/**
 * Die eine Chartseite (/chart, plan 1107-A21): der Chart (`OneChart`) für ein Konto und ein Symbol; Zeitraum in Brokertagen, Standard „Alle“.
 * Die Statistik ist seit UI-23 die eigene Seite /stats; alte Links mit `tab=stats` leitet next.config.ts dorthin.
 * Der Zustand steht in der URL (useChartParams, Regeln: lib/chart/chartUrl.ts, docs/analyse-regeln.md). Alte Links mit `mode=` oder `zone=` öffnen den richtigen Chart.
 */
function ChartRoot() {
  const t = useT();
  const { params, accounts, accountId, accountKnown, zones, settingsError, clock, offsetSec, today, bounds } = useChartContext();
  const { symbol: urlSymbol, zoneId, range, setAccount, setRange } = params;

  // Das Symbol des Charts: ?symbol=, sonst das Symbol der Zone aus ?zone= (alte Links), sonst das erste Setup des Kontos
  const symbol = useMemo(() => {
    if (urlSymbol) return urlSymbol;
    const zone = zones?.find((z) => z.id === zoneId) ?? zones?.[0];
    return zone?.symbol?.toUpperCase().trim() || null;
  }, [urlSymbol, zones, zoneId]);

  const chrome: ChartChrome = {
    account: (
      <FormationAccountSelect
        accounts={accounts}
        value={accountId}
        onChange={(id) => {
          if (id !== accountId) setAccount(id);
        }}
      />
    ),
    range: <DateRangePicker value={range} today={today} onChange={setRange} />,
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

  if (accountKnown && accountId) {
    return <OneChart key={accountId} accountId={accountId} symbol={symbol} zones={zones} range={bounds} offsetSec={offsetSec} clockReady={!clock.loading} chrome={chrome} />;
  }
  // Chart ohne Konto (keins gewählt oder unbekannt): wie früher die Formationsseite, mit Kopfleiste und Alarm
  return <NoAccountChart accountId={accountId} accountsKnown={accounts.length > 0} chrome={chrome} />;
}

export default function ChartPageRoute() {
  // useSearchParams braucht eine Suspense-Grenze, sonst schlägt der Produktions-Build fehl
  return (
    <Suspense fallback={<div className="min-h-125" />}>
      <ChartRoot />
    </Suspense>
  );
}
