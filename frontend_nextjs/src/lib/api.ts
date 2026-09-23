import axios from 'axios';

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'https://tweet-overlying-monotone.ngrok-free.dev';

export const API = API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`;

/**
 * Worker'daki `WORKER_API_KEY` ile aynı değer. Boşsa başlık gönderilmez
 * (worker'da anahtar ayarlı değilse eskisi gibi çalışır).
 */
export const WORKER_API_KEY = process.env.NEXT_PUBLIC_WORKER_API_KEY || '';

/** Worker'a giden her istekte gönderilecek başlıklar (axios dışı `fetch` çağrıları için de). */
export const WORKER_HEADERS: Record<string, string> = {
  'ngrok-skip-browser-warning': 'true',
  ...(WORKER_API_KEY ? { 'X-API-Key': WORKER_API_KEY } : {}),
};

export const axiosInstance = axios.create({
  baseURL: API,
  headers: { ...WORKER_HEADERS },
});
