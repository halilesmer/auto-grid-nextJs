'use client';

import { useState, type ReactNode } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import SymbolAutoComplete from '@/components/SymbolAutoComplete';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InputField } from '@/components/ui/InputField';
import { Tooltip } from '@/components/ui/tooltip';
import { useFormat, useT } from '@/i18n';
import { useSettingsStore } from '@/store';
import type { LiveData, SymbolDetail } from '@/store/types';
import { getSymbolConfig } from '@/utils/zoneHelpers';

interface SymbolCardProps {
  symbol: string;
  setupCount: number;
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
    <InputField label={symbolLabel} hint={t('zone.field.symbol.hint')} error={fieldError}>
      <SymbolAutoComplete
        value={symbol}
        onChange={setDraft}
        onCommit={commit}
        symbolDetails={symbolDetails}
        hasError={hasError}
      />
    </InputField>
  );
}

/** Symbol mit seinen Setups (ZON-20): Kopf mit Symbol, Zahl der Setups, Preis und Markt; darunter die Setups. */
export function SymbolCard({
  symbol,
  setupCount,
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

  const price = liveData.symbol_prices?.[symbol.toUpperCase()];
  const marketIndex = marketIndexes.find((i) => liveData.zone_market_open?.[String(i)] !== undefined);
  const marketOpen = marketIndex === undefined ? undefined : liveData.zone_market_open?.[String(marketIndex)];
  const marketHours = marketIndex === undefined ? undefined : liveData.zone_market_hours?.[String(marketIndex)];
  const marketHint = marketHours
    ? t(marketOpen ? 'zone.market.hint.open' : 'zone.market.hint.closed', { hours: marketHours.replace(/-/g, '–') })
    : t('zone.market.hint');

  return (
    <section data-testid="symbol-card" className="rounded-xl border border-border bg-muted/40">
      {/* Dar ekranda (375 px) buton alt satıra iner */}
      <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-3 pt-4">
        <div className="flex min-w-0 flex-wrap items-end gap-x-4 gap-y-2">
          <div className="w-full sm:w-56">
            <SymbolField
              key={symbol}
              symbol={symbol}
              symbolDetails={symbolDetails}
              validateSymbol={validateSymbol}
              onRenameSymbol={onRenameSymbol}
            />
          </div>
          <div className="flex min-h-9 flex-wrap items-center gap-2">
            <Badge tone="neutral" hint={t('zone.symbol.setupCount.hint')} data-testid="setup-count">
              {t('zone.symbol.setupCount', { count: setupCount })}
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
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={onAddSetup}
          disabled={disableAddSetup}
          hint={disableAddSetup ? t('zone.symbol.addSetup.off.hint') : t('zone.symbol.addSetup.hint')}
        >
          <Plus size={14} />
          {t('zone.symbol.addSetup')}
        </Button>
      </div>
      <div className="space-y-3 px-3 pb-3 sm:px-4 sm:pb-4">{children}</div>
    </section>
  );
}
