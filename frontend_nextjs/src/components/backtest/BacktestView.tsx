'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
import { useFormat, useT, type MessageKey } from '@/i18n';
import type { SpreadSetting } from '@/lib/backtest/broker/costs';
import { proposeCommission } from '@/lib/backtest/commission';
import type { RunParams } from '@/lib/backtest/protocol';
import type { CsvImport } from '@/services/csvImportApi';
import { brokerToday, DAY_SEC, dayStart, presetRange, rangeBounds } from '@/lib/serverTime';
import { insertSetup } from '@/lib/symbolSetups';
import { selectAccount, useAccountStore, useSettingsStore } from '@/store';
import { HANDOFF_MAX_AGE_MS, useBacktestHandoffStore } from '@/store/useBacktestHandoffStore';
import { EMPTY_RUN, MAX_RUNNING, MAX_SETUPS, useBacktestStore } from '@/store/useBacktestStore';
import { Button } from '@/components/ui/button';
import { defaultZone } from '@/utils/zoneHelpers';
import type { Timeframe } from '@/lib/analysis/candles';
import { PresetPanel } from './PresetPanel';
import { useZoneTransferStore } from '@/store/useZoneTransferStore';
import { TransferDialog } from './TransferDialog';
import type { BacktestSetup } from '@/store/useBacktestStore';
import type { ZoneSettings } from '@/store/types';
import { SetupCards } from './SetupCards';
import { SetupEditor } from './SetupEditor';
import { SetupComparison } from './SetupComparison';
import { CsvImportPanel } from './CsvImportPanel';
import { RunResultView } from './RunResultView';
import { RunSettings } from './RunSettings';
import { DEFAULT_RUN_SETTINGS, isDataTimeframe, type DataTimeframe, type RunSettingsValue } from '@/lib/backtest/runSettings';
import { useRunText } from './runText';

/** Archiv für den Kommissionsvorschlag und das Margin-Modell: das letzte Jahr */
const ARCHIVE_DAYS = 365;
/** MT5 ACCOUNT_MARGIN_MODE_RETAIL_HEDGING */
const MARGIN_MODE_HEDGING = 2;

