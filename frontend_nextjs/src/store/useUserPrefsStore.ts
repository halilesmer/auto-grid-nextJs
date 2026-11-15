import { create } from 'zustand';
import axios from 'axios';
import { axiosInstance, NotConnectedError } from '@/lib/api';
import { setUserToastMs, toast } from '@/components/ui/animated-toast';
import { t } from '@/i18n';
import { isLocale, LOCALE_NAMES, type Locale } from '@/i18n/config';
import { parseChartTf, parseColors, parseDelay, parseHold, parseToastSeconds, toastMs } from '@/lib/userPrefs';
import { DEFAULT_ALERTS, normalizeAlerts } from '@/lib/newsAlerts';
import { DEFAULT_FILTER, normalizeFilter } from '@/lib/news';
import { isThemePreference, type ThemePreference } from '@/lib/theme';
import { DEFAULT_PERSONAL, parsePersonal, personalValue, readLegacyPersonal, stripLegacyPersonal } from '@/lib/formation/alarmPersonal';
import { useAlarmPrefsStore } from './useAlarmPrefsStore';
import { useChartPrefsStore } from './useChartPrefsStore';
import { CUSTOM_COLORS_STORAGE_KEY, useCustomColorsStore, withColor } from './useCustomColorsStore';
import { useLocaleStore } from './useLocaleStore';
import { METRICS_LEGACY_KEY, readLegacyPinned, useMetricsPrefsStore } from './useMetricsPrefsStore';
import { registerNewsPersister, useNewsStore } from './useNewsStore';
import { useThemeStore } from './useThemeStore';
import { useToastPrefsStore } from './useToastPrefsStore';
import { useTooltipPrefsStore } from './useTooltipPrefsStore';

/**
 * Kişisel tercihler (USR-09): kullanıcıya aittir ve worker'da (VPS) kimliğiyle saklanır (`/api/me/prefs`).
 * localStorage yalnız önbellektir (açılışta dil/tema/ipucu parlamasın); asıl kaynak worker'dır.
 * Her değişiklik anında kaydedilir: iyimser güncelleme, anahtar başına durum, hatada eski değere dönüş.
 */
export type PrefKey =
  | 'locale'
  | 'theme'
  | 'tooltip_delay'
  | 'tooltip_hold'
  | 'toast_duration'
  | 'news_filter'
  | 'news_alerts'
  | 'chart_tf'
  | 'chart_colors'
  | 'formation_alarm'
  | 'metrics_pinned';
export type PrefStatus = 'saving' | 'saved' | 'failed';
/** Kişisel tercihlerin worker'dan okunma durumu (USR-13): `ready` olmadan yazma yok. */
export type PrefLoadState = 'idle' | 'loading' | 'ready' | 'failed' | 'offline';
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
  /** USR-13: ayar penceresi `ready` olmadan kişisel alanları kilitler; `change()` de bu durumda yazmaz. */
  loadState: PrefLoadState;
  load: () => Promise<void>;
  /** Değeri iyimser uygular, worker'a yazar; hatada eski değere döner. `silent`: başarı toast'ı yok; `quiet`: hata toast'ı da yok. `label` (değişiklikten sonra çağrılır, yeni dilde okunur) toast metnine girer ("Tema: Koyu"). */
  change: (key: PrefKey, value: Record<string, unknown>, label: () => PrefLabel, opts?: { silent?: boolean; quiet?: boolean }) => Promise<void>;
  /** Haber filtresi ve uyarısı eskiden hesaba bağlıydı: kullanıcıda değer yoksa seçili hesabın değeri bir kez alınır (USR-11). */
  importFromAccount: (accountId: string) => Promise<void>;
}

