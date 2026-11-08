import { create } from 'zustand';
import { axiosInstance } from '@/lib/api';
import { DEFAULT_ALERTS, normalizeAlerts, type NewsAlertSettings } from '@/lib/newsAlerts';
import { DEFAULT_FILTER, IMPACTS, dayRange, inSelectedDays, normalizeFilter, type NewsEvent, type NewsFilter } from '@/lib/news';

export const NEWS_FILTER_KEY = 'grid-robot-news-filter';
export const NEWS_ALERTS_KEY = 'grid-robot-news-alerts';
const keyOf = (accountId: string | null) => `${NEWS_FILTER_KEY}:${accountId ?? 'none'}`;

function writeLocal(accountId: string | null, filter: NewsFilter) {
  try {
    localStorage.setItem(keyOf(accountId), JSON.stringify(filter));
  } catch {
    /* localStorage yok: filtre yalnız bu oturumda kalır */
  }
}

const alertsKeyOf = (accountId: string | null) => `${NEWS_ALERTS_KEY}:${accountId ?? 'none'}`;

function writeLocalAlerts(accountId: string | null, alerts: NewsAlertSettings) {
  try {
    localStorage.setItem(alertsKeyOf(accountId), JSON.stringify(alerts));
  } catch {
    /* localStorage yok: ayar yalnız bu oturumda kalır */
  }
}

function readAlerts(accountId: string | null): NewsAlertSettings {
  try {
    const raw = localStorage.getItem(alertsKeyOf(accountId));
    return raw ? normalizeAlerts(JSON.parse(raw)) : DEFAULT_ALERTS;
  } catch {
    return DEFAULT_ALERTS;
  }
}

function flashSaved(set: (partial: Partial<NewsState>) => void, kind: NewsSaved) {
  clearTimeout(savedTimer);
  set({ savedVisible: kind });
  savedTimer = setTimeout(() => set({ savedVisible: null }), 1800);
}

function readFilter(accountId: string | null): NewsFilter {
  try {
    const raw = localStorage.getItem(keyOf(accountId));
    return raw ? normalizeFilter(JSON.parse(raw)) : DEFAULT_FILTER;
  } catch {
    return DEFAULT_FILTER;
  }
}

/** Rozet: worker'a yazıldı / yalnız bu tarayıcıda (hesap yok ya da worker hatası) */
export type NewsSaved = 'worker' | 'local' | null;
const PREF_KEY = 'news_filter';
const ALERTS_PREF_KEY = 'news_alerts';
const SAVE_DELAY_MS = 400;

interface NewsState {
  accountId: string | null;
  filter: NewsFilter;
  /** Uyarı ayarı (NWS-03): hesap başına worker'da `news_alerts`, tarayıcıda yedek */
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
let pushTimer: ReturnType<typeof setTimeout> | undefined;
/** Kullanıcı filtreyi her değiştirdiğinde artar; gecikmiş GET yanıtı yeni seçimi ezmesin */
let editCount = 0;
let alertEditCount = 0;
let alertPushTimer: ReturnType<typeof setTimeout> | undefined;

// Tek kaynak: haber filtresi ve son olay listesi. Filtre hesap başına worker'da saklanır (/api/ui-prefs,
// karar 1107-A16.8); tarayıcıda yedek kopya durur.
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
  loadFilter: (accountId) => {
    // Önce tarayıcıdaki kopya (anında), sonra worker'daki (cihazlar arası) değer
    clearTimeout(pushTimer);
    clearTimeout(alertPushTimer);
    const editsAtStart = ++editCount;
    const alertEditsAtStart = ++alertEditCount;
    set({ accountId, filter: readFilter(accountId), alerts: readAlerts(accountId), alertEvents: [], events: [], loaded: false });
    if (!accountId) return;
    axiosInstance
      .get(`/ui-prefs/${encodeURIComponent(accountId)}`)
      .then((res) => {
        if (get().accountId !== accountId) return;
        const stored = res.data?.prefs?.[PREF_KEY];
        // Kullanıcı bu arada filtreyi değiştirdi: eski yanıtı uygulama
        if (stored && editCount === editsAtStart) {
          const filter = normalizeFilter(stored);
          writeLocal(accountId, filter);
          if (JSON.stringify(filter) !== JSON.stringify(get().filter)) set({ filter });
        }
        const storedAlerts = res.data?.prefs?.[ALERTS_PREF_KEY];
        if (storedAlerts && alertEditCount === alertEditsAtStart) {
          const alerts = normalizeAlerts(storedAlerts);
          writeLocalAlerts(accountId, alerts);
          if (JSON.stringify(alerts) !== JSON.stringify(get().alerts)) set({ alerts });
        }
      })
      .catch(() => {
        /* worker yok ya da hata: tarayıcıdaki kopya geçerli */
      });
  },
  setFilter: (filter) => {
    const accountId = get().accountId;
    editCount++;
    writeLocal(accountId, filter);
    set({ filter });
    clearTimeout(pushTimer);
    if (!accountId) {
      flashSaved(set, 'local');
      return;
    }
    pushTimer = setTimeout(() => {
      axiosInstance
        .put(`/ui-prefs/${encodeURIComponent(accountId)}/${PREF_KEY}`, { value: filter })
        .then(() => flashSaved(set, 'worker'))
        .catch(() => flashSaved(set, 'local'));
    }, SAVE_DELAY_MS);
  },
  setAlerts: (alerts) => {
    const accountId = get().accountId;
    alertEditCount++;
    writeLocalAlerts(accountId, alerts);
    set({ alerts });
    clearTimeout(alertPushTimer);
    if (!accountId) {
      flashSaved(set, 'local');
      return;
    }
    alertPushTimer = setTimeout(() => {
      axiosInstance
        .put(`/ui-prefs/${encodeURIComponent(accountId)}/${ALERTS_PREF_KEY}`, { value: alerts })
        .then(() => flashSaved(set, 'worker'))
        .catch(() => flashSaved(set, 'local'));
    }, SAVE_DELAY_MS);
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
