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

  // activeAccount (LIVE/DEMO, Bearbeiten) aus der neuen Liste ableiten: das Konto kann vor der Liste
  // gewählt worden sein (Analyse-Seite mit ?account=) oder sich geändert haben (Bearbeiten)
  setAccounts: (accounts) =>
    set((state) => ({
      accounts,
      activeAccount: state.selectedAccount
        ? (accounts.find((a) => String(a.id) === String(state.selectedAccount)) ?? null)
        : state.activeAccount,
    })),

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