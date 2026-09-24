'use client';

import { Wallet } from 'lucide-react';
import { Combobox } from '@/components/ui/combobox';
import { EnvTypeBadge } from './EnvTypeBadge';
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
  activeAccount,
  onSelect,
  disabled = false,
}: AccountDropdownProps) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <div className="hidden size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground sm:flex">
        <Wallet size={16} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-sm">
        <span className="text-xs font-medium text-muted-foreground">
          MT5 Account
        </span>
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
          placeholder="-- Select an account --"
          searchPlaceholder="Search account…"
          emptyMessage="No account found"
          disabled={disabled}
          className="font-medium"
          aria-label="Select Account"
        />
      </div>
      {activeAccount && (
        <div className="hidden self-end pb-2 md:block">
          <EnvTypeBadge envType={activeAccount.env_type as 'DEMO' | 'LIVE'} />
        </div>
      )}
    </div>
  );
}
