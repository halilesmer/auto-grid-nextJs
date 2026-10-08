'use client';

import { useEffect, useMemo, useState } from 'react';

import { AccountDropdown } from '@/components/account/components';
import { useAccounts } from '@/components/account/hooks';
import { BrokerClockNotice } from '@/components/analysis/BrokerClockNotice';
import { DateRangePicker } from '@/components/analysis/DateRangePicker';
import { ZoneSelect } from '@/components/analysis/ZoneSelect';
import { Alert } from '@/components/ui/alert';
import { useAccountSettings } from '@/hooks/useAccountSettings';
import { useAnalysisParams } from '@/hooks/useAnalysisParams';
import { useBacktestRun } from '@/hooks/useBacktestRun';
import { useBrokerClock } from '@/hooks/useBrokerClock';
import { useCsvImports } from '@/hooks/useCsvImports';
import { useDealsHistory } from '@/hooks/useDealsHistory';
import { useSymbolDetails } from '@/hooks/useSymbolDetails';
import { useT, type MessageKey } from '@/i18n';
import type { SpreadSetting } from '@/lib/backtest/broker/costs';
import { proposeCommission } from '@/lib/backtest/commission';
import type { RunParams } from '@/lib/backtest/protocol';
import type { CsvImport } from '@/services/csvImportApi';
import { brokerToday, DAY_SEC, dayStart, presetRange, rangeBounds } from '@/lib/serverTime';
import { insertSetup, setupNumbers } from '@/lib/symbolSetups';
import { selectAccount, useAccountStore, useSettingsStore } from '@/store';
import { HANDOFF_MAX_AGE_MS, useBacktestHandoffStore } from '@/store/useBacktestHandoffStore';
import { useBacktestStore } from '@/store/useBacktestStore';
import { CsvImportPanel } from './CsvImportPanel';
import { RunResultView } from './RunResultView';
import { DEFAULT_RUN_SETTINGS, isDataTimeframe, RunSettings, type DataTimeframe, type RunSettingsValue } from './RunSettings';
import { useRunText } from './runText';

/** Archiv für den Kommissionsvorschlag und das Margin-Modell: das letzte Jahr */
const ARCHIVE_DAYS = 365;
/** MT5 ACCOUNT_MARGIN_MODE_RETAIL_HEDGING */
const MARGIN_MODE_HEDGING = 2;

function RunErrorAlert() {
  const t = useT();
  const text = useRunText();
  const error = useBacktestStore((s) => s.error);
  if (!error) return null;
  const problems = error.problems?.length ? error.problems : [{ code: error.code, params: error.params }];
  return (
    <div data-testid="bt-error">
      <Alert tone="danger" title={t('backtest.error.title')}>
        <ul className="space-y-1">
          {problems.map((problem, i) => (
            <li key={`${problem.code}-${i}`} data-code={problem.code}>
              {text.error(problem.code, { ...problem.params, ...(error.message ? { message: error.message } : {}) })}
            </li>
          ))}
        </ul>
      </Alert>
    </div>
  );
}

/**
 * Seite /backtest (BKT-06): ein Lauf für ein Setup. Der Zustand (Konto, Setup, Zeitraum) steht in der Adresse; der
 * Test-Knopf eines Setups übergibt eine Kopie mit ungespeicherten Änderungen (useBacktestHandoffStore). Gerechnet wird im
 * Web Worker (useBacktestRun). Die Seite speichert nie ein Setup.
 */
