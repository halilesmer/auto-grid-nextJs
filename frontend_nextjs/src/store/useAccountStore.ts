import { create } from 'zustand';
import { Account } from './types';

interface AccountState {
  accounts: Account[];
  selectedAccount: string | null;
  activeAccount: Account | null;

  setAccounts: (accounts: Account[]) => void;
  setSelectedAccount: (accountId: string) => void;
  setActiveAccount: (account: Account | null) => void;
  resetAccount: () => void;
}

const initialState = {
  accounts: [],
  selectedAccount: null,
  activeAccount: null as Account | null,
};

export const useAccountStore = create<AccountState>((set) => ({
  ...initialState,

  setAccounts: (accounts) => set({ accounts }),

  setSelectedAccount: (accountId) => {
    set((state) => ({
      selectedAccount: accountId,
      activeAccount:
        state.accounts.find((a) => String(a.id) === String(accountId)) || null,
    }));
  },

  setActiveAccount: (account) => set({ activeAccount: account }),

  resetAccount: () => set(initialState),
}));