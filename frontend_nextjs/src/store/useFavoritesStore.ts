import { create } from 'zustand';

interface FavoritesState {
  /** Favoriten-Produkte (Brokernamen) von `loadedAccount`. */
  symbols: string[];
  /** Konto, für das `symbols` geladen wurde (useFavorites); null = keins/unklar. */
  loadedAccount: string | null;
  setFavorites: (accountId: string | null, symbols: string[]) => void;
}

export const useFavoritesStore = create<FavoritesState>((set) => ({
  symbols: [],
  loadedAccount: null,
  setFavorites: (accountId, symbols) => set({ loadedAccount: accountId, symbols }),
}));