// Anahtar başına: son değişiklik sırası (eski bir yanıt yeni değeri ezmesin) ve durum zamanlayıcısı
const versions: Partial<Record<PrefKey, number>> = {};
const timers: Partial<Record<PrefKey, ReturnType<typeof setTimeout>>> = {};
// Worker'ın bildiği son değer: hatada buna dönülür (art arda iki değişiklik düşerse ikincinin "önceki"si kaydedilmemiş olurdu)
const confirmed: Partial<Record<PrefKey, Record<string, unknown>>> = {};
// Aynı anahtara yazmalar sırayla gider; aksi hâlde worker'da eski değer kalabilir
const queues: Partial<Record<PrefKey, Promise<unknown>>> = {};
const PUT_TIMEOUT_MS = 15_000;
/** Okuma düşerse: bu aralıklarla yeniden denenir (ilk deneme + 3 yeniden deneme), sonra satırda hata ve „Tekrar dene“. */
const LOAD_RETRY_DELAYS_MS = [600, 1_200, 2_400];
/** Tek değerli tercihler: kullanıcının seçtiği değer varsayılandan türetilmez, yükleme bitmeden de yazılabilir (üst çubuktaki dil ve tema düğmeleri). */
const WRITABLE_BEFORE_LOAD: readonly PrefKey[] = ['locale', 'theme'];
let loadRun = 0;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
// load() bitince: worker'daki anahtarlar (null = okunamadı). Göç bu bilgiye bakar.
let serverKeys: Set<string> | null = null;
let markLoaded: () => void = () => undefined;
const loadedPromise = new Promise<void>((resolve) => {
  markLoaded = resolve;
});
let accountImportDone = false;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Bağlantı yok ya da worker bu uca sahip değil (eski sürüm): hata değil, değer yalnız bu oturumda kalır (dil, tema ve ipucu süreleri ayrıca önbellekte). */
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
    case 'toast_duration':
      return { seconds: useToastPrefsStore.getState().seconds };
    case 'news_filter':
      return { ...useNewsStore.getState().filter };
    case 'news_alerts':
      return { alerts: useNewsStore.getState().alerts.alerts.map((a) => ({ ...a })) };
    case 'chart_tf':
      return { tf: useChartPrefsStore.getState().tf };
    case 'chart_colors':
      return { colors: [...useCustomColorsStore.getState().colors] };
    case 'formation_alarm':
      return personalValue(useAlarmPrefsStore.getState().personal);
    case 'metrics_pinned':
      return { pinned: useMetricsPrefsStore.getState().pinned };
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
    case 'toast_duration':
      useToastPrefsStore.setState({ seconds: parseToastSeconds(value) });
      setUserToastMs(toastMs(parseToastSeconds(value)));
      break;
    case 'news_filter':
      useNewsStore.setState({ filter: normalizeFilter(value) });
      break;
    case 'news_alerts':
      useNewsStore.setState({ alerts: normalizeAlerts(value) });
      break;
    case 'chart_tf':
      useChartPrefsStore.setState({ tf: parseChartTf(value) });
      break;
    case 'chart_colors':
      useCustomColorsStore.setState({ colors: parseColors(value) });
      break;
    case 'formation_alarm':
      useAlarmPrefsStore.setState({ personal: parsePersonal(value), loaded: true });
      break;
    case 'metrics_pinned':
      useMetricsPrefsStore.setState({ pinned: value.pinned !== false });
      break;
  }
}

