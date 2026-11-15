import { create } from 'zustand';
import { axiosInstance } from '@/lib/api';
import { DEFAULT_ALERTS, type NewsAlertSettings } from '@/lib/newsAlerts';
import { DEFAULT_FILTER, IMPACTS, dayRange, inSelectedDays, type NewsEvent, type NewsFilter } from '@/lib/news';

/**
 * Haber filtresi ve haber uyarısı kullanıcıya aittir (worker'da `user_prefs`, anahtarlar `news_filter` ve `news_alerts`, USR-11).
 * Eski hesap anahtarları (`ui_prefs`) burada okunmaz; bir kez `useUserPrefsStore.importFromAccount` ile taşınır.
 * Yazma `registerNewsPersister` ile `useUserPrefsStore`a bağlanır (import döngüsü olmasın diye).
 */
export type NewsPrefKey = 'news_filter' | 'news_alerts';
type Persister = (key: NewsPrefKey, value: Record<string, unknown>) => Promise<boolean>;
let persister: Persister | null = null;
export const registerNewsPersister = (fn: Persister) => {
  persister = fn;
};

function flashSaved(set: (partial: Partial<NewsState>) => void, kind: NewsSaved) {
  clearTimeout(savedTimer);
  set({ savedVisible: kind });
  savedTimer = setTimeout(() => set({ savedVisible: null }), 1800);
}

async function persistKey(key: NewsPrefKey, value: object, set: (partial: Partial<NewsState>) => void) {
  const ok = persister ? await persister(key, value as Record<string, unknown>) : false;
  flashSaved(set, ok ? 'worker' : 'local');
}

/** Rozet: worker'a yazıldı / yalnız bu tarayıcıda (worker hatası) */
export type NewsSaved = 'worker' | 'local' | null;

interface NewsState {
  accountId: string | null;
  filter: NewsFilter;
  /** Uyarı ayarı (NWS-03): kullanıcıya ait, worker'da `news_alerts` */
  alerts: NewsAlertSettings;
  /** Uyarı zamanlayıcısının son okuduğu yaklaşan haberler (gün filtresinden bağımsız); bildirime tıklanınca kartta gösterilir */
  alertEvents: NewsEvent[];
  /** Bildirimden gelen istek: kart açılsın, bu haber vurgulansın */
  focusRequest: { id: number | string; nonce: number } | null;
  events: NewsEvent[];
  available: boolean;
  stale: boolean;
  loaded: boolean;
  failed: boolean;
  /** "✓ Kaydedildi" rozeti (filtre kaydedilince 1,8 sn) */
  savedVisible: NewsSaved;
  loadFilter: (accountId: string | null) => void;
  setFilter: (filter: NewsFilter) => void;
  setAlerts: (alerts: NewsAlertSettings) => void;
  setAlertEvents: (events: NewsEvent[]) => void;
  requestFocus: (id: number | string) => void;
  clearFocus: () => void;
  fetchEvents: (args: { lang: string; currencies: string[] }) => Promise<void>;
}

let requestId = 0;
let savedTimer: ReturnType<typeof setTimeout> | undefined;

// Tek kaynak: haber filtresi ve son olay listesi. Filtre ve uyarı kullanıcıya ait (karar 1114-A2.2).
export const useNewsStore = create<NewsState>()((set, get) => ({
  accountId: null,
  filter: DEFAULT_FILTER,
  alerts: DEFAULT_ALERTS,
  alertEvents: [],
  focusRequest: null,
  events: [],
  available: true,
  stale: false,
  loaded: false,
  failed: false,
  savedVisible: null,
  // Hesap değişince yalnız hesaba bağlı veriler (haber listesi) sıfırlanır; filtre ve uyarı kullanıcıya ait olduğundan değişmez
  loadFilter: (accountId) => set({ accountId, alertEvents: [], events: [], loaded: false }),
  // Değeri `change()` uygular (iyimser) ve kayıt düşerse eski değere döndürür; kayıtlı yazıcı yoksa doğrudan yazılır
  setFilter: (filter) => {
    if (!persister) set({ filter });
    void persistKey('news_filter', filter, set);
  },
  setAlerts: (alerts) => {
    if (!persister) set({ alerts });
    void persistKey('news_alerts', alerts, set);
  },
  setAlertEvents: (alertEvents) => set({ alertEvents }),
  requestFocus: (id) => set({ focusRequest: { id, nonce: Date.now() } }),
  clearFocus: () => set({ focusRequest: null }),
  fetchEvents: async ({ lang, currencies }) => {
    const { filter } = get();
    const now = new Date();
    const range = dayRange(filter, now);
    if (!range || !filter.impacts.length || !currencies.length) {
      set({ events: [], loaded: true, failed: false });
      return;
    }
    const id = ++requestId;
    try {
      const res = await axiosInstance.get('/news/events', {
        params: {
          from: range.from.toISOString(),
          to: range.to.toISOString(),
          impact: IMPACTS.filter((i) => filter.impacts.includes(i)).join(','),
          currencies: currencies.join(','),
          lang,
        },
      });
      if (id !== requestId) return;
      const all: NewsEvent[] = res.data.events ?? [];
      set({
        events: all.filter((e) => inSelectedDays(filter, new Date(e.time), now)),
        available: res.data.available !== false,
        stale: res.data.stale === true,
        loaded: true,
        failed: false,
      });
    } catch {
      if (id === requestId) set({ failed: true, loaded: true });
    }
  },
}));
