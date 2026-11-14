import { create } from 'zustand';
import axios from 'axios';
import { axiosInstance, NotConnectedError } from '@/lib/api';
import { toast } from '@/components/ui/animated-toast';
import { t } from '@/i18n';
import { isLocale, LOCALE_NAMES, type Locale } from '@/i18n/config';
import { parseDelay, parseHold } from '@/lib/userPrefs';
import { isThemePreference, type ThemePreference } from '@/lib/theme';
import { useLocaleStore } from './useLocaleStore';
import { useThemeStore } from './useThemeStore';
import { useTooltipPrefsStore } from './useTooltipPrefsStore';

/**
 * Kişisel tercihler (USR-09): kullanıcıya aittir ve worker'da (VPS) kimliğiyle saklanır (`/api/me/prefs`).
 * localStorage yalnız önbellektir (açılışta dil/tema/ipucu parlamasın); asıl kaynak worker'dır.
 * Her değişiklik anında kaydedilir: iyimser güncelleme, anahtar başına durum, hatada eski değere dönüş.
 */
export type PrefKey = 'locale' | 'theme' | 'tooltip_delay' | 'tooltip_hold';
export type PrefStatus = 'saving' | 'saved' | 'failed';
/** Toast metni için: ayarın adı ve yeni değerin okunur hâli. */
export interface PrefLabel {
  name: string;
  value: string;
}

const SAVED_VISIBLE_MS = 4_000;
const FAILED_VISIBLE_MS = 6_500;
const SAVED_TOAST_MS = 3_200;

interface UserPrefsState {
  status: Partial<Record<PrefKey, PrefStatus>>;
  load: () => Promise<void>;
  /** Değeri iyimser uygular, worker'a yazar; hatada eski değere döner. `label` (değişiklikten sonra çağrılır, yeni dilde okunur) toast metnine girer ("Tema: Koyu"). */
  change: (key: PrefKey, value: Record<string, unknown>, label: () => PrefLabel) => Promise<void>;
}

// Anahtar başına: son değişiklik sırası (eski bir yanıt yeni değeri ezmesin) ve durum zamanlayıcısı
const versions: Partial<Record<PrefKey, number>> = {};
const timers: Partial<Record<PrefKey, ReturnType<typeof setTimeout>>> = {};
// Worker'ın bildiği son değer: hatada buna dönülür (art arda iki değişiklik düşerse ikincinin "önceki"si kaydedilmemiş olurdu)
const confirmed: Partial<Record<PrefKey, Record<string, unknown>>> = {};
// Aynı anahtara yazmalar sırayla gider; aksi hâlde worker'da eski değer kalabilir
const queues: Partial<Record<PrefKey, Promise<unknown>>> = {};
const PUT_TIMEOUT_MS = 15_000;

/** Bağlantı yok ya da worker bu uca sahip değil (eski sürüm): hata değil, değer yalnız bu tarayıcıda kalır. */
function isLocalOnly(err: unknown): boolean {
  return err instanceof NotConnectedError || (axios.isAxiosError(err) && err.response?.status === 404);
}

function current(key: PrefKey): Record<string, unknown> {
  switch (key) {
    case 'locale':
      return { locale: useLocaleStore.getState().locale };
    case 'theme':
      return { theme: useThemeStore.getState().theme };
    case 'tooltip_delay':
      return { ...useTooltipPrefsStore.getState().delay };
    case 'tooltip_hold':
      return { ...useTooltipPrefsStore.getState().hold };
  }
}

function apply(key: PrefKey, value: Record<string, unknown>): void {
  switch (key) {
    case 'locale':
      if (isLocale(value.locale)) useLocaleStore.getState().setLocale(value.locale);
      break;
    case 'theme':
      if (isThemePreference(value.theme)) useThemeStore.getState().setTheme(value.theme);
      break;
    case 'tooltip_delay':
      useTooltipPrefsStore.setState({ delay: parseDelay(value) });
      break;
    case 'tooltip_hold':
      useTooltipPrefsStore.setState({ hold: parseHold(value) });
      break;
  }
}

function setStatus(key: PrefKey, status: PrefStatus | undefined, clearAfterMs?: number): void {
  if (timers[key]) clearTimeout(timers[key]);
  useUserPrefsStore.setState((s) => {
    const next = { ...s.status };
    if (status) next[key] = status;
    else delete next[key];
    return { status: next };
  });
  if (status && clearAfterMs) {
    timers[key] = setTimeout(() => setStatus(key, undefined), clearAfterMs);
  }
}

export const useUserPrefsStore = create<UserPrefsState>()((set) => ({
  status: {},

  load: async () => {
    try {
      const res = await axiosInstance.get<{ prefs?: Record<string, unknown> }>('/me/prefs');
      const prefs = res.data.prefs ?? {};
      // Okuma sürerken kullanıcı bir şey değiştirdiyse onun değeri kalır
      const untouched = (key: PrefKey) => versions[key] === undefined;
      const loc = prefs.locale as { locale?: unknown } | undefined;
      if (untouched('locale') && isLocale(loc?.locale)) apply('locale', { locale: loc.locale });
      const th = prefs.theme as { theme?: unknown } | undefined;
      if (untouched('theme') && isThemePreference(th?.theme)) apply('theme', { theme: th.theme });
      if (untouched('tooltip_delay')) apply('tooltip_delay', { ...parseDelay(prefs.tooltip_delay) });
      if (untouched('tooltip_hold')) apply('tooltip_hold', { ...parseHold(prefs.tooltip_hold) });
    } catch {
      // Worker'a ulaşılamadı: önbellekteki değerler geçerli kalır; sayfa yenilenince (ya da bağlantı değişince) yeniden denenir
    }
  },

  change: async (key, value, label) => {
    const version = (versions[key] ?? 0) + 1;
    versions[key] = version;
    confirmed[key] ??= current(key);
    apply(key, value);
    setStatus(key, 'saving');
    const send = () => axiosInstance.put(`/me/prefs/${key}`, { value }, { timeout: PUT_TIMEOUT_MS });
    const run = (queues[key] ?? Promise.resolve()).catch(() => undefined).then(send);
    queues[key] = run;
    try {
      await run;
      if (versions[key] !== version) return; // arkasından yeni bir değişiklik geldi; durumu o gösterir
      confirmed[key] = value;
      setStatus(key, 'saved', SAVED_VISIBLE_MS);
      const shown = label();
      toast.success(t('prefs.toast.value', { name: shown.name, value: shown.value }), { title: t('prefs.toast.saved'), duration: SAVED_TOAST_MS });
    } catch (err) {
      if (versions[key] !== version) return;
      if (isLocalOnly(err)) {
        setStatus(key, undefined);
        return;
      }
      apply(key, confirmed[key] ?? value);
      setStatus(key, 'failed', FAILED_VISIBLE_MS);
      toast.error(t('prefs.toast.failed.text', { name: label().name }), {
        title: t('prefs.toast.failed'),
        duration: 8_000,
      });
    }
  },
}));

/** Dil seçimi: önce worker'a yazılır (anında), yerel depo ve önbellek buradan güncellenir. */
export const changeLocale = (locale: Locale) =>
  useUserPrefsStore.getState().change('locale', { locale }, () => ({ name: t('common.language'), value: LOCALE_NAMES[locale] }));

/** Tema seçimi. */
export const changeTheme = (theme: ThemePreference) =>
  useUserPrefsStore.getState().change('theme', { theme }, () => ({ name: t('common.theme'), value: t(`common.theme.${theme}`) }));
