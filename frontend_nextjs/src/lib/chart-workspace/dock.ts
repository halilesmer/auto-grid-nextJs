import { toRatio, type Box, type ToolbarLayout } from './toolbar';

/*
 * Serbest paket yerleşimi (UI-17, plan 1106-A1). Saf fonksiyonlar, React yok.
 * Sekiz paket dört yere konur: row1 (başlık), row2, bottom (sıralı listeler) ve free (grafik üstü, x/y oranı 0–1).
 * `account` (hesap + DEMO) paket değildir: sürüklenmez, row1'de tam bir kez durur ve sırada yer tutar.
 * Satır içi serbest konum `pos[id]`: paketin sol kenarı, satır genişliğinin oranı (1 = sağ uca yaslı).
 * `pos` yoksa paket komşusunun yanına dizilir. Kendiliğinden boşluk yoktur.
 */
export const DOCK_PACKAGES = ['symbol', 'actions', 'timeframes', 'formations', 'view', 'indicators', 'edit', 'window'] as const;
export type PackageId = typeof DOCK_PACKAGES[number];
export const ACCOUNT = 'account' as const;
export type DockItem = PackageId | typeof ACCOUNT;
export const DOCK_ROWS = ['row1', 'row2', 'bottom'] as const;
export type DockRow = typeof DOCK_ROWS[number];
export type DockZone = DockRow | 'free';
export interface DockLayout {
  row1: DockItem[];
  row2: DockItem[];
  bottom: DockItem[];
  free: Partial<Record<PackageId, { x: number; y: number }>>;
  pos: Partial<Record<PackageId, number>>;
}

/** Satır sığmayınca önce küçülen paket önde. */
export const SHRINK_ORDER: readonly PackageId[] = ['formations', 'timeframes', 'actions', 'indicators', 'view', 'edit', 'window', 'symbol'];
/** Komşuya ya da sağ uca yapışma payı (px). */
export const DOCK_SNAP = 14;

const ratio = (v: number) => Math.max(0, Math.min(1, v));
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPackage = (v: unknown): v is PackageId => typeof v === 'string' && (DOCK_PACKAGES as readonly string[]).includes(v);

export const defaultDockLayout = (): DockLayout => ({
  row1: ['symbol', ACCOUNT, 'actions'],
  row2: ['timeframes', 'formations'],
  bottom: ['view', 'indicators', 'edit', 'window'],
  free: {},
  pos: {},
});

/** Bozuk kaydı onarır: bilinmeyen id atılır, çiftler tekilleşir, eksik paket varsayılan yerine girer, oranlar 0–1'e kırpılır. */
export function parseDockLayout(raw: unknown): DockLayout {
  const def = defaultDockLayout();
  if (!raw || typeof raw !== 'object') return def;
  const r = raw as Record<string, unknown>;
  const seen = new Set<string>();
  const out: DockLayout = { row1: [], row2: [], bottom: [], free: {}, pos: {} };
  for (const zone of DOCK_ROWS) {
    const list = Array.isArray(r[zone]) ? r[zone] as unknown[] : [];
    for (const id of list) {
      if (id === ACCOUNT ? zone !== 'row1' : !isPackage(id)) continue;
      if (seen.has(id as string)) continue;
      seen.add(id as string);
      out[zone].push(id as DockItem);
    }
  }
  const free = r.free && typeof r.free === 'object' ? r.free as Record<string, unknown> : {};
  for (const id of DOCK_PACKAGES) {
    const p = free[id] as Partial<{ x: unknown; y: unknown }> | undefined;
    if (seen.has(id) || !p || typeof p !== 'object' || !isNum(p.x) || !isNum(p.y)) continue;
    seen.add(id);
    out.free[id] = { x: ratio(p.x), y: ratio(p.y) };
  }
  // Eksik öğe varsayılan yerine girer (varsayılan sıra kadar, listeye sığdırılarak)
  for (const zone of DOCK_ROWS) def[zone].forEach((id, i) => {
    if (seen.has(id)) return;
    seen.add(id);
    out[zone].splice(Math.min(i, out[zone].length), 0, id);
  });
  const pos = r.pos && typeof r.pos === 'object' ? r.pos as Record<string, unknown> : {};
  for (const id of DOCK_PACKAGES) {
    const v = pos[id];
    if (isNum(v) && DOCK_ROWS.some(z => out[z].includes(id))) out.pos[id] = ratio(v);
  }
  return out;
}

