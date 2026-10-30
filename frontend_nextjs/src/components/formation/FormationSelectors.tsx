'use client';

import { useState } from 'react';

import { AccountOption, filterAccount, getAccountKey } from '@/components/account/components';
import type { Account } from '@/components/account/types';
import SymbolAutoComplete from '@/components/SymbolAutoComplete';
import { Combobox } from '@/components/ui/combobox';
import { InfoHint, Tooltip } from '@/components/ui/tooltip';
import { useSymbolDetails } from '@/hooks/useSymbolDetails';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

// Das Eingabefeld-Aussehen von .input-s wird für die flachen Leisten-Knöpfe bewusst überschrieben.
const flatTrigger = 'h-[30px]! min-h-0! border-0! bg-transparent! px-2! text-xs! shadow-none! hover:bg-accent!';
const popup = 'min-w-60 [&_input]:text-xs [&_li]:text-xs';

/** Freie Produktsuche als Pille in der Kopfleiste: Name oder Beschreibung, unabhängig von den Setups des Kontos. */
export function FormationSymbolSelect({ accountId, value, onChange }: {
  accountId: string | null;
  value: string | null;
  onChange: (symbol: string) => void;
}) {
  const t = useT();
  const details = useSymbolDetails(accountId);
  // SymbolAutoComplete hält den Text selbst: ein neuer Key stellt nach abgebrochener Eingabe das Produkt wieder her
  const [revision, setRevision] = useState(0);

  const commit = (text: string) => {
    const found = details[text.toUpperCase()];
    // Setup-Symbole sind großgeschrieben, die Liste nennt den Brokernamen (EURUSDm): gleiches Produkt, keine neue Suche
    const isNewProduct = found && found.name.toUpperCase() !== value?.toUpperCase();
    if (isNewProduct) onChange(found.name);
    else setRevision((n) => n + 1);
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 lg:w-44 lg:flex-none">
      {/* Der Hinweis sitzt am (i): ein Tooltip am Eingabefeld läge beim Tippen über der Liste */}
      <div
        className="min-w-0 flex-1 [&_[data-slot=autocomplete-content]]:right-auto [&_[data-slot=autocomplete-content]]:min-w-60 [&_li]:text-xs"
        data-tooltip-exempt
        data-testid="formation-symbol"
        // Tippen ersetzt das Produkt, statt an den alten Namen anzuhängen
        onFocus={(e) => e.target instanceof HTMLInputElement && e.target.select()}
      >
        <SymbolAutoComplete
          key={`${value}:${revision}`}
          value={value ?? ''}
          // Übernommen wird nur ein Name aus der Liste (commit), nicht jeder Tastendruck
          onChange={() => {}}
          onCommit={commit}
          symbolDetails={details}
          preserveCase
          className={cn(flatTrigger, 'rounded-full! bg-accent! px-3!')}
          aria-label={t('formation.symbol')}
        />
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
