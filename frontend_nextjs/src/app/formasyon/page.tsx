'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bookmark, Loader2 } from 'lucide-react';

import { useAccounts } from '@/components/account/hooks';
import { FavoritesSidebar } from '@/components/formation/FavoritesSidebar';
import { CandidateList } from '@/components/formation/CandidateList';
import { FormationChart } from '@/components/formation/FormationChart';
import { FormationChecklist } from '@/components/formation/FormationChecklist';
import { FormationAccountSelect, FormationSymbolSelect } from '@/components/formation/FormationSelectors';
import { FormationAlarmMenu } from '@/components/formation/FormationAlarmMenu';
import { FormationShotMenu } from '@/components/formation/FormationShotMenu';
import { FavoritesForms, FavoritesTimeframes } from '@/components/formation/FormationFavoritesBar';
import { FormationToolbar } from '@/components/formation/FormationToolbar';
import { Alert } from '@/components/ui/alert';
import { Tooltip } from '@/components/ui/tooltip';
import { FormationDetailsPanel } from '@/components/formation/FormationDetailsPanel';
import { useAccountSettings } from '@/hooks/useAccountSettings';
import { useBrokerClock } from '@/hooks/useBrokerClock';
import { useFavorites } from '@/hooks/useFavorites';
import { useFormationAlarm } from '@/hooks/useFormationAlarm';
import { useFormationParams } from '@/hooks/useFormationParams';
import { useFormationScan } from '@/hooks/useFormationScan';
import { useFormat, useLocale, useT, type MessageKey } from '@/i18n';
import { favoriteSymbols, FINAL_POINT, formedSummary, timeframeForForm, type ScanFormation } from '@/lib/formation/scan';
import { buildShotData, shotFileName } from '@/lib/formation/shotData';
import { composeShot, shotBlob, type ChartPicture } from '@/lib/formation/shotImage';
import { selectAccount, useAccountStore, useSettingsStore } from '@/store';
import { useFavoritesScanStore } from '@/store/useFavoritesScanStore';
import { cn } from '@/lib/utils';

/** Neuer Versuch nach einem fehlgeschlagenen Laden der Konten */
const ACCOUNTS_RETRY_MS = 10_000;

/**
 * Formationserkennung (/formasyon): Das Symbol ist frei wählbar, ohne Wahl gilt das erste Setup des Kontos; im Hintergrund läuft die Suche über alle
 * Formationen und Zeiteinheiten (useFormationScan). Chart, Kandidaten-Liste und Checkliste zeigen den gewählten Kandidaten.
 */