/** Eski araç grubu kaydından (UI-16) geçiş: top → row1 sonu, bottom → bottom, free → aynı oranla free. */
export function migrateToolbarLayout(v1: ToolbarLayout): DockLayout {
  let layout = defaultDockLayout();
  for (const id of ['view', 'indicators', 'edit', 'window'] as const) {
    const p = v1[id];
    if (!p) continue;
    if (p.zone === 'top') layout = moveToRow(layout, id, 'row1', layout.row1.length);
    else if (p.zone === 'bottom') layout = moveToRow(layout, id, 'bottom', layout.bottom.length);
    else if (p.zone === 'free') layout = moveToFree(layout, id, { x: p.x, y: p.y });
  }
  return parseDockLayout(layout);
}

function without(layout: DockLayout, id: PackageId): DockLayout {
  const next: DockLayout = { row1: layout.row1.filter(x => x !== id), row2: layout.row2.filter(x => x !== id), bottom: layout.bottom.filter(x => x !== id), free: { ...layout.free }, pos: { ...layout.pos } };
  delete next.free[id]; delete next.pos[id];
  return next;
}
/** Paketi satıra koyar (index: paket çıkarıldıktan sonraki listede). `x` verilirse boşluktaki yer olarak saklanır. Eski `pos`/`free` kaydı silinir. */
export function moveToRow(layout: DockLayout, id: PackageId, zone: DockRow, index: number, x?: number): DockLayout {
  const next = without(layout, id);
  const i = Math.max(0, Math.min(Math.trunc(index), next[zone].length));
  next[zone].splice(i, 0, id);
  if (x !== undefined && isNum(x)) next.pos[id] = ratio(x);
  return next;
}
export function moveToFree(layout: DockLayout, id: PackageId, at: { x: number; y: number }): DockLayout {
  const next = without(layout, id);
  next.free[id] = { x: ratio(at.x), y: ratio(at.y) };
  return next;
}
/** Yerleşim varsayılanla aynı mı (sıfırla düğmesi pasif olur). */
export const isDefaultDockLayout = (layout: DockLayout) => JSON.stringify(layout) === JSON.stringify(defaultDockLayout());
/** Paketi komşusunun yanına dizer (`pos` siler). */
export function packPackage(layout: DockLayout, id: PackageId): DockLayout {
  const pos = { ...layout.pos };
  delete pos[id];
  return { ...layout, pos };
}
/** Bırakılan ya da kaydırılan serbest konumu (kap pikseli) orana çevirir. */
export const freeRatio = (left: number, top: number, area: Box) => toRatio(left, top, area);

/**
 * Satır içi yerleşim: her öğenin sol boşluğu (px). Soldan açgözlü: istenen konumu olan paket oraya,
 * ama soldaki komşusunun üstüne binmeden; istenmeyen komşunun hemen yanına gelir.
 * Sağa taşarsa boşluklar sağdan başlayarak daralır.
 */
export function rowMargins(widths: number[], wants: (number | undefined)[], rowWidth: number, gap: number): number[] {
  const margins: number[] = [];
  let cursor = 0;
  widths.forEach((w, i) => {
    const want = wants[i];
    const left = want == null ? cursor : Math.max(want, cursor);
    margins.push(left - cursor);
    cursor = left + w + gap;
  });
  let excess = cursor - gap - rowWidth;
  for (let i = margins.length - 1; i >= 0 && excess > 0; i--) {
    const take = Math.min(margins[i], excess);
    margins[i] -= take; excess -= take;
  }
  return margins;
}

/**
 * Bırakılan paketin satırdaki yeri: komşuya ≤ snap px ise `undefined` (komşunun yanı), sağ uca ≤ snap px ise `1`, aksi hâlde oran.
 * `left` = paketin sol kenarı (satır solundan px), `packedLeft` = boşluksuz dizilince sol kenarı.
 */
export function dropPosition(left: number, packedLeft: number, rowWidth: number, pkgWidth: number, snap = DOCK_SNAP): number | undefined {
  if (rowWidth <= 0) return undefined;
  const w = Math.min(pkgWidth, rowWidth * 0.6), l = Math.max(0, left);
  if (l >= rowWidth - w - snap) return 1;
  if (l - packedLeft <= snap) return undefined;
  return ratio(l / rowWidth);
}
