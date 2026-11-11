'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, PanelRight } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

import { TimeframeSelect } from '@/components/analysis/chart/TimeframeSelect';
import { formatOffset } from '@/components/analysis/BrokerClockNotice';
import { DataQualityBanner } from '@/components/analysis/DataQualityBanner';
import { LicenseInfo } from '@/components/analysis/LicenseInfo';
import { ChartPage } from '@/components/chart-page/ChartPage';
import { ChartNotice, ChartOverlays } from '@/components/chart-page/ChartOverlays';
import { ChartCard } from '@/components/chart-page/ChartCard';
import { ChartSideRail } from '@/components/chart-page/ChartSideRail';
import { ChartTopBar, type ChartChrome } from '@/components/chart-page/ChartTopBar';
import { ChartView } from '@/components/chart-page/ChartView';
import { NoSetupNote, SetupOverview, SetupSwitches, SetupTrades } from '@/components/chart/SetupCardTabs';
import { useChartOverlays } from '@/components/chart-workspace/ContextOverlays';
import { FormationDrawingsToggle } from '@/components/chart-workspace/FormationDrawingsToggle';
import { TrendToggle } from '@/components/chart-workspace/TrendToggle';
import { FavoritesAddButton, FavoritesSidebar } from '@/components/formation/FavoritesSidebar';
import { FormationActions } from '@/components/formation/FormationActions';
import { FormationAsOf, FormationAsOfSteps, useCompact } from '@/components/formation/FormationAsOf';
import { FormationConditions } from '@/components/formation/FormationConditions';
import { FavoritesForms, FavoritesTimeframes } from '@/components/formation/FormationFavoritesBar';
import { FormationForms } from '@/components/formation/FormationForms';
import { FormationLayer } from '@/components/formation/FormationLayer';
import { FormationLineTable } from '@/components/formation/FormationLineTable';
import { FormationSymbolSelect } from '@/components/formation/FormationSelectors';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useChartParams } from '@/hooks/useChartParams';
import { useFavorites } from '@/hooks/useFavorites';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useFormationAlarm } from '@/hooks/useFormationAlarm';
import { useFormationScan } from '@/hooks/useFormationScan';
import { useFormationSidebar, type CardTab } from '@/hooks/useFormationSidebar';
import { useMarketRates } from '@/hooks/useMarketRates';
import { useSetupLayers } from '@/hooks/useSetupLayers';
import { useSignalBars } from '@/hooks/useSignalBars';
import { useSymbolDetails } from '@/hooks/useSymbolDetails';
import { contextTimeframe, useTrendPath } from '@/hooks/useTrendPath';
import { useFormat, useLocale, useT } from '@/i18n';
import { barEnd, calendarFromDaily, isCalendarTimeframe, liveCalendarBar, periodStart } from '@/lib/analysis/calendarBars';
import { buildChartData, CHART_TIMEFRAME_SEC, CHART_TIMEFRAMES, dataTimeframeOf, type Bar, type ChartTimeframe } from '@/lib/analysis/candles';
import { hasFormations } from '@/lib/chart/chartUrl';
import { isSystemRsi, matchesFormationRsi, newIndicator, systemRsiIndicator } from '@/lib/chart-workspace/indicators';
import { chartWorkspaceKey, legacyDocumentsForMerge, legacyLinkFor, legacyWorkspaceKeys, mergeLegacyDocuments } from '@/lib/chart-workspace/legacyKeys';
import { resolveAsOf } from '@/lib/formation/asOf';
import { drawingPriceRange, drawsZigzag } from '@/lib/formation/drawingLayout';
import { CONTEXT_TIMEFRAMES, RSI_PARAMS, type ContextTimeframe } from '@/lib/formation/params';
import { favoriteSymbols, FINAL_POINT, formedSummary, hitsCount, SCAN_FORMATIONS, type ScanFormation, type ScanHit } from '@/lib/formation/scan';
import { buildShotData, shotFileName } from '@/lib/formation/shotData';
import { composeShot, shotBlob, type ChartPicture } from '@/lib/formation/shotImage';
import { buildTrendPath, usableTrendSettings } from '@/lib/formation/trdPath';
import { brokerNow, DAY_SEC } from '@/lib/serverTime';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/store';
import { useAnalysisPrefsStore } from '@/store/useAnalysisPrefsStore';
import { emptyChartDocument, useChartWorkspaceStore } from '@/store/useChartWorkspaceStore';
import { useConnectionStore } from '@/store/useConnectionStore';
import { useFavoritesScanStore } from '@/store/useFavoritesScanStore';
import type { ZoneSettings } from '@/store/types';

const DEFAULT_FORMATION: ScanFormation = 'ABCD';
const NO_BARS: Bar[] = [];

