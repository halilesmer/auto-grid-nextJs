'use client';

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
    <div className="flex items-center space-x-4">
      <h2 className="text-xl font-bold text-white tracking-wide whitespace-nowrap">
        Select Account
      </h2>
      <select
        className="bg-black/40 text-white border border-white/20 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
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
      {activeAccount && <EnvTypeBadge envType={activeAccount.env_type as 'DEMO' | 'LIVE'} />}
    </div>
  );
}