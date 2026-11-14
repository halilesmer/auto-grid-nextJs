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
