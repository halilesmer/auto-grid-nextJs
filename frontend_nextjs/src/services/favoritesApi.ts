import { axiosInstance } from '@/lib/api';

/** GET/PUT /favorites/{id}: Favoriten-Produkte des Kontos (worker_python/src/api/favorites.py). */
export const favoritesApi = {
  async get(accountId: string): Promise<string[]> {
    const res = await axiosInstance.get<{ symbols: string[] }>(`/favorites/${encodeURIComponent(accountId)}`);
    return res.data.symbols;
  },
  async put(accountId: string, symbols: string[]): Promise<string[]> {
    const res = await axiosInstance.put<{ symbols: string[] }>(`/favorites/${encodeURIComponent(accountId)}`, { symbols });
    return res.data.symbols;
  },
};
