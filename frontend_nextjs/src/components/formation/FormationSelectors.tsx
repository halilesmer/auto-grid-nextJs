'use client';

import { useMemo, useState } from 'react';
import { Flag } from 'lucide-react';

import { AccountOption, filterAccount, getAccountKey } from '@/components/account/components';
import type { Account } from '@/components/account/types';
import { Combobox, ComboboxAutocomplete } from '@/components/ui/combobox';
import { InfoHint, Tooltip } from '@/components/ui/tooltip';
import { useFavorites } from '@/hooks/useFavorites';
import { useSymbolDetails } from '@/hooks/useSymbolDetails';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import type { SymbolDetail } from '@/store/types';

// Das Eingabefeld-Aussehen von .input-s wird für die flachen Leisten-Knöpfe bewusst überschrieben.
const flatTrigger = 'h-[30px]! min-h-0! border-0! bg-transparent! px-2! text-xs! shadow-none! hover:bg-accent!';
const popup = 'min-w-60 [&_input]:text-xs [&_li]:text-xs';

/** Fahne wie bei TradingView: Klick setzt oder entfernt den Favoriten, ohne das Produkt zu wählen oder die Liste zu schließen. */
export function FavoriteFlag({ symbol, active, onToggle }: { symbol: string; active: boolean; onToggle: () => void }) {
  const t = useT();
  return (
    <Tooltip content={t(active ? 'formation.favorite.remove.hint' : 'formation.favorite.add.hint')} className="shrink-0">
      <button
        type="button"
        aria-pressed={active}
        aria-label={t(active ? 'formation.favorite.remove' : 'formation.favorite.add', { symbol })}
        data-testid="favorite-flag"
        data-symbol={symbol}
        // mousedown: der Fokus bleibt im Suchfeld, und die Zeile (wählt auf mousedown) bekommt nichts mit
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Flag size={12} aria-hidden="true" className={cn(active && 'fill-primary text-primary')} />
      </button>
    </Tooltip>
  );
}

/** Eigene Suche statt SymbolAutoComplete (geteilt, ohne Platz für die Fahne): übernommen wird nur ein Listeneintrag, Abbruch stellt das Produkt wieder her. */
function SymbolSearch({ value, details, favorites, onChange, onRestore }: {
  value: string;
  details: Record<string, SymbolDetail>;
  favorites: ReturnType<typeof useFavorites>;
  onChange: (symbol: string) => void;
  onRestore: () => void;
}) {
  const t = useT();
  const [text, setText] = useState(value);
  const query = text.trim().toLowerCase();
  const items = useMemo(
    () =>
      query
        ? Object.values(details).filter((s) => s.name.toLowerCase().includes(query) || s.description?.toLowerCase().includes(query))
        : [],
    [details, query],
  );

  const commit = (candidate: string) => {
    const found = details[candidate.trim().toUpperCase()];
    // Setup-Symbole sind großgeschrieben, die Liste nennt den Brokernamen (EURUSDm): gleiches Produkt, keine neue Suche
    if (found && found.name.toUpperCase() !== value.toUpperCase()) onChange(found.name);
    else onRestore();
  };
  return (
    <>
      <ComboboxAutocomplete
        inputValue={text}
        onInputChange={setText}
        items={items}
        getKey={(s) => s.name}
        tabSelects={false}
        onSelect={(s) => {
          setText(s.name);
          commit(s.name);
        }}
        // Wer mit Tab zur Fahne wandert, hat die Eingabe nicht verlassen
        onBlur={(e) => {
          if (e.relatedTarget instanceof Node && e.currentTarget.closest('[data-slot=autocomplete]')?.contains(e.relatedTarget)) return;
          commit(text);
        }}
        renderItem={(s) => (
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-semibold text-foreground">{s.name}</span>
              <FavoriteFlag symbol={s.name} active={favorites.isFavorite(s.name)} onToggle={() => favorites.toggle(s.name)} />
            </div>
            {s.description && <span className="line-clamp-1 text-[10px] text-muted-foreground">{s.description}</span>}
          </div>
        )}
        showEmpty={query.length > 0 && Object.keys(details).length > 0}
        emptyMessage={t('zone.symbol.empty')}
        placeholder={t('zone.symbol.placeholder')}
        aria-label={t('formation.symbol')}
        className={cn(flatTrigger, 'rounded-full! bg-accent! pl-3! pr-7! font-mono font-semibold placeholder:font-sans placeholder:font-normal')}
      />
    </>
  );
}

