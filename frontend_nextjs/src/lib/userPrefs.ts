// Kişisel tercihlerin türleri ve doğrulaması (USR-09). Worker serbest JSON saklar; değerin biçimini burada denetleriz,
// bozuk ya da elle değiştirilmiş bir değer arayüzü bozmasın.

export type TooltipDelayMode = 'instant' | 'custom';
export type TooltipHoldMode = 'pointer' | 'custom';

export interface TooltipDelayPref {
  mode: TooltipDelayMode;
  /** Özel gecikme (ms). 'instant' iken de saklanır: "Özel" seçilince son değer gelir. */
  ms: number;
}
export interface TooltipHoldPref {
  mode: TooltipHoldMode;
  ms: number;
}

export const DELAY_MIN_MS = 100;
export const DELAY_MAX_MS = 10_000;
export const HOLD_MIN_MS = 1_000;
export const HOLD_MAX_MS = 60_000;

export const DEFAULT_DELAY: TooltipDelayPref = { mode: 'custom', ms: 300 };
export const DEFAULT_HOLD: TooltipHoldPref = { mode: 'pointer', ms: 5_000 };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function clampMs(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
}

export function parseDelay(v: unknown): TooltipDelayPref {
  if (!isRecord(v)) return DEFAULT_DELAY;
  return {
    mode: v.mode === 'instant' ? 'instant' : 'custom',
    ms: clampMs(v.ms, DELAY_MIN_MS, DELAY_MAX_MS, DEFAULT_DELAY.ms),
  };
}

export function parseHold(v: unknown): TooltipHoldPref {
  if (!isRecord(v)) return DEFAULT_HOLD;
  return {
    mode: v.mode === 'custom' ? 'custom' : 'pointer',
    ms: clampMs(v.ms, HOLD_MIN_MS, HOLD_MAX_MS, DEFAULT_HOLD.ms),
  };
}

/** Saniye alanındaki metni (virgül ya da nokta) ms'ye çevirir; geçersiz ya da aralık dışıysa null. */
export function parseSeconds(text: string, minMs: number, maxMs: number): number | null {
  const clean = text.trim();
  if (!/^\d+([.,]\d+)?$/.test(clean)) return null; // "0x10" ve "1e1" geçmez
  const n = Number(clean.replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const ms = Math.round(n * 1000);
  return ms >= minMs && ms <= maxMs ? ms : null;
}

/** Tooltip'in etkin gecikmesi (ms). */
export const effectiveDelayMs = (p: TooltipDelayPref): number => (p.mode === 'instant' ? 0 : p.ms);
/** Tooltip'in etkin görünme süresi (ms); null = fare ayrılana kadar. */
export const effectiveHoldMs = (p: TooltipHoldPref): number | null => (p.mode === 'pointer' ? null : p.ms);

// --- Bildirim süresi, varsayılan zaman dilimi, kayıtlı renkler (USR-11, USR-12) ---

/** Bildirim süresi (sn). 0 = kapatılana kadar. Hata bildirimleri bundan etkilenmez. */
export const TOAST_SECONDS = [5, 10, 20, 0] as const;
export type ToastSeconds = (typeof TOAST_SECONDS)[number];
export const DEFAULT_TOAST_SECONDS: ToastSeconds = 10;

export function parseToastSeconds(v: unknown): ToastSeconds {
  const s = isRecord(v) ? v.seconds : undefined;
  return (TOAST_SECONDS as readonly unknown[]).includes(s) ? (s as ToastSeconds) : DEFAULT_TOAST_SECONDS;
}

/** Bildirim süresi → toast süresi (ms); 0 = otomatik kapanmaz. */
export const toastMs = (s: ToastSeconds): number => s * 1000;

/** Grafik bağlantısında `tf` yoksa açılış zaman dilimi. */
export const CHART_DEFAULT_TFS = ['M15', 'H1', 'H4', 'D1'] as const;
export type ChartDefaultTf = (typeof CHART_DEFAULT_TFS)[number];
export const DEFAULT_CHART_DEFAULT_TF: ChartDefaultTf = 'H4';

export function parseChartTf(v: unknown): ChartDefaultTf {
  const tf = isRecord(v) ? v.tf : undefined;
  return (CHART_DEFAULT_TFS as readonly unknown[]).includes(tf) ? (tf as ChartDefaultTf) : DEFAULT_CHART_DEFAULT_TF;
}

/** Renk panelinde „+“nın yanında en fazla bu kadar özel renk durur (iki sıra). */
export const CUSTOM_COLORS_MAX = 19;
const HEX = /^#[\da-f]{6}$/i;

export function parseColors(v: unknown): string[] {
  const list = isRecord(v) && Array.isArray(v.colors) ? v.colors : [];
  return list.filter((c): c is string => typeof c === 'string' && HEX.test(c)).map((c) => c.toLowerCase()).slice(-CUSTOM_COLORS_MAX);
}
