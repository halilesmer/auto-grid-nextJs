'use client';

import { AccountOption, filterAccount, getAccountKey } from '@/components/account/components';
import type { Account } from '@/components/account/types';
import { useZoneOptions, zonePlaceholderKey } from '@/components/analysis/ZoneSelect';
import { Combobox } from '@/components/ui/combobox';
import { Tooltip } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import type { ZoneSettings } from '@/store/types';

// Das Eingabefeld-Aussehen von .input-s wird für die flachen Leisten-Knöpfe bewusst überschrieben.
const flatTrigger = 'h-[30px]! min-h-0! border-0! bg-transparent! px-2! text-xs! shadow-none! hover:bg-accent!';
const popup = 'min-w-60 [&_input]:text-xs [&_li]:text-xs';

/** Symbol und Setup als Pille in der Kopfleiste. */
export function FormationZoneSelect({ zones, value, onChange }: {
  zones: ZoneSettings[] | null;
  value: string | null;
  onChange: (zoneId: string) => void;
}) {
  const t = useT();
  const { items, label } = useZoneOptions(zones);
  return (
    <Tooltip content={t('analysis.zone.hint')} className="min-w-0 flex-1 lg:w-44 lg:flex-none">
      <div className="min-w-0 w-full" data-testid="zone-select">
        <Combobox
          items={items}
          value={value}
          onChange={onChange}
          getKey={(item) => item.zone.id}
          getLabel={label}
          filter={(item, q) => label(item).toLowerCase().includes(q)}
          placeholder={t(zonePlaceholderKey(zones))}
          searchPlaceholder={t('analysis.zone.search')}
          emptyMessage={t('analysis.zone.empty')}
          disabled={zones === null || zones.length === 0}
          className={cn(flatTrigger, 'rounded-full! bg-accent! px-3! font-semibold')}
          popupClassName={popup}
          aria-label={t('analysis.zone')}
        />
      </div>
    </Tooltip>
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
