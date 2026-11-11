import type { DrawingKind } from 'lightweight-charts-drawing';
import { nudgeStep, placeFree, toRatio, toolGroup, type Box, type FreeArea } from './toolbar';

/**
 * Seçili çizimin yüzen araç çubuğu (plan 1110-A4.13, UI-29): düğme listesi, ilk yer ve kayıt biçimi.
 * Saf yardımcılar; DOM'a dokunmaz.
 */
export type BarFamily = 'fib' | 'line' | 'text' | 'shape' | 'multi';
export type BarButton = 'template' | 'color' | 'fill' | 'width' | 'style' | 'size' | 'settings' | 'lock' | 'remove' | 'more';

/** Çubuğun yer ayırma kuralı: grafik bu genişliğin altındaysa çubuk alta iner ve tutamacı olmaz (A4.13.4). */
export const PHONE_BAR_PX = 640;
/** Kenar boşluğu ve ilk yerin üst payı (A4.13.2). */
export const BAR_GAP = 6;
/** Kilitliyken kapanan düğmeler (A4.13.5); Ayarlar, Kilit ve "…" açık kalır. */
export const LOCK_DISABLED: readonly BarButton[] = ['template', 'color', 'fill', 'width', 'style', 'size', 'remove'];

/** Seçimin türü: tek çizimse türüne göre, birden çoksa "multi". */
export function barFamily(kinds: readonly DrawingKind[]): BarFamily {
  if (kinds.length !== 1) return 'multi';
  const kind = kinds[0];
  if (kind === 'fib-retracement') return 'fib';
  const group = toolGroup(kind);
  if (group === 'text') return 'text';
  if (group === 'shapes') return 'shape';
  return 'line';
}

/** Soldan sağa düğmeler (tutamaç ayrı). Şablon yalnız Fibonacci'de: öbür türlerin şablonu S7b'ye kaldı. */
export function barButtons(family: BarFamily): BarButton[] {
  switch (family) {
    case 'fib': return ['template', 'color', 'width', 'settings', 'lock', 'remove', 'more'];
    case 'line': return ['color', 'width', 'style', 'settings', 'lock', 'remove', 'more'];
    case 'shape': return ['color', 'fill', 'width', 'settings', 'lock', 'remove', 'more'];
    case 'text': return ['color', 'size', 'settings', 'lock', 'remove', 'more'];
    default: return ['color', 'lock', 'remove', 'more'];
  }
}

/** Rengi değiştirir, saydamlığı korur: #rrggbbaa içindeki aa eski renkten gelir. */
export function keepAlpha(previous: string | undefined, next: string): string {
  const base = /^#[\da-f]{6}/i.exec(next)?.[0] ?? next;
  const alpha = previous && /^#[\da-f]{8}$/i.test(previous) ? previous.slice(7) : '';
  return /^#[\da-f]{6}/i.test(base) ? `${base.toLowerCase()}${alpha}` : next;
}

export interface Rect { left: number; top: number; right: number; bottom: number }

/**
 * İlk yer: üstten 6 px aşağıda, fiyat ekseninin solundaki genişliğin ortası (A4.13.2).
 * Engelle (legend, OHLC satırı, serbest paketler) çakışırsa önce engelin sağına kayar, yer yoksa engelin altına iner.
 * `area`: grafik alanı (sol/sağ kenar payları fiyat eksenleri). Dönüş: alana göre sol üst köşe.
 */
export function firstPlace(area: FreeArea, size: Box, obstacles: readonly Rect[]): { left: number; top: number } {
  const minLeft = area.left + BAR_GAP, maxLeft = Math.max(minLeft, area.width - area.right - size.width - BAR_GAP);
  let left = Math.min(maxLeft, Math.max(minLeft, area.left + (area.width - area.left - area.right - size.width) / 2)), top = BAR_GAP;
  for (let pass = 0; pass <= obstacles.length; pass++) {
    const hit = obstacles.find(o => top < o.bottom && top + size.height > o.top && left < o.right && left + size.width > o.left);
    if (!hit) break;
    if (hit.right + BAR_GAP + size.width <= maxLeft + 0.5 && top < hit.bottom) left = hit.right + BAR_GAP;
    else { top = hit.bottom + BAR_GAP; left = Math.min(maxLeft, Math.max(minLeft, area.left + (area.width - area.left - area.right - size.width) / 2)); }
  }
  return { left: Math.round(left), top: Math.round(top) };
}

/** Kaydedilmiş oranı çubuk yerine çevirir; alana sığmazsa null (ilk yere dönülür). */
export const placeSaved = (p: { x: number; y: number }, size: Box, area: FreeArea) => placeFree(p, size, area);
/** Sürüklenen yeri (alana göre piksel) oran olarak saklanacak biçime çevirir. */
export const savedRatio = (left: number, top: number, area: Box) => toRatio(left, top, area);
/** Ok tuşu ile taşı: oran yönünde %3, Shift ile %10. */
export function nudge(p: { x: number; y: number }, key: string, shift: boolean): { x: number; y: number } | null {
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
  if (!d) return null;
  const s = nudgeStep(shift), clamp = (v: number) => Math.max(0, Math.min(1, v));
  return { x: clamp(p.x + d[0] * s), y: clamp(p.y + d[1] * s) };
}

/** Saklanan konumu okur; bozuk kayıt null olur (ilk yer). */
export function parseFloatingBar(value: unknown): { x: number; y: number } | null {
  if (!value || typeof value !== 'object') return null;
  const { x, y } = value as Record<string, unknown>;
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
}
