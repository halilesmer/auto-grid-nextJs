import { create } from 'zustand';
import { axiosInstance } from '@/lib/api';
import { DEFAULT_FILTER, IMPACTS, dayRange, inSelectedDays, normalizeFilter, type NewsEvent, type NewsFilter } from '@/lib/news';

export const NEWS_FILTER_KEY = 'grid-robot-news-filter';
const keyOf = (accountId: string | null) => `${NEWS_FILTER_KEY}:${accountId ?? 'none'}`;

function writeLocal(accountId: string | null, filter: NewsFilter) {
  try {
    localStorage.setItem(keyOf(accountId), JSON.stringify(filter));
  } catch {
    /* localStorage yok: filtre yalnız bu oturumda kalır */
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
const SAVE_DELAY_MS = 400;

interface NewsState {
  accountId: string | null;
  filter: NewsFilter;
  events: NewsEvent[];
  available: boolean;
  stale: boolean;
  loaded: boolean;
  failed: boolean;
  /** "✓ Kaydedildi" rozeti (filtre kaydedilince 1,8 sn) */
  savedVisible: NewsSaved;
  loadFilter: (accountId: string | null) => void;
  setFilter: (filter: NewsFilter) => void;
  fetchEvents: (args: { lang: string; currencies: string[] }) => Promise<void>;
}

let requestId = 0;
let savedTimer: ReturnType<typeof setTimeout> | undefined;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
/** Kullanıcı filtreyi her değiştirdiğinde artar; gecikmiş GET yanıtı yeni seçimi ezmesin */
let editCount = 0;

// Tek kaynak: haber filtresi ve son olay listesi. Filtre hesap başına worker'da saklanır (/api/ui-prefs,
// karar 1107-A16.8); tarayıcıda yedek kopya durur.
export const useNewsStore = create<NewsState>()((set, get) => ({
  accountId: null,
  filter: DEFAULT_FILTER,
  events: [],
  available: true,
  stale: false,
  loaded: false,
  failed: false,
  savedVisible: null,
  loadFilter: (accountId) => {
    // Önce tarayıcıdaki kopya (anında), sonra worker'daki (cihazlar arası) değer
    clearTimeout(pushTimer);
    const editsAtStart = ++editCount;
    set({ accountId, filter: readFilter(accountId), events: [], loaded: false });
    if (!accountId) return;
    axiosInstance
      .get(`/ui-prefs/${encodeURIComponent(accountId)}`)
      .then((res) => {
        const stored = res.data?.prefs?.[PREF_KEY];
        // Hesap değişti ya da kullanıcı bu arada filtreyi değiştirdi: eski yanıtı uygulama
        if (!stored || get().accountId !== accountId || editCount !== editsAtStart) return;
        const filter = normalizeFilter(stored);
        writeLocal(accountId, filter);
        set({ filter });
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
