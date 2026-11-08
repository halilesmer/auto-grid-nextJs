// Haber kartı (NWS-02, plan 1107-A16 S2): saf yardımcılar. React/Zustand yok; e2e ve bileşenler kullanır.
// Yanıt sözleşmesi: worker_python/src/utils/econ_calendar.py (Zeiten UTC, forecast_direction, impact_type).

export type NewsImpact = 'high' | 'moderate' | 'low';
export type NewsDay = 'd-1' | 'd0' | 'd1' | 'week' | 'month';

export interface NewsFilter {
  impacts: NewsImpact[];
  days: NewsDay[];
  /** null = Hesabın zone sembollerinden türet (yoksa hepsi) */
  currencies: string[] | null;
}

export interface NewsEvent {
  id: number | null;
  event_code: string | null;
  title: string | null;
  currency: string | null;
  importance: string | null;
  time: string;
  time_mode: string | null;
  sector: string | null;
  unit: string | null;
  multiplier: string | null;
  actual: number | null;
  forecast: number | null;
  prev: number | null;
  revised_prev: number | null;
  impact_type: string | null;
  forecast_direction: string | null;
}

export const IMPACTS: NewsImpact[] = ['high', 'moderate', 'low'];
export const SINGLE_DAYS: NewsDay[] = ['d-1', 'd0', 'd1'];
export const RANGE_DAYS: NewsDay[] = ['week', 'month'];
export const KNOWN_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF', 'CNY'];
export const SOON_MINUTES = 30;

export const DEFAULT_FILTER: NewsFilter = { impacts: ['high'], days: ['d0', 'd1'], currencies: null };

export const isRange = (d: NewsDay) => d === 'week' || d === 'month';

/** Önem anahtarını (high/moderate/low) açar/kapar; en az biri kalmasa da olur (boş = hiç haber). */
export function toggleImpact(filter: NewsFilter, impact: NewsImpact): NewsFilter {
  const on = filter.impacts.includes(impact);
  return { ...filter, impacts: IMPACTS.filter((i) => (i === impact ? !on : filter.impacts.includes(i))) };
}

/** Gün düğmesi: aralık (hafta/ay) seçilince tek günler kapanır ve ikisi birlikte seçilmez. */
export function toggleDay(filter: NewsFilter, day: NewsDay): NewsFilter {
  const on = filter.days.includes(day);
  if (isRange(day)) return { ...filter, days: on ? [] : [day] };
  if (filter.days.some(isRange)) return filter;
  return { ...filter, days: SINGLE_DAYS.filter((d) => (d === day ? !on : filter.days.includes(d))) };
}

export function normalizeFilter(raw: unknown): NewsFilter {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<NewsFilter>;
  const impacts = Array.isArray(r.impacts) ? IMPACTS.filter((i) => r.impacts!.includes(i)) : DEFAULT_FILTER.impacts;
  const allDays: NewsDay[] = [...SINGLE_DAYS, ...RANGE_DAYS];
  let days = Array.isArray(r.days) ? allDays.filter((d) => r.days!.includes(d)) : DEFAULT_FILTER.days;
  const range = days.find(isRange);
  if (range) days = [range];
  const currencies = Array.isArray(r.currencies) ? r.currencies.filter((c) => typeof c === 'string').map((c) => c.toUpperCase()) : null;
  return { impacts, days, currencies };
}

/** EURUSD → EUR, USD; XAUUSD → USD (XAU ist keine Währung der Liste). Reihenfolge der Liste, ohne Doppel. */
export function currenciesFromSymbols(symbols: string[]): string[] {
  const found = new Set<string>();
  for (const raw of symbols) {
    const s = raw.toUpperCase().replace(/[^A-Z]/g, '');
    if (s.length < 6) continue;
    for (const part of [s.slice(0, 3), s.slice(3, 6)]) if (KNOWN_CURRENCIES.includes(part)) found.add(part);
  }
  return KNOWN_CURRENCIES.filter((c) => found.has(c));
}

export function effectiveCurrencies(filter: NewsFilter, derived: string[]): string[] {
  if (filter.currencies) return filter.currencies;
  return derived.length ? derived : KNOWN_CURRENCIES;
}