/** The chart library throws on candles whose time falls: a series that is not in order is sorted and loses double times (the scan reports such data on its own) */
function ascending(bars: Bar[]): Bar[] {
  if (bars.every((b, i) => i === 0 || b.time > bars[i - 1].time)) return bars;
  return [...bars].sort((a, b) => a.time - b.time).filter((b, i, all) => i === 0 || b.time !== all[i - 1].time);
}

interface OneChartProps {
  accountId: string;
  /** The symbol of the chart (from the URL, else the symbol of the zone in the URL, else the first setup of the account); null = none */
  symbol: string | null;
  /** All setups of the account; null = still loading */
  zones: ZoneSettings[] | null;
  /** Gewählter Zeitraum in MT5-Sekunden, halb offen; from null = „alles“ */
  range: { from: number | null; to: number };
  /** Gemessener Abstand der Brokeruhr zu UTC; null = unsicher (keine Live-Kerze) */
  offsetSec: number | null;
  /** Antwort der Brokeruhr da (auch „unsicher“): erst dann steht der Zeitraum fest, vorher kein Abruf */
  clockReady: boolean;
  /** Was die Seite beisteuert: Konto, Zeitraum, Chart/Statistik und ihre Hinweise */
  chrome: ChartChrome;
}

/**
 * Der eine Chart (plan 1107-A21, step U4-4a). Er löst die drei Modi Formation, Setup und Frei ab: das Symbol ist frei wählbar, alle neun Zeiteinheiten
 * stehen immer da, auf D1/H4/H1/M15 liegt die Formationsebene (Suche über alle Formationen, `useFormationScan`) auf den Kerzen, und die
 * Setup-Ebenen des Symbols (`useSetupLayers`) liegen auf demselben Chart. Die Karte (Bedingungen, Genel bakış, İşlemler) und die Favoriten stehen ab lg in der rechten Leiste mit Seitenpanel (`ChartSideRail`, 1107-A21.22); darunter schwebt die eine Karte.
 */