/** Worker'da değer yok: varsayılan geçerli olur. Bildirim süresi seçilmediyse eski süreler (toast'ta null) kalır. */
function resetToDefault(key: 'toast_duration' | 'news_filter' | 'news_alerts' | 'chart_tf' | 'chart_colors' | 'formation_alarm' | 'metrics_pinned'): void {
  if (key === 'toast_duration') {
    useToastPrefsStore.setState({ seconds: parseToastSeconds(undefined) });
    setUserToastMs(null);
  } else if (key === 'news_filter') apply(key, { ...DEFAULT_FILTER });
  else if (key === 'news_alerts') apply(key, { alerts: DEFAULT_ALERTS.alerts.map((a) => ({ ...a })) });
  else if (key === 'chart_tf') apply(key, {});
  else if (key === 'formation_alarm') apply(key, personalValue(DEFAULT_PERSONAL));
  else if (key === 'metrics_pinned') apply(key, { pinned: true });
  else apply(key, { colors: [] });
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

/** Worker'dan okunan tercihleri uygular (kullanıcı bu arada dokunduysa onun değeri kalır). */
function applyLoaded(prefs: Record<string, unknown>): void {
  const untouched = (key: PrefKey) => versions[key] === undefined;
  const loc = prefs.locale as { locale?: unknown } | undefined;
  if (untouched('locale') && isLocale(loc?.locale)) apply('locale', { locale: loc.locale });
  const th = prefs.theme as { theme?: unknown } | undefined;
  if (untouched('theme') && isThemePreference(th?.theme)) apply('theme', { theme: th.theme });
  if (untouched('tooltip_delay')) apply('tooltip_delay', { ...parseDelay(prefs.tooltip_delay) });
  if (untouched('tooltip_hold')) apply('tooltip_hold', { ...parseHold(prefs.tooltip_hold) });
  // Yeni anahtarlar: değer varsa uygulanır; yoksa varsayılana dönülür (önceki kullanıcının değeri kalmasın)
  for (const key of ['toast_duration', 'news_filter', 'news_alerts', 'chart_tf', 'chart_colors', 'formation_alarm', 'metrics_pinned'] as const) {
    const stored = prefs[key];
    // Alarm und Kennzahlen-Schalter sind vor dem Laden nicht schreibbar: der Worker-Wert gilt auch nach Benutzerwechsel oder neuem Laden
    const serverOwned = key === 'formation_alarm' || key === 'metrics_pinned';
    if (serverOwned) delete confirmed[key];
    if (!serverOwned && !untouched(key)) continue;
    // Kein Wert im Worker: die alten Browser-Werte werden unten übernommen (USR-15), bis dahin gelten sie
    if (!isRecord(stored) && key === 'formation_alarm' && readLegacyPersonal()) continue;
    if (!isRecord(stored) && key === 'metrics_pinned' && readLegacyPinned() !== null) continue;
    if (isRecord(stored)) apply(key, stored);
    else resetToDefault(key);
  }
  accountImportDone = false;
  serverKeys = new Set(Object.keys(prefs));
  if (!serverKeys.has('chart_colors')) void migrateLocalColors();
  if (!serverKeys.has('formation_alarm')) void migrateLocalAlarm();
  else stripLegacyPersonal(); // der Worker hat den Wert: alte Browser-Felder sind überholt
  if (!serverKeys.has('metrics_pinned')) void migrateLocalPinned();
  else removeLegacyPinned();
}

export const useUserPrefsStore = create<UserPrefsState>()(() => ({
  status: {},
  loadState: 'idle',

  load: async () => {
    const run = ++loadRun;
    useUserPrefsStore.setState({ loadState: 'loading' });
    let loaded: Record<string, unknown> | null = null;
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await axiosInstance.get<{ prefs?: unknown }>('/me/prefs', { timeout: PUT_TIMEOUT_MS });
        if (run !== loadRun) return; // daha yeni bir okuma başladı (bağlantı ya da kimlik değişti)
        if (!isRecord(res.data?.prefs)) throw new Error('invalid prefs response');
        loaded = res.data.prefs;
        break;
      } catch (err) {
        if (run !== loadRun) return;
        if (err instanceof NotConnectedError) {
          useUserPrefsStore.setState({ loadState: 'offline' });
          markLoaded();
          return;
        }
        // Tünel kapalıyken ngrok da 404 döner: bu eski worker değil, hata sayılır (yeniden denenir)
        const tunnelDown = axios.isAxiosError(err) && !!err.response?.headers?.['ngrok-error-code'];
        if (axios.isAxiosError(err) && err.response?.status === 404 && !tunnelDown) {
          // Eski worker (uç yok): değerler yalnız bu oturumda kalır; yazma 404 ile yerelde biter
          useUserPrefsStore.setState({ loadState: 'ready' });
          markLoaded();
          return;
        }
        const delay = LOAD_RETRY_DELAYS_MS[attempt];
        if (delay === undefined) break;
        await sleep(delay);
        if (run !== loadRun) return;
      }
    }
    if (loaded) {
      // Önce `ready`: değerler uygulanırken başlayan göç (yerel renkler) `change()` ile yazabilsin
      useUserPrefsStore.setState({ loadState: 'ready' });
      applyLoaded(loaded);
      markLoaded();
      return;
    }
    // Denemeler tükendi: önbellekteki değerler görünür kalır, alanlar kilitli; „Tekrar dene“ yeniden okur
    useUserPrefsStore.setState({ loadState: 'failed' });
    markLoaded();
  },

  importFromAccount: async (accountId) => {
    await loadedPromise;
    if (accountImportDone || !serverKeys) return;
    if (['news_filter', 'news_alerts'].every((k) => serverKeys?.has(k))) {
      accountImportDone = true;
      return;
    }
    try {
      const res = await axiosInstance.post<{ imported?: string[]; prefs?: Record<string, unknown> }>(`/me/prefs/import-account/${encodeURIComponent(accountId)}`);
      accountImportDone = true;
      for (const key of res.data.imported ?? []) {
        const stored = res.data.prefs?.[key];
        if ((key === 'news_filter' || key === 'news_alerts') && versions[key] === undefined && isRecord(stored)) apply(key, stored);
        serverKeys?.add(key);
      }
    } catch {
      // Eski worker (uç yok) ya da ağ hatası: değerler varsayılan kalır; sonraki hesap seçiminde yeniden denenir
    }
  },

  change: async (key, value, label, opts) => {
    // Okuma bitmeden yazılırsa varsayılan değerden türeyen bir değer worker'daki kayıtlı değerin üstüne yazılırdı (USR-13)
    const loadState = useUserPrefsStore.getState().loadState;
    if (loadState !== 'ready' && !WRITABLE_BEFORE_LOAD.includes(key)) {
      if (!opts?.quiet) toast.error(t('prefs.toast.notloaded.text', { name: label().name }), { title: t('prefs.toast.notloaded'), duration: 8_000 });
      return;
    }
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
      serverKeys?.add(key);
      setStatus(key, 'saved', SAVED_VISIBLE_MS);
      if (opts?.silent) return;
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
      if (opts?.quiet) return;
      toast.error(t('prefs.toast.failed.text', { name: label().name }), {
        title: t('prefs.toast.failed'),
        duration: 8_000,
        // 1115-A7.4: aynı değeri yeniden dener
        action: { label: t('sdlg.load.retry'), hint: t('prefs.toast.retry.hint'), onClick: () => {
            // Aradan yeni bir değişiklik geldiyse eski değeri geri yazma
            if (versions[key] === version) void useUserPrefsStore.getState().change(key, value, label, opts);
          },
        },
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

/** Eski cihaz önbelleğindeki kayıtlı renkler (USR-12): kullanıcıda değer yoksa bir kez worker'a yazılır, sonra yerel anahtar silinir. */
async function migrateLocalColors(): Promise<void> {
  let colors: string[] = [];
  try {
    const raw = localStorage.getItem(CUSTOM_COLORS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as { state?: unknown }) : null;
    colors = parseColors(parsed?.state);
  } catch {
    return;
  }
  if (!colors.length || versions.chart_colors !== undefined) return;
  await useUserPrefsStore.getState().change('chart_colors', { colors }, colorsLabel, { silent: true, quiet: true });
  // Yalnız worker kabul ettiyse yerel kopya silinir; yoksa sonraki açılışta yeniden denenir
  if (useUserPrefsStore.getState().status.chart_colors === 'saved') {
    try {
      localStorage.removeItem(CUSTOM_COLORS_STORAGE_KEY);
    } catch {
      /* yok say */
    }
  }
}

/** Persönliche Alarm-Felder aus dem Browser (USR-15): kein Wert im Worker → der alte Browser-Wert wird einmal geschrieben, danach gelöscht. */
async function migrateLocalAlarm(): Promise<void> {
  const legacy = readLegacyPersonal();
  if (!legacy) {
    useAlarmPrefsStore.setState({ loaded: true });
    return;
  }
  if (versions.formation_alarm !== undefined) return;
  // Bis der Worker bestätigt, gilt der alte Wert (der Alarm sucht nicht mit Standardwerten)
  useAlarmPrefsStore.setState({ personal: legacy, loaded: true });
  await useUserPrefsStore.getState().change('formation_alarm', personalValue(legacy), alarmLabel, { silent: true, quiet: true });
  if (useUserPrefsStore.getState().status.formation_alarm === 'saved') stripLegacyPersonal();
}

/** „Kennzahlen angeheftet“ aus dem Browser (USR-15), gleiches Muster. */
async function migrateLocalPinned(): Promise<void> {
  const legacy = readLegacyPinned();
  if (legacy === null || versions.metrics_pinned !== undefined) return;
  await useUserPrefsStore.getState().change('metrics_pinned', { pinned: legacy }, pinnedLabel, { silent: true, quiet: true });
  if (useUserPrefsStore.getState().status.metrics_pinned === 'saved') removeLegacyPinned();
}

function removeLegacyPinned(): void {
  try {
    localStorage.removeItem(METRICS_LEGACY_KEY);
  } catch {
    /* yok say */
  }
}

export const alarmLabel = (): PrefLabel => ({ name: t('formation.alarm.menu'), value: '' });
const pinnedLabel = (): PrefLabel => ({ name: t('metrics.pin'), value: '' });

const colorsLabel = (): PrefLabel => ({ name: t('sdlg.colors'), value: String(useCustomColorsStore.getState().colors.length) });

/** Renk seçicide „+“ ile eklenen renk: kullanıcı tercihine yazılır (toast yok; satırdaki rozet yeter). */
export const addCustomColor = (color: string) => {
  const colors = withColor(useCustomColorsStore.getState().colors, color);
  return useUserPrefsStore.getState().change('chart_colors', { colors }, colorsLabel, { silent: true });
};

export const clearCustomColors = () => useUserPrefsStore.getState().change('chart_colors', { colors: [] }, colorsLabel);

// Haber kartı ve uyarı ayarı aynı depodan yazar; başarı rozeti için sonucu bildirir
registerNewsPersister(async (key, value) => {
  await useUserPrefsStore.getState().change(key, value, () => ({ name: t(key === 'news_filter' ? 'sdlg.news.filter' : 'sdlg.news.alerts'), value: '' }), { silent: true });
  const st = useUserPrefsStore.getState().status[key];
  return st === 'saved' || st === 'saving';
});
