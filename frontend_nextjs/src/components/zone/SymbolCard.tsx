'use client';

import { useId, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, Plus } from 'lucide-react';
import SymbolAutoComplete from '@/components/SymbolAutoComplete';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldLabel, Tooltip } from '@/components/ui/tooltip';
import { useFormat, useT } from '@/i18n';
import { useSettingsStore } from '@/store';
import type { LiveData, SymbolDetail } from '@/store/types';
import { cn } from '@/lib/utils';
import { getSymbolConfig } from '@/utils/zoneHelpers';
import { SymbolLogsContext, type SymbolLogsContextValue } from './SymbolLogs';

interface SymbolCardProps {
  symbol: string;
  /** Zonen-ids der Setups in Kartenreihenfolge: die Symbol-Logs fragen sie ab, „Setup n“ ist Platz + 1 */
  setupIds: string[];
  /** Engine-Plätze der aktiven, gespeicherten Setups: Marktstatus kommt je Zone, gilt aber für das Symbol */
  marketIndexes: number[];
  liveData: LiveData;
  isGlobalRunning: boolean;
  symbolDetails: Record<string, SymbolDetail>;
  validateSymbol: (symbol: string) => boolean;
  disableAddSetup: boolean;
  onAddSetup: () => void;
  /** Neues Symbol für alle Setups dieses Symbols */
  onRenameSymbol: (symbol: string) => void;
  /** Die Setup-Karten (ZoneCard) */
  children: ReactNode;
}

interface SymbolFieldProps {
  symbol: string;
  symbolDetails: Record<string, SymbolDetail>;
  validateSymbol: (symbol: string) => boolean;
  onRenameSymbol: (symbol: string) => void;
}

/**
 * Symbolfeld im Kopf der Symbolkarte. Der getippte Stand gilt erst bei Auswahl aus der Liste oder beim
 * Verlassen des Feldes (sonst verschmilzt die Karte beim Tippen von „XAUUSDm“ schon bei „XAUUSD“ mit einer
 * anderen Karte). SymbolCard setzt `key={symbol}`: ändert sich das gespeicherte Symbol von außen
 * (z. B. „Verwerfen“), beginnt das Feld neu, statt den alten Entwurf beim nächsten Verlassen zu schreiben.
 */
function SymbolField({ symbol, symbolDetails, validateSymbol, onRenameSymbol }: SymbolFieldProps) {
  const t = useT();
  const fmt = useFormat();
  const [draft, setDraft] = useState(symbol);
  const symbolsError = useSettingsStore((s) => s.symbolsError);

  const hasError = Object.keys(symbolDetails).length > 0 && Boolean(draft) && !validateSymbol(draft);
  const fieldError = hasError ? (
    <span className="text-[11px] font-semibold text-danger">{t('zone.field.symbolInvalid')}</span>
  ) : (
    symbolsError && (
      // Worker sembolleri MT5'ten alamadı: autocomplete'in neden boş kaldığını göster
      <span data-testid="symbols-error" role="status" className="flex min-w-0 items-start gap-1 break-words text-[11px] text-muted-foreground">
        <AlertTriangle size={12} aria-hidden className="mt-px shrink-0 text-warning" />
        <span className="min-w-0">{t('zone.field.symbolsUnavailable', { message: symbolsError })}</span>
      </span>
    )
  );

  // Sembolün ondalık basamakları desen olarak, ör. digits=2 → "0,00" (tr/de) veya "0.00" (en)
  const digits = symbolDetails[symbol.toUpperCase()]?.digits;
  const symbolLabel =
    digits === undefined
      ? t('zone.field.symbol')
      : t('zone.field.symbolDigits', {
          pattern: fmt.number(0, { minimumFractionDigits: digits, maximumFractionDigits: digits }),
        });

  // Das Feld liefert immer Großbuchstaben: Fokus und Verlassen ohne Eingabe ändert ein gespeichertes
  // „XAUUSDm“ nicht
  const commit = (value: string) => {
    if (value !== symbol.toUpperCase().trim()) onRenameSymbol(value);
  };

  return (
    // Etiket input'un solunda, aynı satırda (1108-A5 K1); hata/uyarı altında kalır
    <div className="flex min-w-0 flex-col gap-1">
      <label className="flex min-w-0 items-center gap-2">
        <FieldLabel label={symbolLabel} hint={t('zone.field.symbol.hint')} className="shrink-0 text-xs font-medium text-muted-foreground" />
        <span className="w-[118px] shrink-0">
          <SymbolAutoComplete
            value={symbol}
            onChange={setDraft}
            onCommit={commit}
            symbolDetails={symbolDetails}
            hasError={hasError}
          />
        </span>
      </label>
      {fieldError}
    </div>
  );
}

