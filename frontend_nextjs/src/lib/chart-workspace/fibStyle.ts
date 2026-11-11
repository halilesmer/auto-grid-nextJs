import { factoryStyleFor, type DrawingStyle, type LevelDef } from 'lightweight-charts-drawing';

/** Fibonacci düzeltmesi ayar penceresinin (1110-A4) stil modeli: pencere yalnız bu alanları okur ve yazar. */
export const FIB_KIND = 'fib-retracement';
/** Hazır şablonun adı: kodda durur, silinmez, üzerine yazılmaz, kullanıcı bu adı kullanamaz. */
export const PRESET_ID = '__preset__';
/** Hazır şablonun üç dildeki adı (i18n `fib.presetName` ile aynı): kullanıcı bu adlardan birini kullanamaz. */
export const PRESET_NAMES: readonly string[] = ['Geniş Fib seti', 'Extended Fib set', 'Erweitertes Fib-Set'];
export const isReservedName = (n: string) => n === PRESET_ID || PRESET_NAMES.includes(n);
export const FIB_FONT_SIZES = [10, 11, 12, 14, 16, 20, 24, 28, 32, 40] as const;
export const FIB_LEVEL_SLOTS = 24;

type LineStyle = 'solid' | 'dashed' | 'dotted';
type TrendLine = { visible: boolean; color: string; width: number; style: LineStyle };
export type FibStyle = Pick<DrawingStyle, 'lineStyle' | 'width' | 'levels' | 'fillBackground' | 'transparency' | 'reverse' | 'showPrices' | 'showCoeffs' | 'fibLevelsAsPercents' | 'fibLevelsBasedOnLogScale' | 'showText' | 'horzLabelsAlign' | 'vertLabelsAlign' | 'horzTextAlign' | 'vertTextAlign' | 'labelFontSize' | 'extendLeft' | 'extendRight'> & { fibTrendLine: TrendLine; levels: LevelDef[] };

const H3 = ['left', 'center', 'right'] as const, V3 = ['top', 'middle', 'bottom'] as const, LINES = ['solid', 'dashed', 'dotted'] as const;
const HEX = /^#[\da-f]{3,8}$/i;
export const FIB_TEXT_MAX = 40;

/**
 * Renk + opaklık (1110-A4.11 / S5): kütüphane rengi olduğu gibi çizer, bu yüzden opaklık `#rrggbbaa` olarak renkle birlikte saklanır.
 * Opaklık 100 ise renk eskisi gibi `#rrggbb` kalır (eski kayıtlar ve şablonlar değişmez).
 */
