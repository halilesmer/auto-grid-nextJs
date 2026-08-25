import { create } from 'zustand';

interface BotState {
  selectedAccount: string | null;
  accounts: any[];
  metrics: {
    price: number;
    profit: number;
    open_positions: number;
  };
  setAccounts: (accounts: any[]) => void;
  setSelectedAccount: (accountId: string) => void;
  updateMetrics: (data: any) => void;
}

export const useBotStore = create<BotState>((set) => ({
  selectedAccount: null,
  accounts: [],
  metrics: { price: 0, profit: 0, open_positions: 0 },
  setAccounts: (accounts) => set({ accounts }),
  setSelectedAccount: (accountId) => set({ selectedAccount: accountId }),
  updateMetrics: (data) => set({ metrics: data }),
}));