const COLLAPSED_KEY = 'grid-robot-symbol-collapsed';

const COLLAPSED_EVENT = 'grid-robot-symbol-collapsed-change';

/** Rohwert aus localStorage; ohne Speicher (privates Fenster, gesperrt) null, dann sind alle Karten offen. */
function readCollapsedRaw(): string | null {
  try {
    return localStorage.getItem(COLLAPSED_KEY);
  } catch {
    return null; // Speicher nicht lesbar: Karten bleiben offen
  }
}

function parseCollapsed(raw: string | null): string[] {
  try {
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return []; // kaputter Eintrag: Karten bleiben offen
  }
}

function writeCollapsed(symbol: string, collapsed: boolean) {
  try {
    const rest = parseCollapsed(readCollapsedRaw()).filter((s) => s !== symbol);
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed ? [...rest, symbol] : rest));
  } catch {
    return; // Speicher nicht schreibbar: Zustand bleibt unverändert, Karte offen
  }
  window.dispatchEvent(new Event(COLLAPSED_EVENT));
}

function subscribeCollapsed(onChange: () => void) {
  window.addEventListener(COLLAPSED_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(COLLAPSED_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function statusOf(isGlobalRunning: boolean, remotePaused: boolean | undefined, states: (string | undefined)[]) {
  if (!isGlobalRunning || states.length === 0) return 'stopped' as const;
  // Unbekannter Zustand (vor dem ersten Metrics-Write, alter Worker) zählt nicht als Pause
  const known = states.filter((x): x is string => x !== undefined);
  if (remotePaused || (known.length > 0 && !known.includes('START'))) return 'paused' as const;
  return 'running' as const;
}

const STATUS_TONE = { running: 'success', paused: 'warning', stopped: 'neutral' } as const;

function pnlClass(pnl: number) {
  if (pnl > 0) return 'text-success';
  if (pnl < 0) return 'text-danger';
  return 'text-foreground';
}

/** Klick auf ein Bedienelement im Kopf (Symbolfeld, Buttons, Tooltips) klappt die Karte nicht. */
function isControl(target: EventTarget | null, header: Element) {
  if (!(target instanceof Element)) return false;
  // Klick aus einem Portal (Symbolliste) liegt außerhalb des Kopfes und klappt nicht
  if (!header.contains(target)) return true;
  // Nur Bedienelemente im Kopf zählen, nicht ein Vorfahre mit tabindex außerhalb
  const hit = target.closest('input, button, a, label, [role="listbox"], [tabindex]');
  return hit !== null && header.contains(hit);
}

/** Symbol mit seinen Setups (ZON-20): Kopf mit Symbol, Zahl der Setups, Preis und Markt; darunter die Setups. Die Symbol-Logs (LOG-07) öffnen über das ⋯-Menü eines Setups. */
export function SymbolCard({
  symbol,
  setupIds,
  marketIndexes,
  liveData,
  isGlobalRunning,
  symbolDetails,
  validateSymbol,
  disableAddSetup,
  onAddSetup,
  onRenameSymbol,
  children,
}: SymbolCardProps) {
  const t = useT();
  const fmt = useFormat();
  const bodyId = useId();
  const key = symbol.toUpperCase();
  // Server-Render ohne Speicher: Karte offen; der Client liest danach localStorage (kein Hydration-Fehler)
  const collapsedRaw = useSyncExternalStore(subscribeCollapsed, readCollapsedRaw, () => null);
  const collapsed = parseCollapsed(collapsedRaw).includes(key);
  const toggle = () => writeCollapsed(key, !collapsed);

  // Symbol-Log-Panel: ein Zustand je Symbolkarte, alle Setup-Menüs öffnen dasselbe Panel (LOG-07)
  const [logsOpenFor, setLogsOpenFor] = useState<string | null>(null);
  const logsCtx: SymbolLogsContextValue = {
    symbol,
    setupIds,
    // Eingeklappte Karte: Panel zu (sonst läuft die Abfrage unsichtbar weiter)
    openFor: collapsed ? null : logsOpenFor,
    show: setLogsOpenFor,
    close: () => setLogsOpenFor(null),
  };
  const onHeaderClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!isControl(e.target, e.currentTarget)) toggle();
  };

  const symbolPositions = (liveData.positions ?? []).filter((p) => p.symbol.toUpperCase() === key);
  // Auf Cent runden, damit Rundungsreste (5e-17) nicht grün als „+$0,00“ erscheinen
  const pnl = liveData.positions
    ? Math.round(symbolPositions.reduce((sum, p) => sum + (p.profit ?? 0), 0) * 100) / 100
    : undefined;
  const states = marketIndexes.map((i) => liveData.zone_states?.[String(i)]);
  const status = statusOf(isGlobalRunning, liveData.remote_paused, states);

  const price = liveData.symbol_prices?.[symbol.toUpperCase()];
  const marketIndex = marketIndexes.find((i) => liveData.zone_market_open?.[String(i)] !== undefined);
  const marketOpen = marketIndex === undefined ? undefined : liveData.zone_market_open?.[String(marketIndex)];
  const marketHours = marketIndex === undefined ? undefined : liveData.zone_market_hours?.[String(marketIndex)];
  const marketHint = marketHours
    ? t(marketOpen ? 'zone.market.hint.open' : 'zone.market.hint.closed', { hours: marketHours.replace(/-/g, '–') })
    : t('zone.market.hint');

  return (
    <section data-testid="symbol-card" className="rounded-xl border border-border bg-muted/40 shadow-[var(--shadow-symbol)]">
      {/* Tek satır: ok · "Sembol" + input · n setup · fiyat · durum · boşluk · Setup Ekle. Dar ekranda satır kırılır; boş alana tıklamak kartı açar/kapatır */}
      <div
        data-testid="symbol-card-header"
        onClick={onHeaderClick}
        className={cn(
          'flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 px-2.5 pt-3 sm:px-4 sm:pt-4',
          collapsed ? 'pb-3 sm:pb-4' : 'pb-2 sm:pb-3',
        )}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          aria-label={t(collapsed ? 'zone.symbol.expand' : 'zone.symbol.collapse', { symbol: key })}
          hint={t('zone.symbol.toggle.hint')}
          data-testid="symbol-card-toggle"
        >
          <ChevronDown size={16} aria-hidden className={cn('transition-transform', collapsed && '-rotate-90')} />
        </Button>
        <SymbolField
          key={symbol}
          symbol={symbol}
          symbolDetails={symbolDetails}
          validateSymbol={validateSymbol}
          onRenameSymbol={onRenameSymbol}
        />
        <Badge tone="neutral" hint={t('zone.symbol.setupCount.hint')} data-testid="setup-count">
          {t('zone.symbol.setupCount', { count: setupIds.length })}
        </Badge>
        <Tooltip content={t('zone.header.price.hint')}>
          <p className="font-mono text-xs text-muted-foreground" tabIndex={0}>
            {t('zone.header.price')}:{' '}
            <span data-testid="zone-price" className="tabular-nums text-foreground">
              {typeof price === 'number' && price > 0 ? fmt.price(price, getSymbolConfig(symbol, symbolDetails).precision) : '--'}
            </span>
          </p>
        </Tooltip>
        {isGlobalRunning && marketOpen !== undefined && (
          <Badge tone={marketOpen ? 'success' : 'danger'} hint={marketHint} data-testid="zone-market">
            {marketOpen ? t('zone.market.open') : t('zone.market.closed')}
          </Badge>
        )}
        <Badge tone={STATUS_TONE[status]} hint={t('zone.symbol.status.hint')} data-testid="symbol-status">
          {t(`zone.symbol.status.${status}`)}
        </Badge>
        {pnl !== undefined && (
          <Tooltip content={t('zone.symbol.pnl.hint')}>
            <p className="font-mono text-xs text-muted-foreground" tabIndex={0}>
              {t('zone.symbol.pnl')}:{' '}
              <span data-testid="symbol-pnl" className={cn('tabular-nums', pnlClass(pnl))}>
                {fmt.money(pnl, true)}
              </span>
            </p>
          </Tooltip>
        )}
        {/* Button sitzt in einem Tooltip-Wrapper: ml-auto muss am Flex-Kind (Wrapper) stehen */}
        <div className="ml-auto">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            // Neues Setup soll sichtbar sein: eingeklappte Karte öffnen
            if (collapsed) writeCollapsed(key, false);
            onAddSetup();
          }}
          disabled={disableAddSetup}
          hint={disableAddSetup ? t('zone.symbol.addSetup.off.hint') : t('zone.symbol.addSetup.hint')}
        >
          <Plus size={14} />
          {t('zone.symbol.addSetup')}
        </Button>
        </div>
      </div>
      <div id={bodyId} hidden={collapsed} className="space-y-2 px-1.5 pb-1.5 sm:space-y-3 sm:px-4 sm:pb-4">
        <SymbolLogsContext.Provider value={logsCtx}>{children}</SymbolLogsContext.Provider>
      </div>
    </section>
  );
}
