'use client';

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { useReducedMotion } from 'motion/react';
import { useT, type MessageKey } from '@/i18n';
import { defaultDockLayout, DOCK_SNAP, dropPosition, isDefaultDockLayout, moveToFree, moveToRow, packPackage, rowMargins, SHRINK_ORDER, type DockItem, type DockLayout, type PackageId } from '@/lib/chart-workspace/dock';
import { nudgeStep, placeFree, toRatio, type FreeArea } from '@/lib/chart-workspace/toolbar';
import { useChartWorkspaceStore } from '@/store/useChartWorkspaceStore';

/*
 * Serbest paket yerleşimi (UI-17, plan 1106-A1, journal 2026-11-06-free-package-layout). Yuva altyapısı:
 *  - Her paket (`DockPackage`) kendi kutusunu (`.dock-wrap`) bir kez kurar; içeriği React portalıdır. Kutu hiç yeniden kurulmaz,
 *    yalnız DOM'da satırdan satıra taşınır: durum, odak ve açık menüler yerinde kalır, sekme sırası görünen sıradır.
 *  - Satırlar (`DockRow`: Satır 1 başlıkta, alt çubuk grafikte) ve grafik yüzeyi (free) kendilerini buraya kaydeder.
 *  - Sürükleme, ekleme çizgisi (kesik çizgili kutu), boşluk (`pos`) ve yumuşak yerleşme (elle FLIP, Web Animations) burada yürür.
 *    `motion`'ın layoutId'si yeniden kurulan öğeleri bağlar; kutular kurulmadığı için burada elle FLIP gerekir (journal S2 bölümü).
 */
export type DockPlace = 'row1' | 'row2' | 'bottom' | 'free';
export type DockRowZone = 'row1' | 'row2' | 'bottom';
export type DockAction = 'row1' | 'row2' | 'bottom' | 'free' | 'left' | 'right' | 'pack' | 'reset';
/** Bir paketin ok menüsü için arayüzü: kutudaki düğmeleri gizler/gösterir. */
export interface FitApi { reset: () => void; canHide: () => boolean; hideNext: () => void }

interface Wrap { el: HTMLElement; fit: FitApi }
/** `index`: kayıtlı listedeki yer, `visible`: görünen kutular arasındaki yer (ekleme çizgisi için) */
type Target = { zone: DockRowZone; index: number; x: number | undefined; visible: number } | { zone: 'free' };
interface Drag { id: PackageId; pid: number; sx: number; sy: number; x: number; y: number; touch: boolean; active: boolean; wrap: HTMLElement; offX: number; offY: number; w: number; h: number; target: Target | null }

export interface DockApi {
  layout: DockLayout;
  phone: boolean;
  setPhone: (phone: boolean) => void;
  dragging: boolean;
  placeOf: (id: PackageId) => DockPlace;
  menuUp: (id: PackageId) => boolean;
  hasIn: (zone: DockRowZone) => boolean;
  registerRow: (zone: DockRowZone, el: HTMLElement | null) => void;
  registerChart: (el: HTMLElement | null) => void;
  registerPackage: (id: PackageId, el: HTMLElement | null, fit?: FitApi) => void;
  refit: () => void;
  startDrag: (id: PackageId, e: ReactPointerEvent<HTMLElement>) => void;
  moveDrag: (e: ReactPointerEvent<HTMLElement>) => void;
  endDrag: (e: ReactPointerEvent<HTMLElement> | null, commit: boolean) => void;
  consumeClick: () => boolean;
  keyDown: (id: PackageId, e: ReactKeyboardEvent<HTMLElement>) => void;
  menuInfo: (id: PackageId) => { place: DockPlace; hasRow2: boolean; canLeft: boolean; canRight: boolean; canPack: boolean; isDefault: boolean };
  act: (id: PackageId, action: DockAction) => void;
}

const Ctx = createContext<DockApi | null>(null);
/** Sayfa kökünde DockProvider yoksa null: ChartWorkspace eski düz çubuğa döner. */
export const useDock = () => useContext(Ctx);

