'use client';

import { Suspense, useEffect } from 'react';

import { ChartTopBar } from '@/components/chart-page/ChartTopBar';
import { FormationAccountSelect } from '@/components/formation/FormationSelectors';
import { BrokerClockNotice } from '@/components/analysis/BrokerClockNotice';
import { DateRangePicker } from '@/components/analysis/DateRangePicker';
import { ZoneSelect } from '@/components/analysis/ZoneSelect';
import { StatsTab } from '@/components/analysis/stats/StatsTab';
import { Alert } from '@/components/ui/alert';
import { useChartContext } from '@/hooks/useChartContext';
import { useT } from '@/i18n';

/**
 * Die Statistik als eigene Seite (/stats, UI-23, Menüpunkt „Statistik“): Kennzahlen eines Setups für ein Konto und einen Zeitraum.
 * Oben dieselbe Kopfleiste wie im Chart (flach: Konto, Setup, Zeitraum), kein Seitentitel (UI-15). Adresse wie /chart (useChartParams).
 */
function StatsRoot() {
  const t = useT();
  const { params, accounts, accountId, accountKnown, zones, settingsError, clock, offsetSec, today, bounds } = useChartContext();
  const { zoneId, range, setAccount, setZone, setRange } = params;

  // Die Statistik gilt für ein Setup: ohne ?zone= das erste des Kontos
  useEffect(() => {
    if (!zoneId && zones && zones.length > 0) setZone(zones[0].id);
  }, [zoneId, zones, setZone]);

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

  const body = () => {
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

  return (
    <div className="w-full space-y-4 px-0 pb-6 md:pb-8" data-testid="analysis-page">
      <h1 className="sr-only">{t('nav.stats')}</h1>
      <div className="@container/formation-main" data-testid="analysis-controls">
        <ChartTopBar flat account={account} target={accountKnown ? zoneSelect : null} timeframes={null} range={<DateRangePicker value={range} today={today} onChange={setRange} />} tools={null} />
      </div>
      <div className="space-y-5 px-4 md:px-8">
        {accountKnown && <BrokerClockNotice state={clock} />}
        {accountKnown && settingsError && (
          <Alert tone="danger" title={t('analysis.zone.failed')}>
            {settingsError}
          </Alert>
        )}
        {body()}
      </div>
    </div>
  );
}

export default function StatsPageRoute() {
  // useSearchParams braucht eine Suspense-Grenze, sonst schlägt der Produktions-Build fehl
  return (
    <Suspense fallback={<div className="min-h-125" />}>
      <StatsRoot />
    </Suspense>
  );
}
