// Haber uyarısı (NWS-03, plan 1107-A16 S3): saf yardımcılar. React/Zustand yok; zamanlayıcı ve e2e kullanır.
import { timeModeOf, type NewsEvent } from './news';

export const MIN_ALERT_MINUTES = 1;
export const MAX_ALERT_MINUTES = 1440;

export interface NewsAlert {
  on: boolean;
  /** Haberden kaç dakika önce (1–1440, tam sayı) */
  minutes: number;
}

/** Her zaman iki uyarı (karar 1107-A16.9): biri, ikisi ya da hiçbiri açık olabilir */
export interface NewsAlertSettings {
  alerts: [NewsAlert, NewsAlert];
}

export const DEFAULT_ALERTS: NewsAlertSettings = { alerts: [{ on: false, minutes: 60 }, { on: false, minutes: 30 }] };

export const isValidMinutes = (m: unknown): m is number => typeof m === 'number' && Number.isInteger(m) && m >= MIN_ALERT_MINUTES && m <= MAX_ALERT_MINUTES;

/** Geçersiz ya da eksik değer varsayılana düşer; açık ama geçersiz uyarı kapalı sayılır. */
export function normalizeAlerts(raw: unknown): NewsAlertSettings {
  const list = (raw && typeof raw === 'object' ? (raw as { alerts?: unknown }).alerts : null) as unknown;
  const arr = Array.isArray(list) ? list : [];
  const one = (i: 0 | 1): NewsAlert => {
    const r = (arr[i] && typeof arr[i] === 'object' ? arr[i] : {}) as Partial<NewsAlert>;
    const minutes = isValidMinutes(r.minutes) ? r.minutes : DEFAULT_ALERTS.alerts[i].minutes;
    return { on: r.on === true, minutes };
  };
  return { alerts: [one(0), one(1)] };
}

/** Açık uyarıların dakikaları, büyükten küçüğe, tekrarsız (aynı dakika tek bildirim) */
export function activeMinutes(settings: NewsAlertSettings): number[] {
  const set = new Set(settings.alerts.filter((a) => a.on && isValidMinutes(a.minutes)).map((a) => a.minutes));
  return [...set].sort((a, b) => b - a);
}

export const hasActiveAlert = (settings: NewsAlertSettings) => activeMinutes(settings).length > 0;

/** (haber, uyarı) için tek anahtar: aynı haber aynı dakika için ikinci kez bildirilmez. Haberin saati anahtarda, çünkü value_id her ay döner. */
export const alertKey = (e: Pick<NewsEvent, 'id' | 'event_code' | 'time'>, minutes: number) => `${e.id ?? e.event_code ?? 'x'}@${e.time}#${minutes}`;

export interface PlannedAlert {
  key: string;
  event: NewsEvent;
  minutes: number;
  /** Uyarı anı (ms); şimdiden küçükse hemen verilir */
  fireAt: number;
}

/**
 * Kesin saatli (time_mode = datetime) ve henüz olmamış haberler için uyarı planı. Gün filtresi burada yok.
 * Uyarı anı geçmiş ama haber henüz olmamışsa fireAt şimdiden küçüktür: uyarı bir kez hemen gelir.
 */
export function planAlerts(events: NewsEvent[], minutes: number[], nowMs: number): PlannedAlert[] {
  const out: PlannedAlert[] = [];
  for (const event of events) {
    if (timeModeOf(event) !== 'time') continue;
    const at = Date.parse(event.time);
    if (!Number.isFinite(at) || at <= nowMs) continue;
    for (const m of minutes) out.push({ key: alertKey(event, m), event, minutes: m, fireAt: at - m * 60_000 });
  }
  return out.sort((a, b) => a.fireAt - b.fireAt);
}

/**
 * Geç açılan sayfada aynı haber için birden çok uyarı birden geçmiş olabilir (ör. 60 ve 30 dk, haber 12 dk sonra).
 * Haber başına yalnız en küçük geçmiş uyarı kalır; diğerleri "gösterildi" sayılır, bildirim yağmuru olmaz.
 */
export function dueNow(planned: PlannedAlert[], nowMs: number): { fire: PlannedAlert[]; skip: PlannedAlert[] } {
  const due = planned.filter((p) => p.fireAt <= nowMs);
  const byEvent = new Map<string, PlannedAlert[]>();
  for (const p of due) {
    const k = `${p.event.id ?? p.event.event_code}@${p.event.time}`;
    byEvent.set(k, [...(byEvent.get(k) ?? []), p]);
  }
  const fire: PlannedAlert[] = [];
  const skip: PlannedAlert[] = [];
  for (const list of byEvent.values()) {
    const sorted = [...list].sort((a, b) => a.minutes - b.minutes);
    fire.push(sorted[0]);
    skip.push(...sorted.slice(1));
  }
  return { fire, skip };
}

// --- Gösterilenler (tarayıcıda; aynı uyarı ikinci kez gelmez) ---

export const SHOWN_STORAGE_KEY = 'grid-robot-news-alerts-shown';
const KEEP_AFTER_EVENT_MS = 60 * 60_000;

/** anahtar → haberin saati (ms); haberi 1 saatten önce geçmiş girdiler temizlenir */
export type ShownMap = Record<string, number>;

export function readShown(nowMs: number, storage: Pick<Storage, 'getItem'> | null = safeStorage()): ShownMap {
  try {
    const raw = storage?.getItem(SHOWN_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(Object.entries(parsed as ShownMap).filter(([, at]) => typeof at === 'number' && at > nowMs - KEEP_AFTER_EVENT_MS));
  } catch {
    return {};
  }
}

export function writeShown(map: ShownMap, storage: Pick<Storage, 'setItem'> | null = safeStorage()) {
  try {
    storage?.setItem(SHOWN_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* localStorage yok: uyarılar bu oturum için bellekteki kümeyle tekrarsız kalır */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
