'use client';

import { Wallet } from 'lucide-react';
import { EnvTypeBadge } from './EnvTypeBadge';
import type { AccountDropdownProps } from '../types';

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
        <select
          className="input-s font-medium"
          value={selectedAccount || ''}
          onChange={(e) => onSelect(e.target.value)}
          disabled={disabled}
          aria-label="Select Account"
        >
          <option value="" disabled>
            -- Select an account --
          </option>
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.account_name} ({acc.id})
            </option>
          ))}
        </select>
      </div>
      {activeAccount && (
        <div className="hidden self-end pb-2 md:block">
          <EnvTypeBadge envType={activeAccount.env_type as 'DEMO' | 'LIVE'} />
        </div>
      )}
    </div>
  );
}
