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
    out.push({ ...(typeof l.text === 'string' ? { text: l.text } : {}), coeff: l.coeff, color: l.color, visible: l.visible !== false });
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

/** Kullanıcı şablonları: tür → ad → stil. Bozuk girdi atılır, eski kayıt (alan yok) boş sayılır. */
export type DrawingTemplates = Record<string, Record<string, FibStyle>>;
export function parseDrawingTemplates(raw: unknown): DrawingTemplates {
  const out: DrawingTemplates = {};
  if (!raw || typeof raw !== 'object') return out;
  const byKind = (raw as Record<string, unknown>)[FIB_KIND];
  if (!byKind || typeof byKind !== 'object') return out;
  const named: Record<string, FibStyle> = {};
  for (const [name, style] of Object.entries(byKind as Record<string, unknown>).slice(0, 100)) {
    const n = name.trim();
    if (!n || n.length > 80 || isReservedName(n) || !style || typeof style !== 'object') continue;
    named[n] = normalizeFibStyle(style as Partial<DrawingStyle>);
  }
  if (Object.keys(named).length) out[FIB_KIND] = named;
  return out;
}
/** Kullanıcı varsayılanı (Tamam'da kaydedilen son stil): tür → stil */
export type DrawingDefaults = Record<string, FibStyle>;
export function parseDrawingDefaults(raw: unknown): DrawingDefaults {
  const style = raw && typeof raw === 'object' ? (raw as Record<string, unknown>)[FIB_KIND] : null;
  return style && typeof style === 'object' ? { [FIB_KIND]: normalizeFibStyle(style as Partial<DrawingStyle>) } : {};
}
