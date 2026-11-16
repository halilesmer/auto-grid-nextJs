import type { Indicator } from './indicators';
import { isSystemRsi } from './indicators';
import { parseIndicators } from './indicatorStorage';
import { parsePaneOrder } from './paneOrder';
import type { ChartDocument } from '@/store/useChartWorkspaceStore';

/**
 * USR-17 (plan 1114-A3): RSI ve EWO her üründe aynı ayarlarla açılır ("standart"). Mod ve standart değerler kullanıcıya aittir
 * (`chart_osc_scope`, `chart_osc_standard`). Standart modda RSI/EWO göstergeleri (parametre, renk, stil, görünürlük, daraltma),
 * panel yüksekliği ve panel sırası standarttan okunur; ürün belgesindeki kayıtlar silinmez, yalnız yok sayılır.
 * Bu dosya saf veridir (React yok): okuma, yazma biçimi, belgeyle birleştirme ve ayırma.
 */
export type OscScope = 'standard' | 'product';
export interface OscStandard {
  /** Yalnız RSI ve EWO türleri; yoksa varsayılan RSI(7) + EWO geçerlidir. */
  indicators?: Indicator[];
  paneOrder?: string[];
  paneHeights?: Record<string, number>;
}

export const isStandardKind = (indicator: Pick<Indicator, 'kind'>) => indicator.kind === 'RSI' || indicator.kind === 'EWO';
export const parseOscScope = (raw: unknown): OscScope => (raw && typeof raw === 'object' && (raw as { mode?: unknown }).mode === 'product' ? 'product' : 'standard');

function parseHeights(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const parts = Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 100).slice(0, 50)) as Record<string, number>;
  return Object.keys(parts).length ? parts : undefined;
}

/** Worker'dan gelen değeri okur; boş ya da geçersizse null (varsayılan standart). */
export function parseOscStandard(raw: unknown): OscStandard | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const indicators = Array.isArray(r.indicators) ? parseIndicators(r.indicators).filter(isStandardKind) : undefined;
  const paneOrder = parsePaneOrder(r.paneOrder), paneHeights = parseHeights(r.paneHeights);
  if (!indicators && !paneOrder && !paneHeights) return null;
  return { ...(indicators ? { indicators } : {}), ...(paneOrder ? { paneOrder } : {}), ...(paneHeights ? { paneHeights } : {}) };
}
export const encodeOscStandard = (s: OscStandard | null): Record<string, unknown> => (s ? { ...s } : {});

/** Standart modda gösterge listesi: ürünün diğer göstergeleri, sonra standardın RSI/EWO'su. */
export const standardIndicators = (own: readonly Indicator[], std: OscStandard | null, fallback: readonly Indicator[]): Indicator[] =>
  [...own.filter(item => !isStandardKind(item)), ...(std?.indicators ?? fallback)];

/**
 * Standart modda belgenin RSI/EWO kısmı standarttan gelir; diğer göstergeler, çizimler ve katmanlar belgede kalır.
 * `indicators`: çağıran `standardIndicators` sonucunu kendisi önbelleğe alabilir (ANA-27: görünüm kaydı gibi gösterge dışı bir
 * değişiklik göstergelerin kimliğini değiştirmemeli, yoksa grafik bütün göstergeleri yeniden hesaplar).
 */
export function composeStandard(own: ChartDocument, std: OscStandard | null, fallback: readonly Indicator[], indicators = standardIndicators(own.indicators, std, fallback)): ChartDocument {
  return {
    ...own,
    indicators,
    paneOrder: std?.paneOrder,
    paneHeights: std?.paneHeights,
  };
}

/** Birleşik belgeden standart kısmı çıkarır (karşılaştırma ve yazma için; anahtar sırası sabittir). */
export function standardOf(doc: ChartDocument): OscStandard {
  return {
    indicators: doc.indicators.filter(isStandardKind),
    ...(doc.paneOrder ? { paneOrder: doc.paneOrder } : {}),
    ...(doc.paneHeights ? { paneHeights: doc.paneHeights } : {}),
  };
}

/** Kayıtta: birleşik belge ürün parçasına ve standart parçasına ayrılır; ürünün kendi RSI/EWO kaydı, sırası ve yükseklikleri olduğu gibi kalır. */
export function splitStandard(next: ChartDocument, own: ChartDocument): { std: OscStandard; product: ChartDocument } {
  const others = next.indicators.filter(item => !isStandardKind(item));
  return {
    std: standardOf(next),
    product: {
      ...next,
      // Ürünün diğer göstergeleri aynı nesnelerse (yalnız çizim ya da görünüm kaydı) eski dizi kalır, sırası ne olursa olsun:
      // kimlik değişmez, grafik göstergeleri yeniden hesaplamaz (ANA-27)
      indicators: sameItems(others, own.indicators.filter(item => !isStandardKind(item))) ? own.indicators : [...own.indicators.filter(isStandardKind), ...others],
      paneOrder: own.paneOrder,
      paneHeights: own.paneHeights,
    },
  };
}

const sameItems = <T>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every((item, i) => item === b[i]);

/** Biçimden bağımsız eşitlik: yazmadan önce değişiklik var mı. */
export const sameStandard = (a: OscStandard, b: OscStandard) => JSON.stringify(a) === JSON.stringify(b);

/** Sistem RSI ayarı, formasyon kuralları ve katman göstergesi için: standart modda standarttan. */
export function systemRsiOf(
  s: { documents: Record<string, ChartDocument | undefined>; oscScope: OscScope; oscStandard: OscStandard | null },
  key: string | undefined,
): Indicator | undefined {
  if (s.oscScope === 'standard') return s.oscStandard?.indicators?.find(isSystemRsi);
  return key ? s.documents[key]?.indicators.find(isSystemRsi) : undefined;
}

/** Ürün belgesinde kullanıcının bıraktığı osilatör kaydı var mı (panel yüksekliği, sıra ya da eklenmiş RSI/EWO); ayar penceresindeki bilgi için. */
export const hasProductOscillators = (doc: ChartDocument): boolean =>
  !!doc.paneHeights || !!doc.paneOrder || doc.indicators.some(item => isStandardKind(item) && item.id !== 'system-rsi' && item.id !== 'initial-EWO' && item.id !== 'initial-RSI');