export function OneChart({ accountId, symbol: urlSymbol, zones, range, offsetSec, clockReady, chrome }: OneChartProps) {
  const t = useT();
  const locale = useLocale();
  const format = useFormat();
  const compact = useCompact();
  const { timeframe, form: urlForm, atParam, zoneId, setSymbol, setZone, setView, setAt } = useChartParams();
  const source = useConnectionStore((s) => s.baseUrl);
  const details = useSymbolDetails(accountId);
  const isLoading = useSettingsStore((s) => s.isLoadingSymbols);
  const symbolsError = useSettingsStore((s) => s.symbolsError);

  // The symbol hook clears the old account in its effect. Do not request candles from stale symbols on the first frame.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const selected = ready && urlSymbol ? details[urlSymbol.toUpperCase()] : null;
  const accepted = selected?.name ?? null;

  const formationTf = hasFormations(timeframe);
  const contextTf: ContextTimeframe | null = formationTf ? (timeframe as ContextTimeframe) : null;
  const tfSec = CHART_TIMEFRAME_SEC[timeframe];
  const now = useCallback(() => (offsetSec === null ? Date.now() / 1000 : brokerNow(offsetSec)), [offsetSec]);

  // Past moment (FRM-38): valid while it lies before the running M15 candle; else live. It exists only on the formation timeframes
  const pastAt = formationTf ? resolveAsOf(atParam, now()) : null;
  useEffect(() => {
    if (atParam !== null && pastAt === null && clockReady) setAt(null);
  }, [atParam, pastAt, clockReady, setAt]);

  // Formation search (all formations, all four timeframes) of the symbol. A symbol that is not in the loaded broker list gets no requests (an empty list: no search either way)
  const listKnown = Object.keys(details).length > 0;
  const scanSymbol = !listKnown || accepted ? urlSymbol : null;
  const scan = useFormationScan(accountId, scanSymbol, offsetSec, clockReady, pastAt);
  const formsWithHits = useMemo(() => (contextTf ? SCAN_FORMATIONS.filter((x) => scan.hits.some((h) => h.form === x && h.tf === contextTf)) : []), [scan.hits, contextTf]);
  // A formation without a candidate on this timeframe has no button: the first one with a badge (else with any candidate) is shown instead
  const badged = contextTf ? formsWithHits.find((x) => hitsCount(scan.hits, { form: x, tf: contextTf }) > 0) : undefined;
  const form: ScanFormation = urlForm && formsWithHits.includes(urlForm) ? urlForm : (badged ?? formsWithHits[0] ?? urlForm ?? DEFAULT_FORMATION);
  const list = useMemo(() => (contextTf ? scan.hits.filter((h) => h.form === form && h.tf === contextTf) : []), [scan.hits, form, contextTf]);
  const [pickedId, setPicked] = useState<string | null>(null);
  const hit = list.find((h) => `${h.form}-${h.tf}` === pickedId) ?? list[0] ?? null;
  const [active, setActive] = useState<string[] | null>(null);
  const [priceBottom, setPriceBottom] = useState(0);
  const clearSelection = () => {
    setActive(null);
    setPicked(null);
  };

  // Candles: W1 and MN are built from D1 in the browser (1107-A4.2). The request starts at a week or month start, so the first candle is whole.
  const calendar = isCalendarTimeframe(timeframe) ? timeframe : null;
  const askRange = useMemo(() => {
    const from = calendar && range.from !== null ? periodStart(calendar, range.from) : range.from;
    return { from, to: pastAt !== null ? Math.min(range.to, pastAt) : range.to };
  }, [calendar, range.from, range.to, pastAt]);
  const request = useMemo(
    () => (accepted && clockReady ? { accountId, symbol: accepted, timeframe: dataTimeframeOf(timeframe), ...askRange } : null),
    [accepted, clockReady, accountId, timeframe, askRange],
  );
  const d1 = useMarketRates(request, now);
  const ratesData = useMemo(() => {
    const raw = d1.data;
    if (!raw) return raw;
    if (calendar) {
      const bars: Bar[] = calendarFromDaily(calendar, raw.bars, raw.missing, raw.from);
      return { ...raw, bars, liveFrom: raw.liveFrom === null ? null : periodStart(calendar, raw.liveFrom) };
    }
    // Past moment: only the candles that were closed then; no live candle
    if (pastAt !== null) return { ...raw, bars: ascending(raw.bars.filter((b) => b.time + tfSec <= pastAt)), liveFrom: null };
    const bars = ascending(raw.bars);
    return bars === raw.bars ? raw : { ...raw, bars };
  }, [d1.data, calendar, pastAt, tfSec]);
  const endOfData = d1.data?.older === 'range' || d1.data?.older === 'history' || d1.data?.older === 'limit' ? d1.data.older : null;
  const olderEdge = d1.loadingOlder ? ('loading' as const) : endOfData;
  const data = useMemo(() => {
    if (!ratesData) return null;
    // No gap slots on W1 and MN: the missing D1 ranges show in the banner only.
    return buildChartData(ratesData.bars, calendar ? [] : ratesData.missing, tfSec, now());
  }, [ratesData, calendar, tfSec, now]);
  const dailyMissing = useMemo(() => (calendar && d1.data ? buildChartData(d1.data.bars, d1.data.missing, DAY_SEC, now()).missing : null), [calendar, d1.data, now]);
  const signalBars = useSignalBars(ratesData, timeframe, offsetSec, now);

  // The setup layers of the symbol: the setup of the URL if it is one of this symbol, else its first setup (1107-A21.2)
  const symbolKey = (accepted ?? urlSymbol)?.toUpperCase().trim() ?? null;
  const setups = useMemo(() => (zones && symbolKey ? zones.filter((z) => z.symbol?.toUpperCase().trim() === symbolKey) : []), [zones, symbolKey]);
  const zone = setups.find((z) => z.id === zoneId) ?? setups[0] ?? null;
  const prefs = useAnalysisPrefsStore(useShallow((s) => ({ showZoneLines: s.showZoneLines, showZoneCard: s.showZoneCard, showLevels: s.showLevels, showTrades: s.showTrades, showOrders: s.showOrders, showPauses: s.showPauses, showHistory: s.showHistory, showFractals: s.showFractals, showGaps: s.showGaps })));
  const showTrend = useAnalysisPrefsStore((s) => s.showTrend);
  const trendDraft = useAnalysisPrefsStore((s) => s.trendDraft);
  useEffect(() => {
    useAnalysisPrefsStore.persist.rehydrate();
  }, []);
  const viewKey = `${accountId}|${accepted}|${timeframe}|${range.from}|${range.to}|${pastAt}`;
  // The deals archive is read only for a symbol with a setup
  const layers = useSetupLayers({ accountId, zone, zones, symbol: symbolKey, timeframe, range, offsetSec, clockReady: clockReady && zone !== null, nowSec: now, data: ratesData, chart: data, viewKey, prefs });
  const live = calendar || pastAt !== null ? null : layers.live;
  // ChartCore aligns the running candle to fixed seconds. That does not fit a week or month, so for W1 and MN the price goes into the last candle here.
  const calendarLive = useMemo(() => {
    if (!calendar || !ratesData || offsetSec === null || layers.live === null) return null;
    return liveCalendarBar(calendar, ratesData.bars.at(-1) ?? null, layers.live.price, layers.live.nowSec);
  }, [calendar, ratesData, offsetSec, layers.live]);
  // On the formation timeframes the running candle comes from the search (the common M15 price, FRM-31) unless the stream has a live price;
  // the candle of the request then stays out of the series so that it is not drawn twice
  const runningBar = contextTf && pastAt === null && live === null ? scan.running[contextTf] : null;
  const shown = useMemo(() => {
    if (!data || !ratesData) return data;
    if (calendarLive) return buildChartData([...ratesData.bars.slice(0, -1), calendarLive], [], tfSec, now());
    // On the formation timeframes the series never holds the candle of the request (it comes with the search or the stream): the series does not change when the search ends
    if (contextTf && pastAt === null && ratesData.liveFrom !== null) {
      const liveFrom = ratesData.liveFrom;
      return buildChartData(ratesData.bars.filter((b) => b.time < liveFrom), ratesData.missing, tfSec, now());
    }
    return data;
  }, [data, calendarLive, contextTf, pastAt, ratesData, tfSec, now]);

  // The trend line draws the draft (FRM-42): formations and alarm use the applied setting, the line previews the change.
  // With the range "All" the line is built from the closed candles of the chart (no extra request, ANA-21); a chosen range needs the warm-up
  // before its start, which `useTrendPath` requests.
  const wholeHistory = range.from === null;
  const remoteTrend = useTrendPath({ accountId, symbol: accepted, timeframe, range: { from: range.from, to: askRange.to }, offsetSec, clockReady }, showTrend && !wholeHistory, trendDraft, now);
  const trend = useMemo(() => {
    if (!wholeHistory) return remoteTrend;
    const tf = contextTimeframe(timeframe);
    const own = { segments: [] as ReturnType<typeof buildTrendPath>, axis: [] as number[] };
    if (showTrend && tf && signalBars.length > 0) {
      own.segments = buildTrendPath(tf, signalBars, usableTrendSettings(trendDraft));
      own.axis = signalBars.map((b) => b.time);
    }
    return { ...own, loading: false, error: null };
  }, [wholeHistory, remoteTrend, timeframe, showTrend, trendDraft, signalBars]);

  // One storage key per product (1107-A21.6): on the first open, the drawings of the three old keys merge into it
  const contextKey = accepted ? chartWorkspaceKey({ source, account: accountId, symbol: accepted }) : '';
  const hydrated = useChartWorkspaceStore((s) => s.hydrated);
  const [mergedKey, setMergedKey] = useState<string | null>(null);
  useEffect(() => {
    useChartWorkspaceStore.getState().hydrate();
  }, []);
  useEffect(() => {
    if (!hydrated || !accepted) return;
    const store = useChartWorkspaceStore.getState();
    if (!store.documents[contextKey]) {
      const oldKeys = legacyWorkspaceKeys({ source, account: accountId, symbol: accepted });
      const merged = mergeLegacyDocuments(legacyDocumentsForMerge(store.documents, store.links, oldKeys));
      if (merged) store.setDocument(contextKey, merged);
      // A product opened for the first time shows only RSI(7) and EWO(5/35): the Wave 5/35 layer is off, EWO is an ordinary indicator pane
      else store.setDocument(contextKey, { ...emptyChartDocument(), overlays: { wave: false }, indicators: [systemRsiIndicator(), newIndicator('EWO')] });
      // The linked drawing set of the old keys (1107-A21.16): the new key joins it, its own drawings merge into the shared set
      const link = legacyLinkFor(store.links, contextKey, oldKeys);
      if (link) {
        try { store.setLinked(contextKey, link); } catch { /* A damaged drawing document in the old set: the new key keeps its own drawings, unlinked */ }
      }
    }
    const frame = requestAnimationFrame(() => setMergedKey(contextKey));
    return () => cancelAnimationFrame(frame);
  }, [hydrated, accepted, contextKey, source, accountId]);

  const overlays = useChartOverlays(contextKey, { formations: true, rsi: true, wave: true });
  // The formation rules read RSI(7) on close of the chart timeframe: with other settings the RSI pane shows other numbers, so its drawings are hidden
  const rsiMatches = useChartWorkspaceStore((s) => {
    const config = s.documents[contextKey]?.indicators.find(isSystemRsi);
    return !config || matchesFormationRsi(config, tfSec, RSI_PARAMS.period);
  });
  const others = useMemo(() => (hit ? scan.hits.filter((h) => h.tf === hit.tf) : []), [scan.hits, hit]);
  const atr = useMemo(() => {
    const view = hit && scan.context && scan.scanAt !== null ? scan.context.view(hit.tf, scan.scanAt) : null;
    return [...(view?.atr ?? [])].reverse().find((v): v is number => v !== null && v > 0) ?? null;
  }, [hit, scan.context, scan.scanAt]);
  const priceRange = useMemo(() => (hit ? drawingPriceRange(hit.candidate) : null), [hit]);

  // Favorites (FRM-29): the search runs in the layout (FormationScanRunner), the page reads the store
  const favorites = useFavorites(accountId);
  const found = useFavoritesScanStore((s) => s.results);
  const favoritesScanMs = useFavoritesScanStore((s) => s.scanMs);
  const hasFavorites = favorites.ready && favorites.symbols.length > 0;
  const results = useMemo(() => Object.fromEntries(favorites.symbols.filter((s) => found[s]).map((s) => [s, found[s]])), [favorites.symbols, found]);
  const sidebar = useFormationSidebar();
  // From lg the card lives in the right rail and its panel (1107-A21.22); below lg it floats over the chart as before
  const wide = useMediaQuery('(min-width: 1024px)');
  // The button "Kart" reopens the card tab that was open last (the store holds one tab; "favorites" is the other button)
  const lastCardTab = useRef<Exclude<CardTab, 'favorites'>>('conditions');
  const toggleRail = (group: 'card' | 'favorites') => {
    if (group === 'favorites') {
      if (sidebar.tab !== 'favorites') lastCardTab.current = sidebar.tab;
      sidebar.toggle('favorites');
    } else {
      sidebar.toggle(sidebar.tab !== 'favorites' ? sidebar.tab : lastCardTab.current);
    }
  };
  const [formFilter, setFormFilter] = useState<ScanFormation | null>(null);
  const favTf: ContextTimeframe = contextTf ?? 'H4';
  // A filter that the selected timeframe does not have no longer applies
  const filter = formFilter && formedSummary(results, favTf).some((x) => x.form === formFilter) ? formFilter : null;
  const rows = useMemo(() => favoriteSymbols(favorites.symbols, results, favTf, filter), [favorites.symbols, results, favTf, filter]);
  const pickFavoriteTimeframe = (next: ContextTimeframe) => {
    setActive(null);
    setView({ tf: next });
  };
  const pickFavoriteForm = (next: ScanFormation) => {
    if (filter === next) {
      setFormFilter(null);
      return;
    }
    setFormFilter(next);
    setActive(null);
    setView({ form: next });
  };
  const openFavorite = (next: string) => {
    clearSelection();
    // Favorites apply live: a click in a past view opens the product live (FRM-38)
    if (pastAt !== null) setAt(null);
    setSymbol(next);
    const nextForm = filter ?? results[next]?.find((h) => h.tf === favTf)?.form;
    if (contextTf && nextForm) setView({ form: nextForm, tf: contextTf });
    // Unter 1024 px liegt die Karte über dem Chart
    if (window.innerWidth < 1024) sidebar.close();
  };
  const favoriteViews = hasFavorites
    ? {
        timeframes: <FavoritesTimeframes results={results} tf={favTf} onTimeframe={pickFavoriteTimeframe} />,
        forms: <FavoritesForms results={results} tf={favTf} filter={filter} onForm={pickFavoriteForm} />,
      }
    : null;
  const alarm = useFormationAlarm(accountId, scanSymbol);

  // Image of the formation (shot): candles with the drawings
  const captureRef = useRef<(() => Promise<ChartPicture>) | null>(null);
  const registerCapture = useCallback((capture: (() => Promise<ChartPicture>) | null) => {
    captureRef.current = capture;
  }, []);
  const shot = hit && urlSymbol && scan.scanAt !== null && !scan.loading ? { hit, symbol: urlSymbol, scanAt: scan.scanAt } : null;
  const makeShotImage = async () => {
    const capture = captureRef.current;
    if (!shot || !capture) throw new Error('chart is not ready');
    const shotData = buildShotData({ hit: shot.hit, symbol: shot.symbol, stamp: pastAt !== null ? t('formation.asof.stamp', { time: format.mt5DateTime(shot.scanAt) }) : format.mt5DateTime(shot.scanAt), locale, t, number: format.number });
    return shotBlob(composeShot({ picture: await capture(), data: shotData }));
  };

  const onTimeframe = (next: ChartTimeframe) => {
    setActive(null);
    setPicked(null);
    setView({ tf: next });
  };
  const tfCounts = useMemo(() => Object.fromEntries(CONTEXT_TIMEFRAMES.map((x) => [x, hitsCount(scan.hits, { tf: x })])) as Partial<Record<ChartTimeframe, number>>, [scan.hits]);


  const symbolSelect = (
    <FormationSymbolSelect
      // The slot of the top bar already limits the width on the phone; a second 42 % would leave no room for the name
      className="@max-[30rem]/formation-main:max-w-full!"
      accountId={accountId}
      value={urlSymbol}
      onChange={(next) => {
        clearSelection();
        setSymbol(next);
      }}
    />
  );
  const formationActions = (
    <FormationActions
      {...(formationTf ? {} : { enabled: false as const, disabledHint: { asOf: t('formation.asof.offTf.hint'), shot: t('formation.shot.offTf.hint') } })}
      showAsOf
      pastAt={pastAt}
      tfSec={tfSec}
      now={now}
      onAsOf={setAt}
      shotReady={shot !== null}
      makeShotImage={makeShotImage}
      shotFileName={shot ? shotFileName(shot.hit, shot.symbol, shot.scanAt) : ''}
      symbol={urlSymbol}
      alarm={alarm}
      hit={hit}
      conditionsOpen={sidebar.open && sidebar.tab === 'conditions'}
      onToggleConditions={() => sidebar.toggle('conditions')}
    />
  );
  const forms = contextTf ? (
    <FormationForms
      hits={scan.hits}
      tf={contextTf}
      form={form}
      onForm={(next) => {
        setActive(null);
        setPicked(null);
        setView({ form: next });
      }}
      onlyWithHits
      emptyNote={scan.loading ? undefined : t('chart.formation.noneTf')}
      optionHint={({ form: name, count }) => t('formation.form.optionTf.hint', { form: name, count })}
    />
  ) : (
    <span className="px-1 text-xs text-muted-foreground" data-testid="formation-forms-empty">{t('chart.formation.onlyTf')}</span>
  );

  const notices = (
    <>
      {offsetSec !== null && (
        <ChartNotice>
          <Badge tone="info" hint={t('analysis.clock.badge.hint')} data-testid="broker-clock">{t('analysis.clock.badge', { offset: formatOffset(offsetSec) })}</Badge>
        </ChartNotice>
      )}
      {chrome.notices}
      {pastAt !== null && (
        <ChartNotice>
          <Badge tone="warning" hint={t('formation.asof.menu.hint')} data-testid="formation-asof-notice">{t('formation.asof.notice', { time: format.mt5DateTime(pastAt) })}</Badge>
          {scan.hasGaps && <Badge tone="warning" hint={t('formation.asof.menu.hint')} data-testid="formation-asof-gap">{t('formation.asof.gap')}</Badge>}
        </ChartNotice>
      )}
      {!formationTf && (
        <ChartNotice>
          <p className="rounded-lg bg-background/95 p-2 text-xs text-muted-foreground" data-testid="formation-off-tf">{t('chart.formation.offTf')}</p>
        </ChartNotice>
      )}
      {!urlSymbol && zones && (
        <ChartNotice>
          <Alert tone="info" title={t('formation.noSymbol.title')}>{t('formation.noSymbol.text')}</Alert>
        </ChartNotice>
      )}
      {symbolsError && (
        <ChartNotice>
          <div data-testid="formation-symbols-error"><Alert tone="warning" title={t('formation.symbols.failed')}>{symbolsError}</Alert></div>
        </ChartNotice>
      )}
      {urlSymbol && ready && !isLoading && !accepted && (
        <ChartNotice>
          <Alert tone="warning" title={t('cw.invalidSymbol')} />
        </ChartNotice>
      )}
      {d1.error && (
        <ChartNotice>
          <Alert tone="danger" title={t('analysis.chart.loadFailed')}>{d1.error}</Alert>
        </ChartNotice>
      )}
      {zoneId && zones && !zones.some((z) => z.id === zoneId) && (
        <ChartNotice>
          <Alert tone="info" title={t('chart.zone.notFound')}>{t('chart.zone.notFound.withAccount')}</Alert>
        </ChartNotice>
      )}
      {scan.error && formationTf && (
        <ChartNotice>
          <Alert tone="danger" title={t('formation.scan.failed')}>{scan.error}</Alert>
        </ChartNotice>
      )}
      {trend.error && (
        <ChartNotice>
          <Alert tone="danger" title={t('analysis.chart.loadFailed')}>{trend.error}</Alert>
        </ChartNotice>
      )}
      {ratesData && data && (
        // The note is a one-line chip (1107-A21.12); the area around it lets clicks through to the chart
        <div className="pointer-events-none w-full max-w-md">
          <DataQualityBanner missing={dailyMissing ?? data.missing} clipped={ratesData.clipped} dbFull={ratesData.dbFull} loadedFrom={ratesData.from} calendar={calendar !== null} scroll chip allHistory={range.from === null} limit={d1.data?.older === 'limit'} />
        </div>
      )}
      {scan.loading && formationTf && (
        <p className="flex items-center gap-2 rounded-lg bg-background/95 p-2 text-xs text-muted-foreground" role="status" data-testid="formation-loading">
          <Loader2 size={14} className="animate-spin" /> {t('formation.scan.loading')}
        </p>
      )}
      {d1.loading && <p className="rounded-lg bg-background/95 p-2 text-sm text-muted-foreground">{t('analysis.chart.loading')}</p>}
    </>
  );

  const cardTitle = zone ? t('chart.zone.title', { n: layers.setupNo, symbol: zone.symbol || '—' }) : (symbolKey ?? t('nav.chart'));
  const noSetup = symbolKey && zones ? <NoSetupNote symbol={symbolKey} /> : null;
  const conditionsNode = formationTf ? (
    <FormationConditions list={list} hit={hit} loading={scan.loading} tf={favTf} digits={scan.digits} active={active} onSelect={(h) => setPicked(`${h.form}-${h.tf}`)} onActive={setActive} />
  ) : (
    <p className="px-3 py-2 text-xs text-muted-foreground" data-testid="conditions-off-tf">{t('chart.formation.offTf')}</p>
  );
  const favoritesAdd = <FavoritesAddButton onAdd={() => document.querySelector<HTMLInputElement>('[data-testid="formation-symbol"] input')?.focus()} />;
  const favoritesNode = (
    <FavoritesSidebar
      accountId={accountId}
      favorites={favorites.symbols}
      rows={rows}
      activeSymbol={urlSymbol}
      timeframes={favoriteViews?.timeframes}
      forms={favoriteViews?.forms}
      asOfPast={pastAt !== null}
      onPick={openFavorite}
      onToggle={favorites.toggle}
    />
  );
  const overviewNode = zone ? <SetupOverview accountId={accountId} zone={zone} timeframe={timeframe} onTimeframe={onTimeframe} prefs={prefs} data={ratesData} layers={layers} setups={setups} onSetup={setZone} /> : noSetup;
  const tradesNode = zone ? <SetupTrades accountId={accountId} data={ratesData} layers={layers} /> : noSetup;
  const card = (
    <ChartCard
      title={cardTitle}
      open={sidebar.open}
      onOpenChange={sidebar.setOpen}
      tab={sidebar.tab}
      onTab={sidebar.selectTab}
      conditions={conditionsNode}
      favorites={
        <>
          <div className="flex shrink-0 justify-end px-1.5 pt-1.5">{favoritesAdd}</div>
          <div className="flex min-h-0 flex-1 flex-col" data-testid="favorites-panel">{favoritesNode}</div>
        </>
      }
      overview={overviewNode}
      trades={tradesNode}
    />
  );

  // Floating group: on the phone only with a past moment, else up to 106 rem container (in the band with the switch)
  const floatingGroup = compact ? (pastAt !== null && 'flex') || 'hidden' : 'flex @min-[106rem]/formation-main:hidden';
  const shownData = shown ?? data;
  let finalPoint = 'none';
  if (hit) finalPoint = hit.candidate.points[FINAL_POINT[hit.form]] ? 'done' : 'open';

  return (
    <ChartPage
      title={t('nav.chart')}
      testId="chart-page"
      pageProps={{ 'data-scan-ms': scan.scanMs ?? '', 'data-scan-runs': scan.scanRuns, 'data-favorites-scan-ms': favoritesScanMs ?? '' }}
      panelShown={wide && sidebar.open}
      topBar={
        <ChartTopBar
          account={chrome.account}
          target={symbolSelect}
          timeframes={<TimeframeSelect value={timeframe} onChange={onTimeframe} options={CHART_TIMEFRAMES} counts={tfCounts} flat />}
          forms={forms}
          range={chrome.range}
          tools={<>{formationActions}<LicenseInfo /></>}
        />
      }
      surface={
        <div className="absolute inset-0" data-testid="free-chart-panel">
          {shownData && accepted && mergedKey === contextKey && (
            <ChartView
              key={contextKey}
              workspace={{ key: contextKey, symbol: accepted, view: 'free', systemRsi: true, syncIdentity: { source, account: accountId, symbol: accepted } }}
              signalBars={signalBars}
              timeframe={timeframe}
              formationLayers={null}
              setupLayers={<SetupSwitches idPrefix="layer" legendLayers={layers.legendLayers} prefs={prefs} />}
              viewActions={formationTf ? <FormationDrawingsToggle contextKey={contextKey} visible={overlays.formations} /> : undefined}
              modeSettings={<FormationLineTable />}
              data={shownData}
              timeframeSec={tfSec}
              until={pastAt ?? (calendar ? barEnd(calendar, shownData.bars.at(-1)?.time ?? 0) : undefined)}
              digits={ratesData?.digits ?? null}
              viewKey={viewKey}
              band={zone ? layers.band : null}
              lines={zone && pastAt === null ? layers.lines : []}
              markers={zone ? layers.markers : []}
              links={zone ? layers.links : []}
              fractals={zone ? layers.fractals : []}
              notes={zone ? layers.notes : undefined}
              focus={zone ? layers.focus : null}
              live={live}
              trendPath={trend}
              toolbarActions={<TrendToggle timeframe={timeframe} size="xs" />}
              clockNow={calendar || pastAt !== null || offsetSec === null || ratesData?.liveFrom == null ? null : now()}
              onNeedOlder={pastAt === null ? d1.loadOlder : undefined}
              olderEdge={olderEdge}
              runningBar={runningBar}
              priceRange={priceRange}
              surfaceProps={{ 'data-testid': 'formation-chart', 'data-final-point': finalPoint }}
              renderOverlay={
                formationTf && hit
                  ? (scene) => (
                      <FormationLayer scene={scene} hit={hit} bars={signalBars.length > 0 ? signalBars : NO_BARS} points={shownData.points} running={scan.running[hit.tf]} asOf={pastAt !== null} active={active} onActive={setActive} onCapture={registerCapture} onPriceBottom={setPriceBottom} visible={overlays.formations} rsiVisible={overlays.rsi && rsiMatches} waveVisible={overlays.wave} others={others} workspaceKey={contextKey} onSelectHit={(h: ScanHit) => { setView({ form: h.form, tf: h.tf }); setPicked(`${h.form}-${h.tf}`); }} atr={atr} />
                    )
                  : undefined
              }
              fullscreenOfPage
            />
          )}
        </div>
      }
      notices={null}
      floating={
        <>
          <ChartOverlays notices={notices}>{!wide && card}</ChartOverlays>
          {/* Phone: the card starts closed; this button opens it (board 4). It sits outside the dock, so it does not take room from the tool packages */}
          <div className="pointer-events-auto absolute right-3 top-[calc(var(--chart-top,0px)+0.5rem)] z-[51] lg:hidden"><Button size="icon-sm" variant="outline" className="bg-background" hint={t('chart.card.open.hint')} aria-label={t('chart.card.open')} aria-expanded={sidebar.open} data-testid="chart-card-open" onClick={() => sidebar.setOpen(!sidebar.open)}><PanelRight size={15} aria-hidden="true" /></Button></div>
          {formationTf && (
            // Schwebende Gruppe: unter 106 rem Container (und auf dem Handy) die Schritte, im Band 91 bis 106 rem auch der Schalter (UI-15)
            <div className={cn('pointer-events-none absolute bottom-3 right-16 z-20 items-center gap-1', floatingGroup)} data-testid="formation-asof-floating">
              <FormationAsOf float pastAt={pastAt} now={now} onChange={setAt} />
              <FormationAsOfSteps float pastAt={pastAt} tfSec={tfSec} now={now} onChange={setAt} />
            </div>
          )}
          {formationTf && hit && (
            <ul className={`pointer-events-none absolute max-lg:mt-(--chart-top) left-[64px] right-20 z-10 hidden w-fit max-w-[calc(100%-6rem)] flex-wrap gap-x-3 gap-y-1 rounded-lg border border-border bg-background/90 px-3 py-2 text-[11px] text-muted-foreground min-[900px]:flex ${priceBottom > 0 ? '' : 'invisible'}`} style={{ top: priceBottom - 8, transform: 'translateY(-100%)' }} data-testid="formation-legend">
              {drawsZigzag(hit.candidate) && <li>{t('formation.legend.zigzag', { points: Object.entries(hit.candidate.points).sort(([, a], [, b]) => a.time - b.time).map(([name]) => name).join('–') })}</li>}
              <li>{t('formation.legend.ratio')}</li>
              <li>{t('formation.legend.target', { point: FINAL_POINT[hit.form] })}</li>
              <li>{t('formation.legend.zone')}</li>
              <li>{t('formation.legend.rsi')}</li>
              <li>{t('formation.legend.wave')}</li>
            </ul>
          )}
        </>
      }
      panel={
        wide ? (
          <ChartSideRail
            title={cardTitle}
            open={sidebar.open}
            tab={sidebar.tab}
            onToggle={toggleRail}
            onTab={sidebar.selectTab}
            conditions={conditionsNode}
            favorites={favoritesNode}
            favoritesAction={favoritesAdd}
            overview={overviewNode}
            trades={tradesNode}
          />
        ) : null
      }
    />
  );
}