export function splitColor(c: string): { rgb: string; alpha: number } {
  let h = c.replace('#', '').toLowerCase();
  if (h.length === 3 || h.length === 4) h = h.split('').map(x => x + x).join('');
  const rgb = /^[\da-f]{6}/.test(h) ? `#${h.slice(0, 6)}` : '#808080';
  return { rgb, alpha: h.length === 8 ? Math.round(parseInt(h.slice(6, 8), 16) / 255 * 100) : 100 };
}
export function joinColor(rgb: string, alpha: number): string {
  const a = Math.min(100, Math.max(0, Math.round(alpha)));
  return a >= 100 ? rgb : `${rgb}${Math.round(a / 100 * 255).toString(16).padStart(2, '0')}`;
}
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (list as readonly unknown[]).includes(v) ? v as T : fallback;
const bool = (v: unknown, fallback: boolean) => typeof v === 'boolean' ? v : fallback;
const num = (v: unknown, fallback: number, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

/** Kütüphanenin fabrika ayarı, bütün alanlar açık yazılmış (şablon uygulayınca eski değer kalmasın). */
export function factoryFibStyle(): FibStyle {
  const f = factoryStyleFor(FIB_KIND);
  return normalizeFibStyle({ ...f, fibTrendLine: { visible: true, color: '#808080', width: 2, style: 'dashed' }, extendLeft: false, extendRight: false, reverse: false, fibLevelsAsPercents: false, fibLevelsBasedOnLogScale: false, showPrices: true, showCoeffs: true, showText: true, horzLabelsAlign: 'left', vertLabelsAlign: 'middle', horzTextAlign: 'center', vertTextAlign: 'middle', labelFontSize: 12 });
}

/** Çizimin (ya da şablonun) stilinden pencerenin alanlarını okur; eksik ya da bozuk her alan fabrika değerine düşer. */
export function normalizeFibStyle(raw: Partial<DrawingStyle> | undefined | null): FibStyle {
  const s = (raw ?? {}) as Partial<DrawingStyle>;
  const base = factoryStyleFor(FIB_KIND);
  const t = (s.fibTrendLine ?? {}) as Partial<TrendLine>;
  const levels = parseLevels(s.levels) ?? clone(base.levels ?? []);
  return {
    lineStyle: oneOf(LINES, s.lineStyle, 'solid'), width: Math.round(num(s.width, 2, 1, 4)),
    fibTrendLine: { visible: bool(t.visible, true), color: typeof t.color === 'string' && HEX.test(t.color) ? t.color : '#808080', width: Math.round(num(t.width, 2, 1, 4)), style: oneOf(LINES, t.style, 'dashed') },
    levels, fillBackground: bool(s.fillBackground, true), transparency: num(s.transparency, 80, 0, 100),
    reverse: bool(s.reverse, false), showPrices: bool(s.showPrices, true), showCoeffs: bool(s.showCoeffs, true), fibLevelsAsPercents: bool(s.fibLevelsAsPercents, false), fibLevelsBasedOnLogScale: bool(s.fibLevelsBasedOnLogScale, false),
    showText: bool(s.showText, true), horzLabelsAlign: oneOf(H3, s.horzLabelsAlign, 'left'), vertLabelsAlign: oneOf(V3, s.vertLabelsAlign, 'middle'), horzTextAlign: oneOf(H3, s.horzTextAlign, 'center'), vertTextAlign: oneOf(V3, s.vertTextAlign, 'middle'),
    labelFontSize: (FIB_FONT_SIZES as readonly unknown[]).includes(s.labelFontSize) ? s.labelFontSize as number : 12,
    extendLeft: bool(s.extendLeft, false), extendRight: bool(s.extendRight, false),
  };
}

function parseLevels(raw: unknown): LevelDef[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 40) return null;
  const out: LevelDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const l = item as Partial<LevelDef>;
    if (typeof l.coeff !== 'number' || !Number.isFinite(l.coeff) || typeof l.color !== 'string' || !HEX.test(l.color)) return null;
    out.push({ ...(typeof l.text === 'string' && l.text ? { text: l.text.slice(0, FIB_TEXT_MAX) } : {}), coeff: l.coeff, color: l.color, visible: l.visible !== false });
  }
  return out;
}

const W = '#ffffff';
const slot = (coeff: number, visible: boolean, color = W): LevelDef => ({ coeff, color, visible });
/** Hazır seviye seti: 24 yuva, satır satır (indeks 0 sol, 1 sağ). */
const PRESET_LEVELS: LevelDef[] = [
  slot(0, true), slot(0.886, true), slot(0.382, true), slot(0.5, true), slot(0.618, true), slot(0.786, true), slot(1, true), slot(1.618, true),
  slot(-0.272, true), slot(-0.414, true), slot(-0.618, true), slot(1.272, true), slot(1.414, true), slot(-1, true), slot(2.618, true), slot(2, true),
  slot(0.236, true, '#ffeb3b'), slot(-0.114, true, '#f23645'), slot(-1.618, true), slot(4, false), slot(-0.382, false, '#4caf50'), slot(4.414, false), slot(4.618, false, '#4caf50'), slot(4.764, false),
];
export const presetFibStyle = (): FibStyle => ({
  lineStyle: 'solid', width: 1, fibTrendLine: { visible: true, color: W, width: 1, style: 'solid' }, levels: clone(PRESET_LEVELS),
  extendLeft: false, extendRight: true, fillBackground: false, transparency: 80, reverse: false, showPrices: true, showCoeffs: true, fibLevelsAsPercents: false, fibLevelsBasedOnLogScale: false,
  horzLabelsAlign: 'right', vertLabelsAlign: 'top', showText: true, horzTextAlign: 'center', vertTextAlign: 'middle', labelFontSize: 12,
});