/** Freie Produktsuche als Pille in der Kopfleiste: Name oder Beschreibung, unabhängig von den Setups des Kontos; mit Favoriten-Fahne. */
export function FormationSymbolSelect({ accountId, value, onChange }: {
  accountId: string | null;
  value: string | null;
  onChange: (symbol: string) => void;
}) {
  const t = useT();
  const details = useSymbolDetails(accountId);
  const favorites = useFavorites(accountId);
  // Ein neuer Key stellt nach abgebrochener Eingabe das Produkt wieder her
  const [revision, setRevision] = useState(0);
  const current = details[(value ?? '').toUpperCase()]?.name ?? value ?? '';

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 lg:w-48 lg:flex-none">
      {/* Der Hinweis sitzt am (i): ein Tooltip am Eingabefeld läge beim Tippen über der Liste */}
      <div
        className="relative min-w-0 flex-1 [&_[data-slot=autocomplete-content]]:right-auto [&_[data-slot=autocomplete-content]]:min-w-60"
        data-tooltip-exempt
        data-testid="formation-symbol"
        // Tippen ersetzt das Produkt, statt an den alten Namen anzuhängen
        onFocus={(e) => e.target instanceof HTMLInputElement && e.target.select()}
        // Tab aus einer Fahne der Liste heraus: die Liste schließt und das bisherige Produkt steht wieder da (wie beim Abbrechen)
        onBlur={(e) => {
          const search = e.currentTarget.querySelector('[data-slot=autocomplete]');
          const leftSearch = search?.contains(e.target as Node) && !(e.relatedTarget instanceof Node && search.contains(e.relatedTarget));
          if (leftSearch) setRevision((n) => n + 1);
        }}
      >
        <SymbolSearch
          key={`${value}:${revision}`}
          value={value ?? ''}
          details={details}
          favorites={favorites}
          onChange={onChange}
          onRestore={() => setRevision((n) => n + 1)}
        />
        {value && details[value.toUpperCase()] && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <FavoriteFlag symbol={current} active={favorites.isFavorite(current)} onToggle={() => favorites.toggle(current)} />
          </span>
        )}
      </div>
      <InfoHint hint={t('formation.symbol.hint')} />
    </div>
  );
}

/** Konto als flacher Knopf; LIVE/DEMO steht immer sichtbar daneben. */
export function FormationAccountSelect({ accounts, value, onChange }: {
  accounts: Account[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const t = useT();
  const env = accounts.find((account) => String(account.id) === value)?.env_type;
  return (
    <Tooltip content={t('account.label.hint')} className="min-w-0 flex-1 lg:w-52 lg:flex-none">
      <div className="flex w-full min-w-0 items-center gap-1">
        <div className="min-w-0 flex-1">
          <Combobox
            items={accounts}
            value={value}
            onChange={onChange}
            getKey={getAccountKey}
            getLabel={(account) => account.account_name}
            filter={filterAccount}
            renderItem={(account) => <AccountOption account={account} />}
            placeholder={t('account.select.placeholder')}
            searchPlaceholder={t('account.select.search')}
            emptyMessage={t('account.select.empty')}
            className={flatTrigger}
            popupClassName={popup}
            aria-label={t('account.select.aria')}
          />
        </div>
        {env && (
          <span className={cn('shrink-0 rounded px-1 text-[10px] font-semibold leading-[14px]', env === 'LIVE' ? 'bg-danger/15 text-danger' : 'bg-info/15 text-info')} data-testid="formation-account-env">
            {env}
          </span>
        )}
      </div>
    </Tooltip>
  );
}
