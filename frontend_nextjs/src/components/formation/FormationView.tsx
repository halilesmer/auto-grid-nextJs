'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bookmark, ListChecks, Loader2 } from 'lucide-react';

import { useAccounts } from '@/components/account/hooks';
import { ChartPage } from '@/components/chart-page/ChartPage';
import { ChartModeSegment } from '@/components/chart-page/ChartTopBar';
import { ChartPanel } from '@/components/chart-page/ChartPanel';
import { FavoritesAddButton, FavoritesSidebar } from '@/components/formation/FavoritesSidebar';
import { FormationChart } from '@/components/formation/FormationChart';
import { FormationConditions } from '@/components/formation/FormationConditions';
import { FormationSidebarTabs } from '@/components/formation/FormationSidebarTabs';
import { FormationStatusChip } from '@/components/formation/FormationStatusChip';
import { FormationAccountSelect, FormationSymbolSelect } from '@/components/formation/FormationSelectors';
import { FormationAlarmMenu } from '@/components/formation/FormationAlarmMenu';
import { FormationAsOf, FormationAsOfSteps, useCompact } from '@/components/formation/FormationAsOf';
import { FormationShotMenu } from '@/components/formation/FormationShotMenu';
import { FavoritesForms, FavoritesTimeframes } from '@/components/formation/FormationFavoritesBar';
import { FormationToolbar } from '@/components/formation/FormationToolbar';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { formatOffset } from '@/components/analysis/BrokerClockNotice';
import { ChartNotice } from '@/components/chart-page/ChartOverlays';
import { Tooltip } from '@/components/ui/tooltip';
import { useAccountSettings } from '@/hooks/useAccountSettings';
import { useBrokerClock } from '@/hooks/useBrokerClock';
import { useFavorites } from '@/hooks/useFavorites';
import { useFormationAlarm } from '@/hooks/useFormationAlarm';
import { useFormationSidebar, type SidebarTab } from '@/hooks/useFormationSidebar';
import { brokerNow } from '@/lib/serverTime';
import { resolveAsOf } from '@/lib/formation/asOf';
import { TIMEFRAME_SEC } from '@/lib/analysis/candles';
import { useFormationParams } from '@/hooks/useFormationParams';
import { useFormationScan } from '@/hooks/useFormationScan';
import { useFormat, useLocale, useT, type MessageKey } from '@/i18n';
import { drawsZigzag } from '@/lib/formation/drawingLayout';
import { favoriteSymbols, FINAL_POINT, formedSummary, timeframeForForm, type ScanFormation } from '@/lib/formation/scan';
import { buildShotData, shotFileName } from '@/lib/formation/shotData';
import { composeShot, shotBlob, type ChartPicture } from '@/lib/formation/shotImage';
import { selectAccount, useAccountStore, useSettingsStore } from '@/store';
import { useFavoritesScanStore } from '@/store/useFavoritesScanStore';
import { cn } from '@/lib/utils';

/** Neuer Versuch nach einem fehlgeschlagenen Laden der Konten */
const ACCOUNTS_RETRY_MS = 10_000;

/**
 * Modus Formation der Chartseite (/chart?mode=formation): Das Symbol ist frei wählbar, ohne Wahl gilt das erste Setup des Kontos; im Hintergrund läuft die Suche über alle
 * Formationen und Zeiteinheiten (useFormationScan). Chart, Kandidaten-Liste und Checkliste zeigen den gewählten Kandidaten.
 */