/** Katsayı metni: 0.618, 1, -0.272 (sondaki sıfırlar atılır) */
export const coeffText = (k: number) => String(Number(k.toFixed(3)));
export const fibStyleEqual = (a: FibStyle, b: FibStyle) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Fib dışı çizim türlerinin şablon stili (1110-A4 S7b): çizimin stilinden yalnız bu alanlar şablona girer.
 * Noktalar, görünürlük, kilit ve metin içeriği girmez (A4.3 ile aynı).
 */
const SIMPLE_NUMBERS = { width: [1, 4], transparency: [0, 100], fontSize: [6, 100], borderWidth: [0, 10], leftEnd: [0, 1], rightEnd: [0, 1] } as const;
const SIMPLE_COLORS = ['color', 'textColor', 'backgroundColor', 'labelBackgroundColor'] as const;
const SIMPLE_BOOLS = ['fillBackground', 'bold', 'italic', 'extendLeft', 'extendRight', 'showMiddlePoint', 'fillLabelBackground', 'drawBorder'] as const;
export function pickSimpleStyle(raw: Partial<DrawingStyle> | undefined | null): Partial<DrawingStyle> {
  const s = (raw ?? {}) as Record<string, unknown>, out: Record<string, unknown> = {};
  for (const key of SIMPLE_COLORS) if (typeof s[key] === 'string' && HEX.test(s[key] as string)) out[key] = s[key];
  for (const key of SIMPLE_BOOLS) if (typeof s[key] === 'boolean') out[key] = s[key];
  for (const [key, [min, max]] of Object.entries(SIMPLE_NUMBERS)) if (typeof s[key] === 'number' && Number.isFinite(s[key])) out[key] = num(s[key], min, min, max);
  if ((LINES as readonly unknown[]).includes(s.lineStyle)) out.lineStyle = s.lineStyle;
  return out as Partial<DrawingStyle>;
}
/** Türe göre şablon stili: Fibonacci tam stil, öbürleri ortak alt küme. */
export const templateStyleOf = (kind: string, raw: Partial<DrawingStyle> | undefined | null): Partial<DrawingStyle> => kind === FIB_KIND ? normalizeFibStyle(raw) : pickSimpleStyle(raw);

/** Kullanıcı şablonları: tür → ad → stil. Bozuk girdi atılır, eski kayıt (yalnız Fib) aynen okunur. */
export type DrawingTemplates = Record<string, Record<string, Partial<DrawingStyle>>>;
const goodKind = (k: string) => k.length > 0 && k.length <= 60;
export function parseDrawingTemplates(raw: unknown): DrawingTemplates {
  const out: DrawingTemplates = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [kind, byKind] of Object.entries(raw as Record<string, unknown>).slice(0, 80)) {
    if (!goodKind(kind) || !byKind || typeof byKind !== 'object') continue;
    const named: Record<string, Partial<DrawingStyle>> = {};
    for (const [name, style] of Object.entries(byKind as Record<string, unknown>).slice(0, 100)) {
      const n = name.trim();
      if (!n || n.length > 80 || isReservedName(n) || !style || typeof style !== 'object') continue;
      const picked = templateStyleOf(kind, style as Partial<DrawingStyle>);
      if (kind === FIB_KIND || Object.keys(picked).length) named[n] = picked;
    }
    if (Object.keys(named).length) out[kind] = named;
  }
  return out;
}
/** Kullanıcı varsayılanı (son onaylanan stil): tür → stil */
export type DrawingDefaults = Record<string, Partial<DrawingStyle>>;
export function parseDrawingDefaults(raw: unknown): DrawingDefaults {
  const out: DrawingDefaults = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [kind, style] of Object.entries(raw as Record<string, unknown>).slice(0, 80)) {
    if (!goodKind(kind) || !style || typeof style !== 'object') continue;
    const picked = templateStyleOf(kind, style as Partial<DrawingStyle>);
    if (kind === FIB_KIND || Object.keys(picked).length) out[kind] = picked;
  }
  return out;
}
