'use client';

import { Combobox } from '@/components/ui/combobox';
import { InfoHint } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import type { Account, AccountDropdownProps } from '../types';

const getAccountKey = (acc: Account) => String(acc.id);
const getAccountLabel = (acc: Account) => `${acc.account_name} (${acc.id})`;
// Ad, ID ve login üzerinden arama
const filterAccount = (acc: Account, q: string) =>
  acc.account_name.toLowerCase().includes(q) ||
  String(acc.id).toLowerCase().includes(q) ||
  String(acc.login ?? '').includes(q);

export function AccountDropdown({
  accounts,
  selectedAccount,
  onSelect,
  disabled = false,
}: AccountDropdownProps) {
  const t = useT();
  return (
    <div data-tooltip-scope className="flex min-w-0 flex-1 items-center gap-1.5 sm:w-72 sm:flex-none">
      <div className="min-w-0 flex-1">
        <Combobox
          items={accounts}
          value={selectedAccount || null}
          onChange={onSelect}
          getKey={getAccountKey}
          getLabel={getAccountLabel}
          filter={filterAccount}
          renderItem={(acc) => (
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{getAccountLabel(acc)}</span>
              <span
                className={
                  acc.env_type === 'LIVE'
                    ? 'shrink-0 text-[11px] font-semibold text-danger'
                    : 'shrink-0 text-[11px] font-semibold text-info'
                }
              >
                {acc.env_type}
              </span>
            </div>
          )}
          placeholder={t('account.select.placeholder')}
          searchPlaceholder={t('account.select.search')}
          emptyMessage={t('account.select.empty')}
          disabled={disabled}
          className="font-medium"
          aria-label={t('account.select.aria')}
        />
      </div>
      <InfoHint hint={t('account.label.hint')} />
    </div>
  );
}