export function BacktestView() {
  const t = useT();
  const { accountId: urlAccount, zoneId, range, setAccount, adoptAccount, setZone, setRange } = useAnalysisParams();
  const accounts = useAccountStore((s) => s.accounts);
  const selected = useAccountStore((s) => s.selectedAccount);
  const activeAccount = useAccountStore((s) => s.activeAccount);
  const settings = useSettingsStore((s) => s.settings);
  const loadedAccount = useSettingsStore((s) => s.loadedAccount);
  const { fetchAccounts } = useAccounts();
  const { start, cancel } = useBacktestRun();

  const status = useBacktestStore((s) => s.status);
  const progress = useBacktestStore((s) => s.progress);
  const results = useBacktestStore((s) => s.results);
  const context = useBacktestStore((s) => s.context);
  const running = status === 'running';

  const [form, setForm] = useState<RunSettingsValue>(DEFAULT_RUN_SETTINGS);

  // Übergabe vom Test-Knopf: einmal beim Öffnen lesen, danach leeren (Neuladen nimmt das gespeicherte Setup)
  const [handoff] = useState(() => {
    const stored = useBacktestHandoffStore.getState().handoff;
    return stored && Date.now() - stored.at < HANDOFF_MAX_AGE_MS ? stored : null;
  });
  useEffect(() => {
    useBacktestHandoffStore.getState().clearHandoff();
  }, []);

  const accountId = urlAccount ?? selected;
  // Erst mit geladener Liste: ein unbekanntes/fremdes Konto aus der Adresse wird nie global gewählt
  const accountKnown = accounts.some((a) => String(a.id) === accountId);

  useEffect(() => {
    if (useAccountStore.getState().accounts.length === 0) fetchAccounts();
  }, [fetchAccounts]);

  // Wie auf /chart: die Adresse wählt das Konto global; ohne ?account= wird das gewählte Konto übernommen
  useEffect(() => {
    if (urlAccount) {
      if (accountKnown && urlAccount !== useAccountStore.getState().selectedAccount) selectAccount(urlAccount);
    } else if (selected) {
      adoptAccount(selected);
    }
  }, [urlAccount, selected, accountKnown, adoptAccount]);

  // Ein Kontowechsel bricht einen laufenden Test ab und leert das Ergebnis des alten Kontos
  useEffect(() => {
    if (useBacktestStore.getState().accountId !== accountId) cancel();
    useBacktestStore.getState().clearUnless(accountId);
  }, [accountId, cancel]);

  // Immer neu laden: ohne Übergabe gilt die gespeicherte Zone, nie eine ungespeicherte Änderung, die noch im Store liegt
  // (das Dashboard lädt beim Zurückkehren ohnehin neu, sie ginge dort verloren)
  const settingsError = useAccountSettings(accountKnown ? accountId : null, 'always');
  // Der Stand beim Öffnen kann ungespeicherte Änderungen tragen: Zonen erst zeigen, wenn die neue Ladung da ist
  const [settingsAtOpen] = useState(() => useSettingsStore.getState().settings);
  const zones = useMemo(
    () => (accountId && loadedAccount === accountId && settings && settings !== settingsAtOpen ? (settings.ZONES ?? []) : null),
    [accountId, loadedAccount, settings, settingsAtOpen],
  );
  useEffect(() => {
    if (!zoneId && zones && zones.length > 0) setZone(zones[0].id);
  }, [zoneId, zones, setZone]);

  const handoffApplies = Boolean(handoff && handoff.accountId === accountId && handoff.zoneId === zoneId);
  const savedZone = zones?.find((z) => z.id === zoneId) ?? null;
  const zone = handoffApplies && handoff ? handoff.zone : savedZone;
  const unsaved = handoffApplies && Boolean(handoff?.unsaved);
  const zoneMissing = Boolean(zoneId && zones && !savedZone && !handoffApplies);
  // Ein neues, noch nicht gespeichertes Setup aus der Übergabe steht nicht in der gespeicherten Liste: für Auswahl und
  // Nummer an seinen Platz einfügen, wie die Symbolkarte es zeigt
  const newHandoffZone = handoffApplies && handoff && zones && !savedZone ? handoff.zone : null;
  const shownZones = useMemo(() => (zones && newHandoffZone ? insertSetup(zones, newHandoffZone) : zones), [zones, newHandoffZone]);

  const symbolDetails = useSymbolDetails(accountKnown ? accountId : null);
  const symbolsLoading = useSettingsStore((s) => s.isLoadingSymbols);
  const symbol = zone?.symbol ? (symbolDetails[zone.symbol.toUpperCase()] ?? null) : null;

  // Datenquelle (B5b): wählbar sind nur abgeschlossene Importe mit dem Symbol und einem Zeitrahmen des Laufs; der
  // Worker liefert für ein anderes Symbol oder einen anderen Zeitrahmen nichts (csv_import.get_rates)
  const csv = useCsvImports(accountKnown ? accountId : null);
  const symbolName = symbol?.name ?? null;
  const csvChoices = useMemo(
    () =>
      (csv.imports ?? []).filter(
        (i): i is CsvImport & { timeframe: DataTimeframe } => i.status === 'committed' && i.symbol === symbolName && isDataTimeframe(i.timeframe),
      ),
    [csv.imports, symbolName],
  );
  const csvImport = csvChoices.find((i) => i.import_id === form.csvImportId) ?? null;
  const dataTimeframe = csvImport?.timeframe ?? form.timeframe;

  const clock = useBrokerClock(accountKnown ? accountId : null);
  const offsetSec = clock.clock?.reliable ? clock.clock.offset_sec : null;
  const today = brokerToday(offsetSec ?? 0);
  const bounds = useMemo(() => {
    const days = 'preset' in range ? presetRange(range.preset, today) : range.custom;
    const b = rangeBounds(days);
    return { from: b.from, to: b.to ?? dayStart(today) + DAY_SEC };
  }, [range, today]);
  // „Alles“ hat keinen Anfang: der Worker nimmt keinen Zeitraum ab 0 minus Vorlauf an
  const rangeOpen = bounds.from === null;

  // Deal-Archiv des letzten Jahres: Kommissionsvorschlag, Kontowährung und Margin-Modell des Kontos
  const archive = useMemo(
    () => (accountKnown && accountId && !clock.loading ? { accountId, from: dayStart(today) - ARCHIVE_DAYS * DAY_SEC, to: dayStart(today) + DAY_SEC } : null),
    [accountKnown, accountId, clock.loading, today],
  );
  const deals = useDealsHistory(archive, false);
  const archiveReady = archive !== null && !deals.loading;
  const zoneSymbol = zone?.symbol ?? '';
  const proposal = useMemo(() => {
    if (!archiveReady || !zoneSymbol) return undefined;
    return deals.data ? proposeCommission(deals.data.deals, zoneSymbol) : null;
  }, [archiveReady, deals.data, zoneSymbol]);
  // Anderes Konto oder Symbol: eine früher eingegebene Kommission gilt nicht mehr, der neue Vorschlag folgt; ein
  // gewählter CSV-Import gehört zum alten Konto oder Symbol, die Quelle ist wieder der MT5-Server
  const commissionKey = `${accountId}|${zoneSymbol}`;
  const [seenCommissionKey, setSeenCommissionKey] = useState(commissionKey);
  if (seenCommissionKey !== commissionKey) {
    setSeenCommissionKey(commissionKey);
    setForm((f) => ({ ...f, commission: null, csvImportId: null }));
  }
  const commission = form.commission ?? proposal?.perLot ?? 0;
  const currency = deals.data?.account?.currency ?? null;
  const marginMode = deals.data?.account?.margin_mode ?? null;
  const netting = marginMode !== null && marginMode !== MARGIN_MODE_HEDGING;

  const numbers = useMemo(() => setupNumbers(shownZones ?? []), [shownZones]);
  const zoneLabel = zone ? t('analysis.zone.option', { n: numbers.get(zone.id) ?? 0, symbol: zone.symbol || '—' }) : null;

  let blockedKey: MessageKey | null = null;
  if (!zone) blockedKey = 'backtest.run.off.noZone.hint';
  else if (netting) blockedKey = 'backtest.run.off.netting.hint';
  else if (!symbol) blockedKey = 'backtest.run.off.symbol.hint';
  else if (rangeOpen) blockedKey = 'backtest.run.off.range.hint';
  else if (clock.loading || !archiveReady || zones === null) blockedKey = 'backtest.run.off.loading.hint';

  const run = () => {
    if (!accountId || !zone || !symbol || bounds.from === null || blockedKey) return;
    const spread: SpreadSetting = form.spreadMode === 'candle' ? { mode: 'candle' } : { mode: form.spreadMode, points: form.spreadPoints };
    const params: RunParams = {
      accountId,
      zone: { ...zone },
      symbol,
      accountCurrency: currency ?? undefined,
      from: bounds.from,
      to: bounds.to,
      dataTimeframe,
      source: csvImport ? `csv:${csvImport.import_id}` : undefined,
      spread,
      commissionPerLot: commission,
      swapEnabled: form.swapEnabled,
      approximate: form.approximate,
      model: { fill: form.fill, slFirst: form.slFirst, closeAtEnd: form.closeAtEnd },
      path: form.path,
      startCapital: form.startCapital,
      zoneLabel,
    };
    start(accountId, { params, unsaved, currency });
  };

  // Ergebnis und Fehler gehören zu Konto und Setup ihres Laufs; bei einem anderen Setup zeigt die Seite sie nicht
  const runMatches = context?.params.accountId === accountId && context?.params.zone.id === zoneId;

  const renderBody = () => {
    if (!accountId) {
      return (
        <Alert tone="info" title={t('analysis.noAccount.title')}>
          {t('backtest.noAccount.text')}
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
      <div className="space-y-5">
        {settingsError && (
          <Alert tone="danger" title={t('analysis.zone.failed')}>
            {settingsError}
          </Alert>
        )}
        {zoneMissing && (
          <Alert tone="warning" title={t('backtest.zone.missing.title')}>
            {t('backtest.zone.missing.text')}
          </Alert>
        )}
        {!zone && !zoneMissing && !settingsError && (
          <Alert tone="info" title={t('backtest.zone.none.title')}>
            {t('backtest.zone.none.text')}
          </Alert>
        )}
        {zone && (
          <p className="text-sm text-muted-foreground" data-testid="bt-source" data-unsaved={unsaved}>
            {t(unsaved ? 'backtest.source.unsaved' : 'backtest.source.saved')}
          </p>
        )}
        {zone && !symbol && !symbolsLoading && (
          <Alert tone="warning" title={t('backtest.symbol.missing', { symbol: zone.symbol || '—' })} />
        )}
        {netting && (
          <div data-testid="bt-netting">
            <Alert tone="danger" title={t('backtest.netting.title')}>
              {t('backtest.netting.text', { mode: t(`backtest.netting.mode.${marginMode === 0 || marginMode === 1 ? marginMode : 'unknown'}` as MessageKey) })}
            </Alert>
          </div>
        )}
        {zone && rangeOpen && (
          <div data-testid="bt-range-all">
            <Alert tone="warning" title={t('backtest.range.all.title')} />
          </div>
        )}
        {archiveReady && marginMode === null && (
          <div data-testid="bt-margin-unknown">
            <Alert tone="warning" title={t('backtest.margin.unknown.title')}>
              {t('backtest.margin.unknown.text')}
            </Alert>
          </div>
        )}
        <RunSettings
          value={form}
          onChange={setForm}
          csvImports={csvChoices}
          csvImport={csvImport}
          proposal={proposal}
          commission={commission}
          currency={currency}
          running={running}
          blockedHint={blockedKey ? t(blockedKey) : null}
          onRun={run}
          onCancel={cancel}
          progress={progress}
        />
        {status === 'error' && runMatches && <RunErrorAlert />}
        {status === 'done' && results && context && runMatches && <RunResultView results={results} context={context} />}
        <CsvImportPanel key={accountId} accountId={accountId} defaultSymbol={symbol?.name ?? zone?.symbol ?? ''} imports={csv.imports} reload={csv.reload} />
      </div>
    );
  };

  return (
    <div className="w-full space-y-5 px-4 py-6 md:px-8 md:py-8">
      <header className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{t('backtest.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('backtest.subtitle')}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2" data-testid="backtest-controls">
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
            <ZoneSelect zones={shownZones} value={zoneId} onChange={setZone} />
          </div>
        )}
        <DateRangePicker value={range} today={today} onChange={setRange} />
      </div>

      {accountKnown && <BrokerClockNotice state={clock} />}
      {renderBody()}
    </div>
  );
}
