import type { DrawingStyle, LevelDef } from 'lightweight-charts-drawing';
import { DEFAULT_APPEARANCE, parseAppearance, type Appearance } from './settings';
import { FIB_KIND, factoryFibStyle, normalizeFibStyle, parseDrawingDefaults, parseDrawingTemplates, type DrawingDefaults, type DrawingTemplates } from './fibStyle';

/**
 * S7 (plan 1115-A9.1): kişisel grafik stil tercihleri kullanıcıya aittir ve worker'da (VPS) `user_prefs` anahtarlarında durur.
 * Bu dosya saf veridir (React ve depo yok): anahtar listesi, kodlama (varsayılandan fark, sıkıştırılmış Fibonacci stili) ve eski değeri okuma.
 * Grafik verisi (çizimler, sembole eklenen göstergeler, resimler, görünür aralık, panel düzeni) cihazda kalır.
 */
export const CHART_PREF_KEYS = [
  'chart_appearance',
  'chart_appearance_templates',
  'chart_dock',
  'chart_favorites',
  'chart_indicator_defaults',
  'chart_drawing_defaults',
  'chart_drawing_templates',
  'chart_fib_templates',
  'analysis_layers',
  'analysis_trend',
  'formation_style',
  'chart_osc_scope',
  'chart_osc_standard',
] as const;
export type ChartPrefKey = (typeof CHART_PREF_KEYS)[number];
export const isChartPrefKey = (key: string): key is ChartPrefKey => (CHART_PREF_KEYS as readonly string[]).includes(key);

/** Worker'ın değer başına sınırı (worker_python/src/api/user_prefs.py MAX_VALUE_BYTES). */
export const MAX_PREF_BYTES = 8 * 1024;
/** Worker'ın saydığı boyut: Python `json.dumps(ensure_ascii=False)` her `,` ve `:` sonrasına bir boşluk koyar (kompakt JSON'dan biraz büyük). */
export function prefBytes(value: unknown): number {
  const text = JSON.stringify(value);
  let extra = 0, inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) { if (c === '\\') i++; else if (c === '"') inString = false; } else if (c === '"') inString = true; else if (c === ',' || c === ':') extra++;
  }
  return new TextEncoder().encode(text).length + extra;
}

/** Bu cihazın önbelleğini son eşitleyen kullanıcı: başka kullanıcının önbelleği yeni kullanıcıya sızmasın. */
export const CHART_PREFS_OWNER_KEY = 'grid-robot-chart-prefs-owner';
/** Worker'daki değerle çakışan eski yerel değerlerin tek seferlik yedeği (geri dönüş için). */
export const CHART_PREFS_BACKUP_KEY = 'grid-robot-chart-prefs-backup-v1';

type Json = Record<string, unknown>;

/** Görünüm: yalnız varsayılandan ayrılan alanlar yazılır (tam kayıt 869 bayt). */
export function encodeAppearance(a: Appearance): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(a)) if (v !== (DEFAULT_APPEARANCE as unknown as Json)[k]) out[k] = v;
  return out;
}
export const decodeAppearance = (raw: unknown): Appearance => parseAppearance(raw);

/** Fibonacci stili: fabrika değerine eşit alanlar yazılmaz, seviyeler `[katsayı, renk, görünür, metin?]` dizisidir (ham 1,6 KB → birkaç yüz bayt). */
export function encodeFib(style: Partial<DrawingStyle>): Json {
  const s = normalizeFibStyle(style) as unknown as Json, f = factoryFibStyle() as unknown as Json;
  const out: Json = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === 'levels') continue;
    if (JSON.stringify(v) !== JSON.stringify(f[k])) out[k] = v;
  }
  if (JSON.stringify(s.levels) !== JSON.stringify(f.levels)) {
    out.levels = (s.levels as LevelDef[]).map(l => [l.coeff, l.color, l.visible === false ? 0 : 1, ...(l.text ? [l.text] : [])]);
  }
  return out;
}
export function decodeFib(raw: unknown): Partial<DrawingStyle> {
  if (!raw || typeof raw !== 'object') return normalizeFibStyle(null);
  const r = { ...(raw as Json) };
  if (Array.isArray(r.levels)) {
    r.levels = r.levels.flatMap((row: unknown) => Array.isArray(row) ? [{ coeff: row[0], color: row[1], visible: row[2] !== 0, ...(typeof row[3] === 'string' ? { text: row[3] } : {}) }] : []);
  }
  return normalizeFibStyle({ ...factoryFibStyle(), ...r } as Partial<DrawingStyle>);
}

