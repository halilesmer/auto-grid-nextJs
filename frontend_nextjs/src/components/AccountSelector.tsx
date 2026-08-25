'use client';
import { useEffect } from 'react';
import axios from 'axios';
import { useBotStore } from '@/store/useBotStore';

export default function AccountSelector() {
  const { accounts, setAccounts, selectedAccount, setSelectedAccount } = useBotStore();

  useEffect(() => {
    axios.get('http://localhost:8000/api/accounts')
      .then(res => setAccounts(res.data.accounts))
      .catch(err => console.error('Failed to fetch accounts', err));
  }, [setAccounts]);

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-xl shadow-xl flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <h2 className="text-xl font-bold text-white tracking-wide">Select Account</h2>
        <select
          className="bg-black/40 text-white border border-white/20 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          value={selectedAccount || ''}
          onChange={(e) => setSelectedAccount(e.target.value)}
        >
          <option value="" disabled>-- Select an account --</option>
          {accounts.map(acc => (
            <option key={acc.id} value={acc.id}>{acc.account_name} ({acc.id})</option>
          ))}
        </select>
      </div>
    </div>
  );
}