const GAP = 2;
const ZONES = ['row1', 'row2', 'bottom'] as const;
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const DRAG_THRESHOLD = { mouse: 5, touch: 10 };

function freeArea(chart: HTMLElement): FreeArea {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const page = chart.closest<HTMLElement>('[data-testid="formation-main"]') ?? chart;
  // lg ve üstünde sayfa başlığı grafiğin üstüne biner (ChartPage, --chart-top); serbest paket onun altında başlar
  const inset = window.matchMedia('(min-width: 64rem)').matches ? parseFloat(getComputedStyle(page).getPropertyValue('--chart-top')) || 0 : 0;
  // Alt çubuk görünürken serbest alan onun üstünde biter (R2-05): çubuk `bottom-8` yukarıda durur ve yüksektir, sabit 8 px paketi üstüne bindirirdi.
  // Çubuğun üstü aynı zamanda `--workspace-card` ile küçülen grafik alanının alt sınırıdır.
  const card = chart.querySelector<HTMLElement>('[data-dock-card]'), cardTop = card && card.offsetHeight > 0 ? chart.getBoundingClientRect().bottom - card.getBoundingClientRect().top : 0;
  return { width: chart.clientWidth, height: chart.clientHeight, left: 60, top: 8 + inset, bottom: Math.max(8, cardTop + 8), right: 5 * rem };
}

/** Bir bölgenin sıralı listesi; Satır 2 kayıtlı değilse (Setup/Frei) onun paketleri alt çubuğa düşer. */
function listOf(l: DockLayout, zone: DockRowZone, hasRow2: boolean, fb: DockItem[]): DockItem[] {
  if (zone !== 'bottom') return l[zone];
  return [...l.bottom, ...(hasRow2 ? [] : l.row2), ...fb];
}