export function FormationView() {
  const compact = useCompact();
  const t = useT();
  const locale = useLocale();
  const format = useFormat();
  const { accountId: urlAccount, zoneId: urlZone, symbol: urlSymbol, tf, form, atParam, setAccount, adoptAccount, setSymbol, setView, setAt } = useFormationParams();
  const accounts = useAccountStore((s) => s.accounts);
  const selected = useAccountStore((s) => s.selectedAccount);
  const settings = useSettingsStore((s) => s.settings);
  const loadedAccount = useSettingsStore((s) => s.loadedAccount);
  const symbolsError = useSettingsStore((s) => s.symbolsError);
  const { fetchAccounts } = useAccounts();

  const accountId = urlAccount ?? selected;
  const accountKnown = accounts.some((a) => String(a.id) === accountId);

  // Schlägt das erste Laden fehl (der Worker startet gerade neu), bliebe die Auswahl sonst leer: neuer Versuch im Takt
  const accountsLoaded = accounts.length > 0;
  useEffect(() => {
    if (accountsLoaded) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    // Der nächste Versuch wird erst nach dem Ende des vorigen geplant: eine hängende Anfrage stapelt keine weiteren
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

  // Ein Konto aus der Adresse wird global gewählt (wie in Setup und Frei); ohne ?account= wird das gewählte Konto in die Adresse übernommen,
  // damit Moduswechsel und Links dasselbe Konto tragen
  useEffect(() => {
    if (urlAccount) {
      if (accountKnown && urlAccount !== useAccountStore.getState().selectedAccount) selectAccount(urlAccount);
    } else if (selected) {
      adoptAccount(selected);
    }
  }, [urlAccount, selected, accountKnown, adoptAccount]);

  const settingsError = useAccountSettings(accountKnown ? accountId : null, 'ifMissing');
  const zones = useMemo(
    () => (accountId && loadedAccount === accountId && settings ? (settings.ZONES ?? []) : null),
    [accountId, loadedAccount, settings],
  );
  // Ohne ?symbol= gilt das Setup aus ?zone= (alte Links), sonst das erste Setup des Kontos
  const zoneId = urlZone ?? zones?.[0]?.id ?? null;
  const zone = zones?.find((z) => z.id === zoneId) ?? null;
  const symbol = urlSymbol ?? (zone?.symbol?.toUpperCase().trim() || null);

  const clock = useBrokerClock(accountKnown ? accountId : null);
  const offsetSec = clock.clock?.reliable ? clock.clock.offset_sec : null;
  // Suche in der Vergangenheit (FRM-38): `?at=` gilt, solange es vor der laufenden M15-Kerze liegt; sonst live
  const brokerNowSec = useCallback(() => (offsetSec !== null ? brokerNow(offsetSec) : Date.now() / 1000), [offsetSec]);
  // Ohne verlässliche Brokeruhr gilt UTC jetzt: der Broker liegt davor, ein Stand nahe „jetzt“ fällt so eher auf live zurück als in die Zukunft
  const pastAt = resolveAsOf(atParam, brokerNowSec());
  // Ein ungültiger oder zu junger Wert fällt auf live zurück und verschwindet aus der Adresse (sobald die Brokeruhr geladen ist)
  useEffect(() => {
    if (atParam !== null && pastAt === null && !clock.loading) setAt(null);
  }, [atParam, pastAt, clock.loading, setAt]);
  const scan = useFormationScan(accountKnown ? accountId : null, symbol, offsetSec, !clock.loading, pastAt);

  const list = useMemo(() => scan.hits.filter((h) => h.form === form && h.tf === tf), [scan.hits, form, tf]);
  const [pickedTf, setPicked] = useState<string | null>(null);
  const hit = list.find((h) => `${h.form}-${h.tf}` === pickedTf) ?? list[0] ?? null;
  const [active, setActive] = useState<string[] | null>(null);
  const [priceBottom, setPriceBottom] = useState(0);
  // Kandidat und Markierung gehören zum alten Produkt
  const clearSelection = () => {
    setActive(null);
    setPicked(null);
  };

  const formName = t(`formation.form.${form}` as MessageKey);

  // Favoriten (FRM-29): die Suche läuft im Layout (FormationScanRunner), die Seite liest nur den Store
  const favorites = useFavorites(accountKnown ? accountId : null);
  const found = useFavoritesScanStore((s) => s.results);
  const favoritesScanMs = useFavoritesScanStore((s) => s.scanMs);
  const hasFavorites = favorites.ready && favorites.symbols.length > 0;
  const results = useMemo(
    () => Object.fromEntries(favorites.symbols.filter((s) => found[s]).map((s) => [s, found[s]])),
    [favorites.symbols, found],
  );
  const sidebar = useFormationSidebar();
  const [formFilter, setFormFilter] = useState<ScanFormation | null>(null);
  // Ein Filter, den der gewählte Zeitraum nicht hat, gilt nicht mehr
  const filter = formFilter && formedSummary(results, tf).some((x) => x.form === formFilter) ? formFilter : null;
  const rows = useMemo(() => favoriteSymbols(favorites.symbols, results, tf, filter), [favorites.symbols, results, tf, filter]);
  const pickTimeframe = (next: typeof tf) => {
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
    // Favoriten gelten live: ein Klick im Vergangenheits-Stand öffnet das Produkt live (FRM-38)
    if (pastAt !== null) setAt(null);
    setSymbol(next);
    setView({ form: filter ?? results[next]?.find((h) => h.tf === tf)?.form, tf });
    // Unter 1024 px liegt die Leiste über dem Chart
    if (window.innerWidth < 1024) sidebar.close();
  };
  const favoriteViews = hasFavorites
    ? {
        timeframes: <FavoritesTimeframes results={results} tf={tf} onTimeframe={pickTimeframe} />,
        forms: <FavoritesForms results={results} tf={tf} filter={filter} onForm={pickFavoriteForm} />,
      }
    : null;
  // Ohne Favoriten gilt die Leiste wie bisher (undefined); mit offenem Reiter Favoriten stehen die Zeilen dort (null), sonst über dem Chart
  const favoritesShown = sidebar.open && sidebar.tab === 'favorites';
  const toolbarSlot = (node: ReactNode) => {
    if (!favoriteViews) return undefined;
    return favoritesShown ? null : node;
  };

  // Schwebende Gruppe: auf dem Handy nur mit Stand, sonst bis 106 rem Container (im Band mit dem Schalter)
  const floatingGroup = compact ? (pastAt !== null && 'flex') || 'hidden' : 'flex @min-[106rem]/formation-main:hidden';
  const alarm = useFormationAlarm(accountKnown ? accountId : null, symbol);

  const captureRef = useRef<(() => Promise<ChartPicture>) | null>(null);
  const registerCapture = useCallback((capture: (() => Promise<ChartPicture>) | null) => {
    captureRef.current = capture;
  }, []);
  const shot = hit && symbol && scan.scanAt !== null && !scan.loading ? { hit, symbol, scanAt: scan.scanAt } : null;
  const makeShotImage = async () => {
    const capture = captureRef.current;
    if (!shot || !capture) throw new Error('chart is not ready');
    const data = buildShotData({ hit: shot.hit, symbol: shot.symbol, stamp: pastAt !== null ? t('formation.asof.stamp', { time: format.mt5DateTime(shot.scanAt) }) : format.mt5DateTime(shot.scanAt), locale, t, number: format.number });
    return shotBlob(composeShot({ picture: await capture(), data }));
  };

  // Symbole der schmalen Leiste: ein Klick öffnet die Seitenleiste auf dem Reiter, auf dem aktiven Reiter schließt er sie
  const stripButton = (tab: SidebarTab, label: string, hint: string, icon: ReactNode) => {
    const on = sidebar.open && sidebar.tab === tab;
    return (
      <Tooltip content={hint} role="presentation" className={tab === 'favorites' ? 'mt-0.5' : undefined}>
        <button
          type="button"
          aria-pressed={on}
          aria-label={label}
          data-testid={`${tab}-toggle`}
          onClick={() => sidebar.toggle(tab)}
          className={cn('inline-flex size-8 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', on ? 'bg-accent text-primary' : 'text-muted-foreground hover:text-foreground')}
        >
          {icon}
        </button>
      </Tooltip>
    );
  };

  // Strip und Leiste gibt es erst mit bekanntem Konto; nur dann rückt der Chart zur Seite
  const sidebarShown = sidebar.open && accountKnown && !!accountId;

  const body = () => {
    if (!accountId) {
      return (
        <Alert className="absolute left-3 right-20 top-64 bg-background" tone="info" title={t('analysis.noAccount.title')}>
          {t('analysis.noAccount.text')}
        </Alert>
      );
    }
    if (!accountKnown) {
      return (
        accounts.length > 0 && (
          <Alert className="absolute left-3 right-20 top-64 bg-background" tone="warning" title={t('analysis.noAccount.title')}>
            {t('analysis.account.notFound', { id: accountId })}
          </Alert>
        )
      );
    }
    if (zones && !symbol) {
      return (
        <Alert className="absolute left-3 right-20 top-64 bg-background" tone="info" title={t('formation.noSymbol.title')}>
          {t('formation.noSymbol.text')}
        </Alert>
      );
    }
    if (scan.error) {
      return (
        <Alert className="absolute left-3 right-20 top-64 bg-background" tone="danger" title={t('formation.scan.failed')}>
          {scan.error}
        </Alert>
      );
    }
    return hit && scan.context && scan.scanAt !== null ? (
      <FormationChart accountId={accountId} hit={hit} context={scan.context} scanAt={scan.scanAt} running={scan.running[hit.tf]} digits={scan.digits} active={active} onActive={setActive} onCapture={registerCapture} onPriceBottom={setPriceBottom} asOf={pastAt !== null} />
    ) : (
      <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-muted-foreground" data-testid="formation-empty">
        {!scan.loading && t('formation.empty.chart', { form: formName, tf })}
      </div>
    );
  };

  return (
    <ChartPage
      title={t('formation.title')}
      pageProps={{ 'data-scan-ms': scan.scanMs ?? '', 'data-favorites-scan-ms': favoritesScanMs ?? '' }}
      panelShown={sidebarShown}
      surface={body()}
      topBar={
        <FormationToolbar
          hits={scan.hits}
          tf={tf}
          form={form}
          timeframes={toolbarSlot(favoriteViews?.timeframes)}
          forms={toolbarSlot(favoriteViews?.forms)}
          onTimeframe={(next) => {
            setActive(null);
            setView({ tf: next });
          }}
          onForm={(next) => {
            setActive(null);
            setView({ form: next, tf: timeframeForForm(scan.hits, next, tf) });
          }}
          actions={
            <>
              {accountKnown && <FormationAsOfSteps pastAt={pastAt} tfSec={TIMEFRAME_SEC[tf]} now={brokerNowSec} onChange={setAt} />}
              {accountKnown && <FormationAsOf pastAt={pastAt} now={brokerNowSec} onChange={setAt} />}
              <FormationShotMenu ready={shot !== null} makeImage={makeShotImage} fileName={shot ? shotFileName(shot.hit, shot.symbol, shot.scanAt) : ''} />
              <FormationAlarmMenu symbol={accountKnown ? symbol : null} alarm={alarm} pastView={pastAt !== null} />
              <FormationStatusChip hit={hit} open={sidebar.open && sidebar.tab === 'conditions'} onToggle={() => sidebar.toggle('conditions')} />
            </>
          }
        >
          <ChartModeSegment fill />
          {accountKnown && (
            <FormationSymbolSelect
              accountId={accountId}
              value={symbol}
              onChange={(next) => {
                clearSelection();
                setSymbol(next);
              }}
            />
          )}
          <FormationAccountSelect
            // Raster (Querformat und Desktop bis 91rem): Platz für die ganze Kontonummer (UI-15); breiter als `lg:w-44` wird es nur im Querformat
            className="bar2:min-w-40"
            accounts={accounts}
            value={accountId}
            onChange={(id) => {
              if (id === accountId) return;
              clearSelection();
              setAccount(id);
            }}
          />
        </FormationToolbar>
      }
      notices={
        <>
          {offsetSec !== null && (
            <ChartNotice>
              <Badge tone="info" hint={t('analysis.clock.badge.hint')} data-testid="broker-clock">{t('analysis.clock.badge', { offset: formatOffset(offsetSec) })}</Badge>
            </ChartNotice>
          )}
          {pastAt !== null && (
            <ChartNotice>
              <Badge tone="warning" hint={t('formation.asof.menu.hint')} data-testid="formation-asof-notice">{t('formation.asof.notice', { time: format.mt5DateTime(pastAt) })}</Badge>
              {scan.hasGaps && <Badge tone="warning" hint={t('formation.asof.menu.hint')} data-testid="formation-asof-gap">{t('formation.asof.gap')}</Badge>}
            </ChartNotice>
          )}
          {scan.loading && (
            <p className="flex items-center gap-2 rounded-lg bg-background/95 p-2 text-xs text-muted-foreground" role="status" data-testid="formation-loading">
              <Loader2 size={14} className="animate-spin" /> {t('formation.scan.loading')}
            </p>
          )}
          {accountKnown && symbolsError && (
            <div className="pointer-events-auto max-w-md" data-testid="formation-symbols-error">
              <Alert tone="warning" title={t('formation.symbols.failed')}>{symbolsError}</Alert>
            </div>
          )}
          {accountKnown && settingsError && (
            <div className="pointer-events-auto max-w-md">
              <Alert tone="danger" title={t('analysis.zone.failed')}>{settingsError}</Alert>
            </div>
          )}
        </>
      }
      floating={
        <>
        {accountKnown && (
          // Schwebende Gruppe: unter 106 rem Container (und auf dem Handy) die Schritte, im Band 91 bis 106 rem auch der Schalter (UI-15)
          <div className={cn('pointer-events-none absolute bottom-3 right-16 z-20 items-center gap-1', floatingGroup)} data-testid="formation-asof-floating">
            <FormationAsOf float pastAt={pastAt} now={brokerNowSec} onChange={setAt} />
            <FormationAsOfSteps float pastAt={pastAt} tfSec={TIMEFRAME_SEC[tf]} now={brokerNowSec} onChange={setAt} />
          </div>
        )}
        {hit && (
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
        accountKnown && accountId && (
          <ChartPanel
            open={sidebar.open}
            strip={
              <>
                {stripButton('favorites', t('formation.fav.toggle'), t('formation.fav.toggle.hint'), <Bookmark size={16} aria-hidden="true" className={cn(sidebar.open && sidebar.tab === 'favorites' && 'fill-primary')} />)}
                {stripButton('conditions', t('formation.conditions'), t('formation.conditions.hint'), <ListChecks size={16} aria-hidden="true" />)}
              </>
            }
          >
            <div className="flex h-full min-h-0 flex-col">
              <FormationSidebarTabs
                tab={sidebar.tab}
                onTab={sidebar.show}
                trailing={sidebar.tab === 'favorites' && <FavoritesAddButton onAdd={() => document.querySelector<HTMLInputElement>('[data-testid="formation-symbol"] input')?.focus()} />}
              />
              <div role="tabpanel" id="formation-tabpanel" aria-labelledby={`formation-tab-${sidebar.tab}`} className="flex min-h-0 flex-1 flex-col">
                {sidebar.tab === 'conditions' ? (
                  <FormationConditions
                    list={list}
                    hit={hit}
                    loading={scan.loading}
                    tf={tf}
                    digits={scan.digits}
                    active={active}
                    onSelect={(h) => setPicked(`${h.form}-${h.tf}`)}
                    onActive={setActive}
                  />
                ) : (
                  <div className="min-h-0 flex-1" data-testid="favorites-panel">
                    <FavoritesSidebar
                      accountId={accountId}
                      favorites={favorites.symbols}
                      rows={rows}
                      activeSymbol={symbol}
                      timeframes={favoriteViews?.timeframes}
                      forms={favoriteViews?.forms}
                      asOfPast={pastAt !== null}
                      onPick={openFavorite}
                      onToggle={favorites.toggle}
                    />
                  </div>
                )}
              </div>
            </div>
          </ChartPanel>
        )
      }
    />
  );
}