const startOfDay = (d: Date, shift = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + shift);

/** Seçili günlerin yerel sınırları [from, to) — boşsa null. Tek günler arası boşluk varsa kapsayan aralık, satırlar sonra süzülür. */
export function dayRange(filter: NewsFilter, now: Date): { from: Date; to: Date } | null {
  const range = filter.days.find(isRange);
  if (range === 'week') {
    const monday = (now.getDay() + 6) % 7;
    return { from: startOfDay(now, -monday), to: startOfDay(now, 7 - monday) };
  }
  if (range === 'month') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
  const shifts = filter.days.map((d) => ({ 'd-1': -1, d0: 0, d1: 1 })[d as 'd-1' | 'd0' | 'd1']);
  if (!shifts.length) return null;
  return { from: startOfDay(now, Math.min(...shifts)), to: startOfDay(now, Math.max(...shifts) + 1) };
}

/** Olay seçili günlerden birine düşüyor mu (yerel gün). */
export function inSelectedDays(filter: NewsFilter, time: Date, now: Date): boolean {
  const range = dayRange(filter, now);
  if (!range) return false;
  if (filter.days.some(isRange)) return time >= range.from && time < range.to;
  const diff = Math.round((startOfDay(time).getTime() - startOfDay(now).getTime()) / 86_400_000);
  return filter.days.includes(`d${diff}` as NewsDay);
}

export type NewsArrow = { dir: 'up' | 'down'; released: boolean } | null;

/** Yayından sonra MT5 impact_type (tam renk), önce forecast_direction (soluk); 'flat'/yok → ok yok. */
export function arrowOf(e: NewsEvent): NewsArrow {
  if (e.actual != null) {
    if (e.impact_type === 'positive') return { dir: 'up', released: true };
    if (e.impact_type === 'negative') return { dir: 'down', released: true };
    return null;
  }
  if (e.forecast_direction === 'up') return { dir: 'up', released: false };
  if (e.forecast_direction === 'down') return { dir: 'down', released: false };
  return null;
}

/** Sektör → i18n anahtar kökü; none/holidays/tanınmayan → yorum yok. */
const SECTORS: Record<string, string> = {
  prices: 'prices', jobs: 'labor', gdp: 'gdp', business: 'business', consumer: 'consumer', housing: 'housing', money: 'money', trade: 'trade',
};
export const sectorKey = (sector: string | null) => (sector ? (SECTORS[sector.toLowerCase()] ?? null) : null);

const SUFFIX: Record<string, string> = { thousands: 'K', millions: 'M', billions: 'B', trillions: 'T' };

/** Değer metni: sayı yerel biçimde (en çok 3 ondalık) + çarpan + birim (%). */
export function formatNewsValue(value: number | null, e: Pick<NewsEvent, 'unit' | 'multiplier'>, number: (v: number, o?: Intl.NumberFormatOptions) => string): string | null {
  if (value == null) return null;
  const unit = (e.unit ?? '').toLowerCase();
  const mult = SUFFIX[(e.multiplier ?? '').toLowerCase()] ?? '';
  return `${number(value, { maximumFractionDigits: 3 })}${mult}${unit === 'percent' || unit === 'percentage' ? '%' : ''}`;
}

export type NewsTimeMode = 'time' | 'tentative' | 'allday';
export function timeModeOf(e: Pick<NewsEvent, 'time_mode'>): NewsTimeMode {
  const m = (e.time_mode ?? '').toLowerCase();
  if (m === 'date') return 'allday';
  if (m === 'tentative' || m === 'notime') return 'tentative';
  return 'time';
}

/** Sıradaki haber: şimdiden sonraki ilk saatli olay. */
export function nextEvent(events: NewsEvent[], nowMs: number): NewsEvent | null {
  return events.find((e) => timeModeOf(e) === 'time' && Date.parse(e.time) >= nowMs) ?? null;
}

export const minutesUntil = (e: NewsEvent, nowMs: number) => Math.round((Date.parse(e.time) - nowMs) / 60_000);
export const isSoon = (e: NewsEvent, nowMs: number) => {
  const m = minutesUntil(e, nowMs);
  return timeModeOf(e) === 'time' && m >= 0 && m <= SOON_MINUTES;
};