function RunErrorAlert({ setupId }: { setupId: string }) {
  const t = useT();
  const text = useRunText();
  const error = useBacktestStore((s) => s.runs[setupId]?.error);
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
 * Seite /backtest (BKT-06/08): lokale Setup-Kopien mit getrennten Läufen. Der Zustand (Konto, Setup, Zeitraum) steht in der Adresse; der
 * Test-Knopf eines Setups übergibt eine Kopie mit ungespeicherten Änderungen (useBacktestHandoffStore). Gerechnet wird im
 * Web Worker (useBacktestRun). Die Seite speichert nie ein Setup.
 */
export function BacktestView() {
  const t = useT();
  const fmt = useFormat();
  const { accountId: urlAccount, zoneId, range: urlRange, setAccount, adoptAccount, setZone, setRange: setUrlRange } = useAnalysisParams();
  const accounts = useAccountStore((s) => s.accounts);
  const selected = useAccountStore((s) => s.selectedAccount);
  const activeAccount = useAccountStore((s) => s.activeAccount);
  const settings = useSettingsStore((s) => s.settings);
  const loadedAccount = useSettingsStore((s) => s.loadedAccount);
  const { fetchAccounts } = useAccounts();
  const { start, cancel, cancelAll, requestBars } = useBacktestRun();
  const setups = useBacktestStore((s) => s.setups);
  const activeId = useBacktestStore((s) => s.activeId);
  const runs = useBacktestStore((s) => s.runs);
  const storeAccount = useBacktestStore((s) => s.accountId);
  const draft = setups.find((s) => s.id === activeId);
  const runState = (activeId && runs[activeId]) || EMPTY_RUN;
  const { status, progress, results, context } = runState;
  const running = status === 'running';
  const form = draft?.form ?? DEFAULT_RUN_SETTINGS;
  const range = draft?.range ?? urlRange;
  const setForm = (form: RunSettingsValue) => { if (activeId) useBacktestStore.getState().edit(activeId, { form }); };
  const [editing, setEditing] = useState<string | null>(null);
  const [presets, setPresets] = useState<{ setup: BacktestSetup | null } | null>(null);
  const [transferZone, setTransferZone] = useState<ZoneSettings | null>(null);
  const initialized = useRef(false);
  const selectedBars = useCallback((timeframe: Timeframe, from: number, to: number) => {
    if (activeId) requestBars(activeId, timeframe, from, to);
  }, [activeId, requestBars]);

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
    // Die Übergabe wählt bereits das Zielkonto; die alte URL darf es während der Navigation nicht zurücksetzen.
    const transfer = useZoneTransferStore.getState().pending;
    if (transfer?.accountId === selected && Date.now() - transfer.at < 5 * 60_000) return;
    if (urlAccount) {
      if (accountKnown && urlAccount !== useAccountStore.getState().selectedAccount) selectAccount(urlAccount);
    } else if (selected) {
      adoptAccount(selected);
    }
  }, [urlAccount, selected, accountKnown, adoptAccount]);

  // Ein Kontowechsel bricht einen laufenden Test ab und leert das Ergebnis des alten Kontos
  useEffect(() => {
    if (useBacktestStore.getState().accountId !== accountId) cancelAll();
    useBacktestStore.getState().clearUnless(accountId);
  }, [accountId, cancelAll]);

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
  const sourceZone = handoffApplies && handoff ? handoff.zone : savedZone;
  const zone = draft?.zone ?? null;
  const unsaved = draft?.unsaved ?? false;
  const zoneMissing = Boolean(zoneId && zones && !savedZone && !handoffApplies);
  // Ein neues, noch nicht gespeichertes Setup aus der Übergabe steht nicht in der gespeicherten Liste: für Auswahl und
  // Nummer an seinen Platz einfügen, wie die Symbolkarte es zeigt
  const newHandoffZone = handoffApplies && handoff && zones && !savedZone ? handoff.zone : null;
  const shownZones = useMemo(() => (zones && newHandoffZone ? insertSetup(zones, newHandoffZone) : zones), [zones, newHandoffZone]);

  useEffect(() => {
    if (initialized.current || !sourceZone || !zones || storeAccount !== accountId) return;
    if (handoffApplies || useBacktestStore.getState().setups.length === 0) {
      const added = useBacktestStore.getState().add({ zone: sourceZone, form: DEFAULT_RUN_SETTINGS, range: urlRange,
        unsaved: handoffApplies && Boolean(handoff?.unsaved) });
      if (!added) return;
    }
    initialized.current = true;
  }, [sourceZone, zones, storeAccount, accountId, urlRange, handoffApplies, handoff, setups.length]);

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
  const days = 'preset' in range ? presetRange(range.preset, today) : range.custom;
  const rangeLimit = rangeBounds(days);
  const bounds = { from: rangeLimit.from, to: rangeLimit.to ?? dayStart(today) + DAY_SEC };
  // „Alles“ hat keinen Anfang: der Worker nimmt keinen Zeitraum ab 0 minus Vorlauf an
  const rangeOpen = bounds.from === null;

  // Deal-Archiv des letzten Jahres: Kommissionsvorschlag, Kontowährung und Margin-Modell des Kontos
  const archive = accountKnown && accountId && !clock.loading
    ? { accountId, from: dayStart(today) - ARCHIVE_DAYS * DAY_SEC, to: dayStart(today) + DAY_SEC }
    : null;
  const deals = useDealsHistory(archive, false);
  const archiveReady = archive !== null && !deals.loading;
  const zoneSymbol = String(zone?.symbol ?? '');
  const proposal = useMemo(() => {
    if (!archiveReady || !zoneSymbol) return undefined;
    return deals.data ? proposeCommission(deals.data.deals, zoneSymbol) : null;
  }, [archiveReady, deals.data, zoneSymbol]);
  const commission = form.commission ?? proposal?.perLot ?? 0;
  const currency = deals.data?.account?.currency ?? null;
  const marginMode = deals.data?.account?.margin_mode ?? null;
  const netting = marginMode !== null && marginMode !== MARGIN_MODE_HEDGING;

  const zoneLabel = zone ? t('analysis.zone.option', { n: setups.findIndex((s) => s.id === activeId) + 1, symbol: zone.symbol || '—' }) : null;

  let blockedKey: MessageKey | null = null;
  if (!zone) blockedKey = 'backtest.run.off.noZone.hint';
  else if (netting) blockedKey = 'backtest.run.off.netting.hint';
  else if (!symbol) blockedKey = 'backtest.run.off.symbol.hint';
  else if (rangeOpen) blockedKey = 'backtest.run.off.range.hint';
  else if (Object.values(runs).filter((r) => r.status === 'running').length >= MAX_RUNNING) blockedKey = 'backtest.setups.busy.hint';
  else if (storeAccount !== accountId || clock.loading || !archiveReady || zones === null) blockedKey = 'backtest.run.off.loading.hint';

  const run = () => {
    if (!activeId || !accountId || !zone || !symbol || bounds.from === null || blockedKey) return;
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
    start(accountId, { setupId: activeId, params, unsaved, currency, sourceLabel: csvImport ? t('backtest.data.csv', { symbol: csvImport.symbol, tf: csvImport.timeframe, from: csvImport.first_t === null ? '—' : fmt.mt5DateTime(csvImport.first_t), to: csvImport.last_t === null ? '—' : fmt.mt5DateTime(csvImport.last_t) }) : t('backtest.data.mt5') });
  };

  // Ergebnis und Fehler gehören zu Konto und Setup ihres Laufs; bei einem anderen Setup zeigt die Seite sie nicht
  const runMatches = context?.params.accountId === accountId && context?.setupId === activeId && storeAccount === accountId;

  const comparison = storeAccount === accountId ? <SetupComparison setups={setups} runs={runs} /> : null;
  const hasResult = status === 'done' && results && context && runMatches;

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
        {draft && <RunSettings
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
          onCancel={() => { if (activeId) cancel(activeId); }}
          progress={progress}
        />}
        {status === 'error' && runMatches && <RunErrorAlert setupId={activeId!} />}
        {status === 'done' && results && context && runMatches && <RunResultView key={`${activeId}-${runState.runId}`} results={results} context={context} requestBars={selectedBars} comparison={comparison} />}
        {!hasResult && comparison}
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
        <fieldset disabled={running} className="min-w-0"><DateRangePicker key={activeId} value={range} today={today} onChange={(next) => {
          if (running) return;
          if (activeId) useBacktestStore.getState().edit(activeId, { range: next });
          setUrlRange(next);
        }} /></fieldset>
      </div>

      {accountKnown && <>
        <div className="flex flex-wrap gap-2">
          <Button hint={t('backtest.presets.title.hint')} onClick={() => setPresets({ setup: null })}>{t('backtest.presets.title')}</Button>
          <Button disabled={!sourceZone || !zones || setups.length >= MAX_SETUPS} hint={t('backtest.setups.add.hint')}
            onClick={() => { if (sourceZone) useBacktestStore.getState().add({ zone: sourceZone, form: DEFAULT_RUN_SETTINGS, range: urlRange, unsaved: handoffApplies && Boolean(handoff?.unsaved) }); }}>
            {t('backtest.setups.add')}
          </Button>
          <Button disabled={setups.length >= MAX_SETUPS} hint={t('backtest.setups.empty.hint')} onClick={() => {
            const id = useBacktestStore.getState().add({ zone: defaultZone(), form: DEFAULT_RUN_SETTINGS, range: urlRange, unsaved: true });
            if (id) setEditing(id);
          }}>{t('backtest.setups.empty')}</Button>
        </div>
        <SetupCards setups={setups} runs={storeAccount === accountId ? runs : {}} activeId={activeId} onEdit={setEditing}
          onPreset={(setup) => setPresets({ setup })} onTransfer={(setup) => setTransferZone(structuredClone(setup.zone))} />
        {editing && setups.find((s) => s.id === editing) && <SetupEditor key={`${accountId}-${editing}`}
          setup={setups.find((s) => s.id === editing)!} symbolDetails={symbolDetails}
          onClose={() => setEditing(null)} />}
      </>}

      {presets && <PresetPanel saveSetup={presets.setup} onClose={() => setPresets(null)}
        onTransfer={(zone) => { setPresets(null); setTransferZone(zone); }} />}
      {transferZone && <TransferDialog zone={transferZone} onClose={() => setTransferZone(null)} />}
      {accountKnown && <BrokerClockNotice state={clock} />}
      {renderBody()}
    </div>
  );
}