const mapStyles = (obj: Record<string, Partial<DrawingStyle>>, kind: string, fn: (s: Partial<DrawingStyle>) => unknown) =>
  Object.fromEntries(Object.entries(obj).map(([name, style]) => [name, kind === FIB_KIND ? fn(style) : style]));

export function encodeDrawingDefaults(d: DrawingDefaults): Json {
  return { defaults: Object.fromEntries(Object.entries(d).map(([kind, style]) => [kind, kind === FIB_KIND ? encodeFib(style) : style])) };
}
export function decodeDrawingDefaults(raw: unknown): DrawingDefaults {
  const defaults = (raw as { defaults?: Record<string, unknown> } | null)?.defaults ?? {};
  const prepared = Object.fromEntries(Object.entries(defaults).map(([kind, style]) => [kind, kind === FIB_KIND ? decodeFib(style) : style]));
  return parseDrawingDefaults(prepared);
}

/** Fibonacci dışı şablonlar ve Fibonacci şablonları ayrı anahtarlarda durur (her biri 8 KB'a ayrı sığsın). */
export function encodeSimpleTemplates(t: DrawingTemplates): Json {
  const { [FIB_KIND]: _fib, ...rest } = t; void _fib;
  return { templates: rest };
}
export function encodeFibTemplates(t: DrawingTemplates): Json {
  return { templates: mapStyles(t[FIB_KIND] ?? {}, FIB_KIND, encodeFib) };
}
export function decodeSimpleTemplates(raw: unknown): DrawingTemplates {
  const { [FIB_KIND]: _fib, ...rest } = parseDrawingTemplates((raw as { templates?: unknown } | null)?.templates);
  void _fib;
  return rest;
}
export function decodeFibTemplates(raw: unknown): Record<string, Partial<DrawingStyle>> {
  const templates = (raw as { templates?: Record<string, unknown> } | null)?.templates;
  if (!templates || typeof templates !== 'object') return {};
  const decoded = Object.fromEntries(Object.entries(templates).map(([name, style]) => [name, decodeFib(style)]));
  return parseDrawingTemplates({ [FIB_KIND]: decoded })[FIB_KIND] ?? {};
}

export function encodeTemplates(t: Record<string, Appearance>): Json {
  return { templates: Object.fromEntries(Object.entries(t).map(([name, a]) => [name, encodeAppearance(a)])) };
}
export function decodeTemplates(raw: unknown): Record<string, Appearance> {
  const templates = (raw as { templates?: Record<string, unknown> } | null)?.templates;
  if (!templates || typeof templates !== 'object') return {};
  return Object.fromEntries(Object.entries(templates).slice(0, 100).map(([name, a]) => [name, parseAppearance(a)]));
}

/**
 * S7.1: eski tarayıcı kaydında görünüm sembol başına belgede durdu. Tek kullanıcı değeri için: varsayılandan farklı belge görünümlerinden
 * en sık geçeni; yoksa kayıt kökündeki görünüm.
 */
export function pickLegacyAppearance(raw: unknown): Appearance | null {
  if (!raw || typeof raw !== 'object') return null;
  const saved = raw as { appearance?: unknown; documents?: Record<string, { appearance?: unknown } | undefined> };
  const counts = new Map<string, { n: number; a: Appearance }>();
  for (const doc of Object.values(saved.documents ?? {})) {
    if (!doc || doc.appearance === undefined) continue;
    const a = parseAppearance(doc.appearance), id = JSON.stringify(encodeAppearance(a));
    if (id === '{}') continue;
    counts.set(id, { n: (counts.get(id)?.n ?? 0) + 1, a });
  }
  const best = [...counts.values()].sort((x, y) => y.n - x.n)[0];
  if (best) return best.a;
  return saved.appearance === undefined ? null : parseAppearance(saved.appearance);
}

/**
 * Depolar (grafik çalışma alanı, analiz tercihleri) değeri kendileri uygulamaz: `writeChartPref` değeri kullanıcı tercihlerine yazdırır,
 * oradan geri uygulanır (iyimser, hatada eski değere döner; okuma bitmeden yazma reddedilir). Kayıtlı yazıcı yoksa (yalnız testlerde) `fallback` yerel uygular.
 */
type Writer = (key: ChartPrefKey, value: Record<string, unknown>) => void;
let writer: Writer | null = null;
export const registerChartPrefWriter = (w: Writer) => { writer = w; };
export function writeChartPref(key: ChartPrefKey, value: Record<string, unknown>, fallback: () => void): void {
  if (writer) writer(key, value);
  else fallback();
}
