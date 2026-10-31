'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Loader2, Plus } from 'lucide-react';
import { FavoriteFlag } from '@/components/formation/FormationSelectors';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { useFavoriteQuotes } from '@/hooks/useFavoriteQuotes';
import { useFormat, useT, type MessageKey } from '@/i18n';
import { cn } from '@/lib/utils';
import type { Quote } from '@/services/marketApi';
import { useFavoritesScanStore } from '@/store/useFavoritesScanStore';
import { useSettingsStore } from '@/store/useSettingsStore';

function Change({ quote }: { quote: Quote | null | undefined }) {
  const format = useFormat();
  if (!quote || !quote.prev_close) return <span className="text-muted-foreground">—</span>;
  const diff = quote.last - quote.prev_close;
  const percent = (diff / quote.prev_close) * 100;
  const tone = { '1': 'text-success', '-1': 'text-danger', '0': 'text-muted-foreground' }[String(Math.sign(diff))];
  return (
    <span className={cn('flex flex-col items-end tabular-nums', tone)}>
      <span>{format.number(percent, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' })}%</span>
      <span className="text-[10px] opacity-80">{format.number(diff, { minimumFractionDigits: quote.digits, maximumFractionDigits: quote.digits, signDisplay: 'exceptZero' })}</span>
    </span>
  );
}

/**
 * Favoriten-Seitenleiste (FRM-29): Kopf, Zeitraum-Zeile, Formations-Zeile, Tabelle. Zeitraum- und Formations-Zeile kommen als Inhalt
 * von der Seite, damit sie sich mit der Kopfleiste über dem Chart nie doppeln. Die Preise werden nur abgefragt, solange die Leiste offen ist.
 */
export function FavoritesSidebar({ accountId, favorites, rows, activeSymbol, timeframes, forms, onPick, onToggle, onAdd }: {
  accountId: string;
  /** Alle Favoriten (für Preise und Hinweise), `rows` = die Tabelle nach Filter */
  favorites: readonly string[];
  rows: readonly string[];
  activeSymbol: string | null;
  timeframes: ReactNode;
  forms: ReactNode;
  onPick: (symbol: string) => void;
  onToggle: (symbol: string) => void;
  onAdd: () => void;
}) {
  const t = useT();
  const format = useFormat();
  const details = useSettingsStore((s) => s.symbolDetails);
  const gaps = useFavoritesScanStore((s) => s.gaps);
  const progress = useFavoritesScanStore((s) => s.progress);
  const { quotes, failed } = useFavoriteQuotes(accountId, favorites);
  const gapCount = favorites.filter((s) => gaps[s]).length;

  return (
    <aside className="flex h-full min-h-0 flex-col" data-testid="favorites-sidebar" aria-label={t('formation.fav.title')}>
      <div className="flex h-[38px] shrink-0 items-center justify-between border-b border-border pl-3 pr-1.5">
        <strong className="text-xs">{t('formation.fav.title')}</strong>
        <Button size="icon-sm" variant="ghost" hint={t('formation.fav.add.hint')} aria-label={t('formation.fav.add')} data-testid="favorites-add" onClick={onAdd}>
          <Plus size={15} />
        </Button>
      </div>
      {favorites.length === 0 ? (
        <p className="p-3 text-xs text-muted-foreground" data-testid="favorites-empty">{t('formation.fav.empty')}</p>
      ) : (
        <>
          <div className="shrink-0 px-2 pb-1 pt-2">{timeframes}</div>
          <div className="shrink-0 border-b border-border">{forms}</div>
          {(progress || gapCount > 0 || failed) && (
            <div className="shrink-0 space-y-0.5 px-3 py-1 text-[10px] text-muted-foreground">
              {progress && (
                <p className="flex items-center gap-1" role="status" data-testid="favorites-progress">
                  <Loader2 size={11} className="animate-spin" /> {t('formation.fav.progress', progress)}
                </p>
              )}
              {gapCount > 0 && <p data-testid="favorites-gaps">{t('formation.fav.gaps', { count: gapCount })}</p>}
              {failed && <p data-testid="favorites-quotes-failed">{t('formation.fav.quotes.failed')}</p>}
            </div>
          )}
          <div className="grid shrink-0 grid-cols-[1rem_1fr_auto_4.5rem] gap-x-2 px-3 py-1 text-[10px] text-muted-foreground">
            <span />
            <span>{t('formation.fav.col.symbol')}</span>
            <span className="text-right">{t('formation.fav.col.last')}</span>
            <span className="text-right">{t('formation.fav.col.change')}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2" data-testid="favorites-table">
            {rows.map((symbol) => {
              const quote = quotes[symbol];
              const gap = gaps[symbol];
              const active = activeSymbol !== null && activeSymbol.toUpperCase() === symbol.toUpperCase();
              return (
                <div key={symbol} className={cn('grid min-h-9 grid-cols-[1rem_1fr] items-center gap-x-2 px-3', active && 'bg-accent')} data-testid="favorites-row" data-symbol={symbol} data-active={active}>
                  <FavoriteFlag symbol={symbol} active onToggle={() => onToggle(symbol)} />
                  <Tooltip content={gap ? `${t('formation.fav.row.hint', { symbol })} ${t(`formation.fav.gap.${gap}.hint` as MessageKey)}` : t('formation.fav.row.hint', { symbol })} role="presentation" className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onPick(symbol)}
                      aria-current={active ? 'true' : undefined}
                      className="grid w-full cursor-pointer grid-cols-[1fr_auto_4.5rem] items-center gap-x-2 py-1 text-left text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 text-xs font-semibold">
                          <span className="truncate font-mono">{symbol}</span>
                          {gap && (
                            <span role="img" aria-label={t('formation.fav.gap')} data-testid="favorites-row-gap" data-gap={gap}>
                              <AlertTriangle size={11} className="text-warning" />
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[10px] text-muted-foreground">{details[symbol.toUpperCase()]?.description ?? ''}</span>
                      </span>
                      <span className="text-right tabular-nums">{quote ? format.price(quote.last, quote.digits) : '—'}</span>
                      <span className="text-right"><Change quote={quote} /></span>
                    </button>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}