export function DockProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const stored = useChartWorkspaceStore(s => s.dockLayout), setStored = useChartWorkspaceStore(s => s.setDockLayout), resetStored = useChartWorkspaceStore(s => s.resetDockLayout);
  const reduce = useReducedMotion() ?? false;
  const [phone, setPhone] = useState(false);
  const [present, setPresent] = useState<PackageId[]>([]);
  const [fallback, setFallback] = useState<PackageId[]>([]);
  const [dragging, setDragging] = useState(false);
  const [live, setLive] = useState('');
  const [rev, setRev] = useState(0);
  // Satır 2 yalnız Formation modunun başlığında var; yoksa oradaki paketler çizimde alt çubuğa düşer, kayıt aynı kalır (S3)
  const [row2On, setRow2On] = useState(false);
  // 30 rem altında sabit telefon düzeni (S5 sürer); kayıt silinmez
  const layout = useMemo(() => phone ? defaultDockLayout() : stored, [phone, stored]);

  const rows = useRef<Partial<Record<DockRowZone, HTMLElement>>>({}), chart = useRef<HTMLElement | null>(null), wraps = useRef(new Map<PackageId, Wrap>());
  const layoutRef = useRef(layout), presentRef = useRef(present), fallbackRef = useRef(fallback), phoneRef = useRef(phone), reduceRef = useRef(reduce);
  const dragRef = useRef<Drag | null>(null), ghostRef = useRef<HTMLElement | null>(null), slotRef = useRef<HTMLElement | null>(null), raf = useRef(0);
  const suppress = useRef(false), focusAfter = useRef<PackageId | null>(null), pendingFlip = useRef<{ before: Map<string, DOMRect>; from: Record<string, DOMRect> } | null>(null), fitQueued = useRef(false);
  useLayoutEffect(() => { layoutRef.current = layout; presentRef.current = present; fallbackRef.current = fallback; phoneRef.current = phone; reduceRef.current = reduce; });

  const placeOf = useCallback((id: PackageId): DockPlace => {
    if (layout.row1.includes(id)) return 'row1';
    if (layout.row2.includes(id)) return row2On ? 'row2' : 'bottom';
    if (layout.free[id]) return fallback.includes(id) ? 'bottom' : 'free';
    return 'bottom';
  }, [layout, fallback, row2On]);
  /** Bir satırın görünen paketleri, DOM sırasıyla aynı sırada (sekme sırası). */
  const orderOf = (zone: DockRowZone, l = layoutRef.current): PackageId[] => {
    const list = listOf(l, zone, !!rows.current.row2, fallbackRef.current);
    return list.filter((id): id is PackageId => id !== 'account' && presentRef.current.includes(id));
  };

  const registerRow = useCallback((zone: DockRowZone, el: HTMLElement | null) => {
    if ((rows.current[zone] ?? null) === el) return;
    if (el) rows.current[zone] = el; else delete rows.current[zone];
    if (zone === 'row2') setRow2On(!!el);
    setRev(r => r + 1);
  }, []);
  const registerChart = useCallback((el: HTMLElement | null) => {
    if (chart.current === el) return;
    chart.current = el; setRev(r => r + 1);
  }, []);
  const registerPackage = useCallback((id: PackageId, el: HTMLElement | null, fit?: FitApi) => {
    if (el && fit) { wraps.current.set(id, { el, fit }); setPresent(p => p.includes(id) ? p : [...p, id]); }
    else { wraps.current.delete(id); setPresent(p => p.filter(x => x !== id)); }
  }, []);

  // --- Yerleştirme: kutular kayıtlı sırayla satırlara ve grafiğe konur ---
  const rowEls = (zone: DockRowZone) => [...(rows.current[zone]?.children ?? [])].filter((c): c is HTMLElement => c instanceof HTMLElement && c.classList.contains('dock-wrap') && !c.classList.contains('dock-src'));
  const layoutRow = (zone: DockRowZone) => {
    const row = rows.current[zone], W = row?.clientWidth ?? 0;
    if (!row || W <= 0) return;
    if (phoneRef.current) { [...row.children].forEach(k => { (k as HTMLElement).style.marginLeft = ''; }); return; }
    const kids = [...row.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.matches('.dock-wrap:not(.dock-src), .dock-ph'));
    const wants = kids.map(k => {
      if (k.classList.contains('dock-ph')) return k.dataset.left ? Number(k.dataset.left) : undefined;
      const pos = layoutRef.current.pos[k.dataset.dockWrap as PackageId];
      return pos == null ? undefined : pos * W;
    });
    const margins = rowMargins(kids.map(k => k.offsetWidth), wants, W, GAP);
    kids.forEach((k, i) => { k.style.marginLeft = margins[i] > 0.5 ? `${Math.round(margins[i])}px` : ''; });
  };
  // Sığdırma: satır tek sıra kalır. Sığmazsa SHRINK_ORDER sırasıyla paketin sondaki düğmesi ok menüsüne geçer; ölçü her seferinde
  // doğal genişlikten başlar (düğme bir sığar bir sığmaz → titreme yok); data-keep ve her paketin ilk düğmesi satırda kalır.
  const fitRow = (zone: DockRowZone) => {
    const row = rows.current[zone];
    if (!row) return;
    const kids = rowEls(zone), ids = kids.map(k => k.dataset.dockWrap as PackageId);
    ids.forEach(id => wraps.current.get(id)?.fit.reset());
    // Telefon (kap < 30 rem, plan 1106-A1.5): sabit düzen, satır kırılır, ok menüsü yok
    if (phoneRef.current || row.clientWidth <= 0) return;
    const need = () => kids.reduce((s, k) => s + k.offsetWidth, 0) + GAP * Math.max(0, kids.length - 1);
    for (let guard = 0; guard < 80 && need() > row.clientWidth; guard++) {
      const id = SHRINK_ORDER.find(x => ids.includes(x) && wraps.current.get(x)?.fit.canHide());
      if (!id) break;
      wraps.current.get(id)!.fit.hideNext();
    }
  };
  const fitAll = () => { for (const zone of ZONES) { fitRow(zone); layoutRow(zone); } };
  const placeAll = () => {
    const l = layoutRef.current, host = chart.current, fb: PackageId[] = [];
    const area = host ? freeArea(host) : null;
    for (const id of Object.keys(l.free) as PackageId[]) {
      const w = wraps.current.get(id);
      if (!w) continue;
      if (!host || !area) { fb.push(id); continue; } // grafik yüzeyi henüz kayıtlı değil
      if (w.el.parentNode !== host) host.append(w.el);
      w.el.classList.add('dock-free'); w.el.style.marginLeft = '';
      const pos = placeFree(l.free[id]!, { width: w.el.offsetWidth, height: w.el.offsetHeight }, area);
      if (pos) { w.el.style.left = `${Math.round(pos.left)}px`; w.el.style.top = `${Math.round(pos.top)}px`; w.fit.reset(); }
      else fb.push(id); // sığmıyor: çizimde alt çubukta, kayıt aynı
    }
    for (const zone of ZONES) {
      const row = rows.current[zone];
      if (!row) continue;
      const order = (listOf(l, zone, !!rows.current.row2, fb)).filter((id): id is PackageId => id !== 'account' && wraps.current.has(id));
      const want = order.map(id => wraps.current.get(id)!.el);
      [...row.children].forEach(c => { if (c.classList.contains('dock-wrap') && !want.includes(c as HTMLElement)) c.remove(); });
      want.forEach((el, i) => {
        if (row.children[i] !== el) row.insertBefore(el, row.children[i] ?? null);
        el.classList.remove('dock-free'); el.style.left = ''; el.style.top = '';
      });
    }
    // Hiçbir satırda ve grafikte yeri olmayan paket (satır henüz kayıtlı değil): kutu bağsız kalır, satır gelince yerleşir
    setFallback(prev => sameList(prev, fb) ? prev : fb);
    fitAll();
  };
  const refit = useCallback(() => {
    if (fitQueued.current) return;
    fitQueued.current = true;
    queueMicrotask(() => { fitQueued.current = false; if (!dragRef.current?.active) fitAll(); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Animasyon (FLIP): önce ölç, yeni yerleşimi çiz, farkı kapat ---
  const snapshot = () => new Map([...document.querySelectorAll<HTMLElement>('[data-dock-wrap]')].map(el => [el.dataset.dockWrap!, el.getBoundingClientRect()]));
  const playFlip = (before: Map<string, DOMRect>, from: Record<string, DOMRect> = {}) => {
    if (reduceRef.current) return;
    const css = getComputedStyle(document.documentElement), card = css.getPropertyValue('--card').trim(), primary = css.getPropertyValue('--primary').trim();
    document.querySelectorAll<HTMLElement>('[data-dock-wrap]').forEach(el => {
      const id = el.dataset.dockWrap!, a = from[id] ?? before.get(id);
      if (!a) return;
      const b = el.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top, lifted = id in from;
      if (!lifted && Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: lifted ? 380 : 280, easing: EASE });
      if (lifted) el.querySelector<HTMLElement>('[data-dock-pkg]')?.animate([{ backgroundColor: card, borderColor: primary, boxShadow: '0 14px 32px #000b' }], { duration: 380, easing: EASE });
    });
  };

  // Her çizimden sonra: kutuları yerleştir; bekleyen animasyonu oynat; odağı taşınan paketin tutamacına ver
  useLayoutEffect(() => {
    if (dragRef.current?.active) return;
    placeAll();
    const flip = pendingFlip.current;
    if (flip) { pendingFlip.current = null; playFlip(flip.before, flip.from); }
    const id = focusAfter.current;
    if (id) { focusAfter.current = null; document.querySelector<HTMLElement>(`[data-dock-handle="${id}"]`)?.focus(); }
  });
  // Satır ya da grafik boyutu değişince (pencere, kenar çubuğu) yeniden sığdır
  useEffect(() => {
    const observer = new ResizeObserver(() => { if (!dragRef.current?.active) placeAll(); });
    for (const el of [rows.current.row1, rows.current.row2, rows.current.bottom, chart.current]) if (el) observer.observe(el);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev]);

  // --- Düzen değişikliği (menü, klavye): FLIP ile ---
  const apply = (next: DockLayout, id: PackageId, message?: string) => {
    pendingFlip.current = { before: snapshot(), from: {} };
    focusAfter.current = id;
    if (message) setLive(message);
    setStored(next); setRev(r => r + 1);
  };
  const groupName = (id: PackageId) => t(`cw.tbGroup.${id}` as MessageKey);
  const ZONE_KEY: Record<DockPlace, MessageKey> = { row1: 'cw.tbDropRow1', row2: 'cw.tbDropRow2', bottom: 'cw.tbDropBottom', free: 'cw.tbDropFree' };
  const zoneName = (zone: DockPlace) => t(ZONE_KEY[zone]);
  const menuInfo = (id: PackageId) => {
    const place = placeOf(id), inRow = place !== 'free', order = inRow ? orderOf(place as DockRowZone, layout) : [], i = order.indexOf(id);
    return { place, hasRow2: row2On, canLeft: inRow && i > 0, canRight: inRow && i >= 0 && i < order.length - 1, canPack: inRow && layout.pos[id] != null, isDefault: isDefaultDockLayout(stored) };
  };
  const reorder = (id: PackageId, dir: -1 | 1) => {
    const place = placeOf(id);
    if (place === 'free') return false;
    const order = orderOf(place, layout), neighbor = order[order.indexOf(id) + dir];
    if (!neighbor) return false;
    const list = layout[place].filter(x => x !== id), ni = list.indexOf(neighbor);
    if (ni < 0) return false;
    apply(moveToRow(layout, id, place, dir < 0 ? ni : ni + 1), id, `${groupName(id)} → ${zoneName(place)}`);
    return true;
  };
  const act = (id: PackageId, action: DockAction) => {
    if (action === 'reset') { pendingFlip.current = { before: snapshot(), from: {} }; focusAfter.current = id; setLive(t('cw.tbReset')); resetStored(); setRev(r => r + 1); return; }
    if (action === 'row1' || action === 'row2' || action === 'bottom') apply(moveToRow(layout, id, action, layout[action].length), id, `${groupName(id)} → ${zoneName(action)}`);
    else if (action === 'free') apply(moveToFree(layout, id, { x: 0.12, y: 0.12 * (Object.keys(layout.free).filter(x => x !== id).length + 1) }), id, `${groupName(id)} → ${zoneName('free')}`);
    else if (action === 'pack') apply(packPackage(layout, id), id);
    else reorder(id, action === 'left' ? -1 : 1);
  };
  const keyDown = (id: PackageId, e: ReactKeyboardEvent<HTMLElement>) => {
    if (phoneRef.current || dragRef.current?.active || e.altKey || e.ctrlKey || e.metaKey || !e.key.startsWith('Arrow') || e.currentTarget.getAttribute('aria-expanded') === 'true') return;
    const place = placeOf(id), k = e.key, host = chart.current, wrap = wraps.current.get(id)?.el;
    if (!wrap) return;
    if (place === 'free') {
      if (!host) return;
      e.preventDefault();
      const step = nudgeStep(e.shiftKey), dx = { ArrowLeft: -1, ArrowRight: 1 }[k] ?? 0, dy = { ArrowUp: -1, ArrowDown: 1 }[k] ?? 0, box = { width: host.clientWidth, height: host.clientHeight };
      const next = placeFree(toRatio(wrap.offsetLeft + dx * step * box.width, wrap.offsetTop + dy * step * box.height, box), { width: wrap.offsetWidth, height: wrap.offsetHeight }, freeArea(host));
      if (next) apply(moveToFree(layout, id, toRatio(next.left, next.top, box)), id);
      return;
    }
    if (e.shiftKey && (k === 'ArrowLeft' || k === 'ArrowRight')) {
      // Shift + ← →: satırın boşluğunda kaydır (satır genişliğinin %4'ü)
      const row = rows.current[place];
      if (!row || row.clientWidth <= 0) return;
      e.preventDefault();
      const left = wrap.getBoundingClientRect().left - row.getBoundingClientRect().left + (k === 'ArrowLeft' ? -0.04 : 0.04) * row.clientWidth;
      apply({ ...layout, pos: { ...layout.pos, [id]: clamp01(left / row.clientWidth) } }, id);
    } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
      if (reorder(id, k === 'ArrowLeft' ? -1 : 1)) e.preventDefault();
    } else if (k === 'ArrowUp' || k === 'ArrowDown') {
      // ↑/↓: Satır 1 ↔ Satır 2 ↔ Alt çubuk (Satır 2 yoksa doğrudan Satır 1 ↔ Alt çubuk)
      const seq: DockRowZone[] = ['row1', ...(row2On ? ['row2' as const] : []), 'bottom'], to = seq[seq.indexOf(place) + (k === 'ArrowUp' ? -1 : 1)];
      if (!to) return;
      e.preventDefault();
      act(id, to);
    }
  };

  // --- Sürükleme ---
  const hitEl = (zone: DockRowZone) => zone === 'bottom' ? rows.current.bottom?.closest<HTMLElement>('[data-dock-card]') ?? rows.current.bottom : rows.current[zone];
  const inside = (el: Element | null | undefined, x: number, y: number) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
  function rowTarget(d: Drag, zone: DockRowZone, x: number): Target {
    const row = rows.current[zone]!, sr = row.getBoundingClientRect(), W = row.clientWidth, els = rowEls(zone).filter(el => el.dataset.dockWrap !== d.id);
    let vi = els.length;
    for (let i = 0; i < els.length; i++) { const r = els[i].getBoundingClientRect(); if (x < r.left + r.width / 2) { vi = i; break; } }
    const prev = els[vi - 1], packed = prev ? prev.getBoundingClientRect().right - sr.left + GAP : 0;
    const list = layoutRef.current[zone].filter(id => id !== d.id), nid = els[vi]?.dataset.dockWrap as PackageId | undefined;
    const at = nid ? list.indexOf(nid) : -1;
    return { zone, index: at >= 0 ? at : list.length, x: dropPosition(Math.max(0, x - d.offX - sr.left), packed, W, d.w, DOCK_SNAP), visible: vi };
  }
  function targetAt(d: Drag): Target | null {
    for (const zone of ZONES) if (rows.current[zone] && inside(hitEl(zone), d.x, d.y)) return rowTarget(d, zone, d.x);
    // Grafiğe sığmayan paket için orada yer yok: bırakılırsa eski yerine döner
    return chart.current && inside(chart.current, d.x, d.y) && chart.current.clientWidth - 114 >= d.w ? { zone: 'free' } : null;
  }
  function setSlot(d: Drag, target: Target | null) {
    if (!target || target.zone === 'free') { slotRef.current?.remove(); slotRef.current = null; return; }
    const row = rows.current[target.zone]!, W = row.clientWidth, els = rowEls(target.zone).filter(el => el.dataset.dockWrap !== d.id);
    const slot = slotRef.current ?? Object.assign(document.createElement('span'), { className: 'dock-ph' });
    slot.setAttribute('aria-hidden', 'true'); slotRef.current = slot;
    slot.style.width = `${Math.round(Math.min(d.w, W * 0.6))}px`;
    const ref = els[target.visible] ?? null;
    if (slot.parentNode !== row || slot.nextSibling !== ref) row.insertBefore(slot, ref);
    slot.dataset.left = target.x === undefined ? '' : String(target.x * W);
  }
  function makeGhost(d: Drag) {
    const g = document.createElement('div'), label = document.createElement('span');
    g.className = 'dock-ghost'; g.setAttribute('aria-hidden', 'true');
    const inner = d.wrap.querySelector<HTMLElement>('[data-dock-pkg]')!, copy = inner.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('[data-testid], [data-dock-handle], [id]').forEach(x => { x.removeAttribute('data-testid'); x.removeAttribute('data-dock-handle'); x.removeAttribute('id'); });
    copy.removeAttribute('data-dock-pkg'); copy.querySelectorAll('button').forEach(b => { b.tabIndex = -1; });
    copy.style.transformOrigin = `${d.offX}px ${d.offY}px`;
    label.className = 'dock-ghost-label';
    g.append(copy, label); document.body.append(g);
    g.style.transform = `translate3d(${d.x - d.offX}px, ${d.y - d.offY}px, 0)`;
    // Tutunca hafifçe kalkar (imlecin tuttuğu noktadan büyür)
    if (!reduceRef.current) copy.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }], { duration: 180, easing: EASE, fill: 'forwards' });
    return g;
  }
  function paint(d: Drag) {
    const target = d.target, g = ghostRef.current;
    if (!g) return;
    g.style.transform = `translate3d(${d.x - d.offX}px, ${d.y - d.offY}px, 0)`;
    const dest = !target ? t('cw.tbDropNone') : zoneName(target.zone);
    const label = g.querySelector('.dock-ghost-label');
    if (label) label.textContent = `${groupName(d.id)} → ${dest}`;
    for (const zone of ZONES) hitEl(zone)?.setAttribute('data-target', String(target?.zone === zone));
    chart.current?.querySelector('[data-dock-free-hint]')?.setAttribute('data-target', String(target?.zone === 'free'));
    setSlot(d, target);
    for (const zone of ZONES) layoutRow(zone);
  }
  // Sabit kimlikli Esc dinleyicisi: sürükleme sırasında yeniden çizim olsa da aynı işlev eklenir ve kaldırılır
  const endDragRef = useRef<(e: ReactPointerEvent<HTMLElement> | null, commit: boolean) => void>(() => {});
  const [onEsc] = useState(() => (e: KeyboardEvent) => { if (e.key === 'Escape' && dragRef.current?.active) { e.preventDefault(); e.stopPropagation(); endDragRef.current(null, false); } });
  const startDrag = (id: PackageId, e: ReactPointerEvent<HTMLElement>) => {
    const wrap = wraps.current.get(id)?.el;
    if (e.button !== 0 || phoneRef.current || !wrap) return;
    // Önceki sürüklemenin bastırması tıklamasız kaldıysa (paket yer değiştirdi, pointercancel) sıfırlanır
    suppress.current = false;
    const r = wrap.getBoundingClientRect();
    dragRef.current = { id, pid: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse', active: false, target: null, wrap, offX: e.clientX - r.left, offY: e.clientY - r.top, w: r.width, h: r.height };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* yok sayılır */ }
  };
  const moveDrag = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d || d.pid !== e.pointerId) return;
    d.x = e.clientX; d.y = e.clientY;
    if (!d.active) {
      if (Math.hypot(d.x - d.sx, d.y - d.sy) < DRAG_THRESHOLD[d.touch ? 'touch' : 'mouse']) return;
      // Paket yerinden kalkar; komşular boşalan yeri yumuşakça kapatır
      const before = snapshot();
      d.active = true; d.wrap.classList.add('dock-src');
      ghostRef.current = makeGhost(d);
      flushSync(() => setDragging(true));
      for (const zone of ZONES) layoutRow(zone);
      before.delete(d.id); playFlip(before);
      window.addEventListener('keydown', onEsc, true);
    }
    // Kare başına bir çizim: kopya imleci gecikmesiz izler, hedef hesabı kareye bir kez
    if (!raf.current) raf.current = requestAnimationFrame(() => { raf.current = 0; const cur = dragRef.current; if (!cur?.active) return; cur.target = targetAt(cur); paint(cur); });
  };
  // Yer yoksa (ya da Esc): kopya yavaşça eski yerine uçar, orada asıl paketle yer değiştirir
  const returnHome = (d: Drag, g: HTMLElement, before: Map<string, DOMRect>) => {
    slotRef.current?.remove(); slotRef.current = null;
    d.wrap.classList.remove('dock-src'); d.wrap.classList.add('dock-returning');
    for (const zone of ZONES) layoutRow(zone);
    before.delete(d.id); playFlip(before);
    const copy = g.firstElementChild as HTMLElement, home = d.wrap.getBoundingClientRect(), label = g.querySelector<HTMLElement>('.dock-ghost-label');
    if (label) label.style.opacity = '0';
    const done = () => { g.remove(); d.wrap.classList.remove('dock-returning'); };
    if (reduceRef.current || !d.wrap.isConnected) { done(); return; }
    const flat = !d.wrap.classList.contains('dock-free'), dx = home.left - (d.x - d.offX), dy = home.top - (d.y - d.offY);
    const end: Keyframe = { transform: `translate(${dx}px, ${dy}px) scale(1)`, boxShadow: '0 0 0 #0000', ...(flat ? { backgroundColor: 'transparent', borderColor: 'transparent' } : {}) };
    copy.getAnimations().forEach(a => a.cancel());
    const anim = copy.animate([{ transform: 'translate(0px, 0px) scale(1.03)' }, end], { duration: 420, easing: EASE, fill: 'forwards' });
    setTimeout(() => d.wrap.classList.remove('dock-returning'), 240); // asıl paket inişe doğru görünür olur
    anim.onfinish = done;
  };
  const endDrag = (e: ReactPointerEvent<HTMLElement> | null, commit: boolean) => {
    const d = dragRef.current;
    if (!d || (e && d.pid !== e.pointerId)) return;
    if (raf.current) { cancelAnimationFrame(raf.current); raf.current = 0; }
    dragRef.current = null;
    window.removeEventListener('keydown', onEsc, true);
    if (!d.active) return;
    suppress.current = true;
    const target = commit ? targetAt(d) : null, before = snapshot(), g = ghostRef.current!;
    ghostRef.current = null;
    for (const zone of ZONES) hitEl(zone)?.removeAttribute('data-target');
    chart.current?.querySelector('[data-dock-free-hint]')?.removeAttribute('data-target');
    if (!target) {
      flushSync(() => setDragging(false));
      returnHome(d, g, before);
      setLive(`${groupName(d.id)} ← ${t('cw.tbDropNone')}`);
      return;
    }
    slotRef.current?.remove(); slotRef.current = null;
    const from = { [d.id]: g.firstElementChild!.getBoundingClientRect() }, current = layoutRef.current;
    g.remove(); d.wrap.classList.remove('dock-src');
    let next: DockLayout;
    if (target.zone === 'free') {
      const host = chart.current!, box = { width: host.clientWidth, height: host.clientHeight }, cr = host.getBoundingClientRect();
      // Bırakılan sol üst köşe; kenarlara yaslanmış hâli saklanır, böylece kayıt görünen yerle aynıdır
      const pos = placeFree(toRatio(d.x - d.offX - cr.left, d.y - d.offY - cr.top, box), { width: d.w, height: d.h }, freeArea(host));
      next = pos ? moveToFree(current, d.id, toRatio(pos.left, pos.top, box)) : current;
    } else next = moveToRow(current, d.id, target.zone, target.index, target.x);
    pendingFlip.current = { before, from };
    focusAfter.current = null;
    setLive(`${groupName(d.id)} → ${zoneName(target.zone)}`);
    setStored(next);
    flushSync(() => { setDragging(false); setRev(r => r + 1); });
  };
  useLayoutEffect(() => { endDragRef.current = endDrag; });
  useEffect(() => () => { window.removeEventListener('keydown', onEsc, true); ghostRef.current?.remove(); }, [onEsc]);

  const hasIn = (zone: DockRowZone) => present.some(id => placeOf(id) === zone);
  const menuUp = (id: PackageId) => { const p = placeOf(id); return p === 'bottom' || (p === 'free' && (layout.free[id]?.y ?? 0) > 0.5); };
  const consumeClick = () => { const was = suppress.current; suppress.current = false; return was; };
  const api: DockApi = { layout, phone, setPhone, dragging, placeOf, menuUp, hasIn, registerRow, registerChart, registerPackage, refit, startDrag, moveDrag, endDrag, consumeClick, keyDown, menuInfo, act };
  return <Ctx.Provider value={api}>{children}<div role="status" aria-live="polite" className="sr-only">{live}</div></Ctx.Provider>;
}