function FormationView() {
  const t = useT();
  const locale = useLocale();
  const format = useFormat();
  const { accountId: urlAccount, zoneId: urlZone, symbol: urlSymbol, tf, form, setAccount, setSymbol, setView } = useFormationParams();
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

  // Ein Konto aus der Adresse wird global gewählt (wie auf /chart); ohne ?account= gilt das gewählte Konto, die Adresse bleibt sauber
  useEffect(() => {
    if (urlAccount && accountKnown && urlAccount !== useAccountStore.getState().selectedAccount) selectAccount(urlAccount);
  }, [urlAccount, accountKnown]);

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
  const scan = useFormationScan(accountKnown ? accountId : null, symbol, offsetSec, !clock.loading);

  const list = useMemo(() => scan.hits.filter((h) => h.form === form && h.tf === tf), [scan.hits, form, tf]);
  const [pickedTf, setPicked] = useState<string | null>(null);
  const hit = list.find((h) => `${h.form}-${h.tf}` === pickedTf) ?? list[0] ?? null;
  const [active, setActive] = useState<string[] | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(true);
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    setSymbol(next);
    setView({ form: filter ?? results[next]?.find((h) => h.tf === tf)?.form, tf });
    // Unter 900 px liegt die Leiste über dem Chart
    if (window.innerWidth < 900) setSidebarOpen(false);
  };
  const favoriteViews = hasFavorites
    ? {
        timeframes: <FavoritesTimeframes results={results} tf={tf} onTimeframe={pickTimeframe} />,
        forms: <FavoritesForms results={results} tf={tf} filter={filter} onForm={pickFavoriteForm} />,
      }
    : null;
  // Ohne Favoriten gilt die Leiste wie bisher (undefined); mit offener Seitenleiste stehen die Zeilen dort (null), sonst über dem Chart
  const toolbarSlot = (node: ReactNode) => {
    if (!favoriteViews) return undefined;
    return sidebarOpen ? null : node;
  };

  const alarm = useFormationAlarm(accountKnown ? accountId : null, symbol);

  const captureRef = useRef<(() => Promise<ChartPicture>) | null>(null);
  const registerCapture = useCallback((capture: (() => Promise<ChartPicture>) | null) => {
    captureRef.current = capture;
  }, []);
  const shot = hit && symbol && scan.scanAt !== null && !scan.loading ? { hit, symbol, scanAt: scan.scanAt } : null;
  const makeShotImage = async () => {
    const capture = captureRef.current;
    if (!shot || !capture) throw new Error('chart is not ready');
    const data = buildShotData({ hit: shot.hit, symbol: shot.symbol, stamp: format.mt5DateTime(shot.scanAt), locale, t, number: format.number });
    return shotBlob(composeShot({ picture: await capture(), data }));
  };

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
      <FormationChart accountId={accountId} hit={hit} context={scan.context} scanAt={scan.scanAt} running={scan.running[hit.tf]} digits={scan.digits} active={active} onActive={setActive} onCapture={registerCapture} />
    ) : (
      <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-muted-foreground" data-testid="formation-empty">
        {!scan.loading && t('formation.empty.chart', { form: formName, tf })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-20 overflow-hidden bg-card lg:top-(--nav-height)" data-testid="formation-page" data-scan-ms={scan.scanMs ?? ''} data-favorites-scan-ms={favoritesScanMs ?? ''}>
      <h1 className="sr-only">{t('formation.title')}</h1>
      {/* Die Seitenleiste schiebt den Chart ab 1280 px; darunter liegt sie unter der Kopfleiste über dem Chart, damit die Werkzeuge in der Kopfleiste frei bleiben. Die Leiste ganz rechts bleibt immer frei */}
      <div className={cn('absolute inset-y-0 left-0 right-10', sidebarOpen && 'min-[1280px]:right-[328px]')} data-testid="formation-main">
      <div className="absolute inset-0" data-testid="formation-surface">
        {body()}
      </div>
      <div className="pointer-events-none absolute left-[52px] right-0 top-18 z-50 min-w-0 lg:top-0">
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
              <FormationShotMenu ready={shot !== null} makeImage={makeShotImage} fileName={shot ? shotFileName(shot.hit, shot.symbol, shot.scanAt) : ''} />
              <FormationAlarmMenu symbol={accountKnown ? symbol : null} accountKnown={accountKnown} alarm={alarm} />
            </>
          }
        >
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
            accounts={accounts}
            value={accountId}
            onChange={(id) => {
              if (id === accountId) return;
              clearSelection();
              setAccount(id);
            }}
          />
        </FormationToolbar>
      </div>
      <div className="pointer-events-none absolute left-[64px] right-3 top-[184px] z-30 flex min-w-0 flex-col items-start gap-2 sm:right-20 lg:top-[136px]">
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
      </div>
      <FormationDetailsPanel
        title={`${formName} · ${tf}`}
        open={detailsOpen}
        onToggle={() => {
          setActive(null);
          setDetailsOpen(!detailsOpen);
        }}
      >
        {list.length > 0 ? (
          <CandidateList hits={list} selected={hit} onSelect={(h) => setPicked(`${h.form}-${h.tf}`)} />
        ) : (
          <p className="px-3 py-2 text-xs text-muted-foreground" data-testid="candidate-empty">
            {scan.loading ? t('formation.scan.loading') : t('formation.empty.list', { tf })}
          </p>
        )}
        {hit ? (
          <FormationChecklist hit={hit} active={active} onActive={setActive} />
        ) : !scan.loading && (
          <p className="p-3 text-xs text-muted-foreground">{t('formation.empty.text', { tf })}</p>
        )}
      </FormationDetailsPanel>
      {hit && (
        <ul className="pointer-events-none absolute bottom-[20%] left-[64px] right-20 z-10 hidden w-fit max-w-[calc(100%-6rem)] flex-wrap gap-x-3 gap-y-1 rounded-lg border border-border bg-background/90 px-3 py-2 text-[11px] text-muted-foreground min-[900px]:flex" data-testid="formation-legend">
          <li>{t('formation.legend.zigzag', { points: Object.keys(hit.candidate.points).join('–') })}</li>
          <li>{t('formation.legend.ratio')}</li>
          <li>{t('formation.legend.target', { point: FINAL_POINT[hit.form] })}</li>
          <li>{t('formation.legend.zone')}</li>
          <li>{t('formation.legend.rsi')}</li>
        </ul>
      )}
      </div>
      {accountKnown && accountId && (
        <>
          <div className="absolute inset-y-0 right-0 z-[60] flex w-10 flex-col items-center border-l border-border bg-background pt-18 lg:pt-0" data-testid="favorites-strip">
            <Tooltip content={t('formation.fav.toggle.hint')} role="presentation" className="mt-0.5">
              <button
                type="button"
                aria-pressed={sidebarOpen}
                aria-label={t('formation.fav.toggle')}
                data-testid="favorites-toggle"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className={cn('inline-flex size-8 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', sidebarOpen ? 'bg-accent text-primary' : 'text-muted-foreground hover:text-foreground')}
              >
                <Bookmark size={16} aria-hidden="true" className={cn(sidebarOpen && 'fill-primary')} />
              </button>
            </Tooltip>
          </div>
          {sidebarOpen && (
            <div className="absolute inset-y-0 right-10 z-[60] w-72 border-l border-border bg-background pt-18 lg:top-[38px] lg:pt-0 min-[1280px]:top-0" data-testid="favorites-panel">
              <FavoritesSidebar
                accountId={accountId}
                favorites={favorites.symbols}
                rows={rows}
                activeSymbol={symbol}
                timeframes={favoriteViews?.timeframes}
                forms={favoriteViews?.forms}
                onPick={openFavorite}
                onToggle={favorites.toggle}
                onAdd={() => document.querySelector<HTMLInputElement>('[data-testid="formation-symbol"] input')?.focus()}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function FormasyonPage() {
  // useSearchParams braucht eine Suspense-Grenze, sonst schlägt der Produktions-Build fehl
  return (
    <Suspense fallback={<div className="min-h-125" />}>
      <FormationView />
    </Suspense>
  );
}
