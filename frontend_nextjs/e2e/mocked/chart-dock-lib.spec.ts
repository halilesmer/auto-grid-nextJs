import { test, expect } from '@playwright/test';
import { defaultDockLayout, dropPosition, migrateToolbarLayout, moveToFree, moveToRow, packPackage, parseDockLayout, rowMargins, SHRINK_ORDER, DOCK_PACKAGES } from '../../src/lib/chart-workspace/dock';

// Serbest paket yerleşimi veri modeli (UI-17, plan 1106-A1)
test('Varsayılan yerleşim: hesap row1\'de, free ve pos boş', { tag: '@UI-17' }, () => {
  const d = defaultDockLayout();
  expect(d.row1).toEqual(['symbol', 'account', 'actions']);
  expect(d.row2).toEqual(['timeframes', 'formations']);
  expect(d.bottom).toEqual(['view', 'indicators', 'edit', 'window']);
  expect(d.free).toEqual({}); expect(d.pos).toEqual({});
  expect(parseDockLayout(d)).toEqual(d);
  expect(parseDockLayout(null)).toEqual(d);
  expect([...SHRINK_ORDER].sort()).toEqual([...DOCK_PACKAGES].sort());
});

test('Bozuk kayıt onarılır', { tag: '@UI-17' }, () => {
  const p = parseDockLayout({
    row1: ['mode', 'mode', 'ghost', 'account', 'account', 42],
    row2: ['account', 'formations', 'symbol'],
    bottom: 'x',
    free: { view: { x: 2, y: -1 }, mode: { x: 0.5, y: 0.5 }, edit: { x: 'a', y: 0 }, bogus: { x: 0, y: 0 } },
    pos: { formations: 5, mode: 0.3, view: 0.4, edit: 'z' },
  });
  // 1107-A21 U4-5: the removed package `mode` of a stored layout is dropped from rows, free and pos
  expect(JSON.stringify(p)).not.toContain('mode');
  expect(DOCK_PACKAGES as readonly string[]).not.toContain('mode');
  expect(p.row1.filter(x => x === 'account')).toEqual(['account']);
  expect(p.row2).not.toContain('account');
  const all = [...p.row1, ...p.row2, ...p.bottom, ...Object.keys(p.free)];
  expect(all.length).toBe(DOCK_PACKAGES.length + 1);
  expect(new Set(all).size).toBe(all.length);
  expect(all).not.toContain('ghost');
  expect(p.free).toEqual({ view: { x: 1, y: 0 } });
  expect(p.pos).toEqual({ formations: 1 });
  expect(p.row1[0]).toBe('account');
  expect(p.row2).toEqual(['timeframes', 'formations', 'symbol']); // symbol row2'de kalır, eksik timeframes varsayılan yerine girer
  expect(p.bottom).toEqual(expect.arrayContaining(['indicators', 'edit', 'window']));
});

test('v1 kaydından geçiş', { tag: '@UI-17' }, () => {
  const m = migrateToolbarLayout({ view: { zone: 'top' }, edit: { zone: 'free', x: 0.4, y: 0.2 }, window: { zone: 'bottom' } });
  expect(m.row1).toEqual(['symbol', 'account', 'actions', 'view']);
  expect(m.bottom).toEqual(['indicators', 'window']);
  expect(m.free).toEqual({ edit: { x: 0.4, y: 0.2 } });
  expect(migrateToolbarLayout({})).toEqual(defaultDockLayout());
});

test('Satıra taşıma sırayı ve kayıtları günceller', { tag: '@UI-17' }, () => {
  let d = moveToFree(defaultDockLayout(), 'view', { x: 0.3, y: 0.3 });
  d = moveToRow(d, 'view', 'row2', 1);
  expect(d.row2).toEqual(['timeframes', 'view', 'formations']);
  expect(d.free).toEqual({}); expect(d.bottom).not.toContain('view');
  d = moveToRow(d, 'actions', 'row2', 0, 0.5);
  expect(d.row1).toEqual(['symbol', 'account']);
  expect(d.row2[0]).toBe('actions'); expect(d.pos.actions).toBe(0.5);
  d = moveToRow(d, 'actions', 'row1', 99);
  expect(d.row1.at(-1)).toBe('actions'); expect(d.pos.actions).toBeUndefined();
  d = moveToRow(d, 'edit', 'row1', 0, 1);
  expect(d.pos.edit).toBe(1);
  expect(packPackage(d, 'edit').pos.edit).toBeUndefined();
  expect(moveToFree(d, 'edit', { x: 3, y: 0.1 }).pos.edit).toBeUndefined();
});

test('rowMargins: orta, sağ uç, taşma, çakışma', { tag: '@UI-17' }, () => {
  // istek yok: boşluksuz dizilir
  expect(rowMargins([100, 50], [undefined, undefined], 500, 2)).toEqual([0, 0]);
  // ortada: paket istenen yerde
  expect(rowMargins([100, 50], [undefined, 200], 500, 2)).toEqual([0, 98]);
  // sağ uç (1 × genişlik): sağ kenar satırın sağında
  expect(rowMargins([100, 50], [undefined, 500], 500, 2)).toEqual([0, 348]);
  // çakışma: soldaki komşunun üstüne binmez
  expect(rowMargins([100, 50], [undefined, 10], 500, 2)).toEqual([0, 0]);
  // taşma: boşluklar sağdan başlayarak daralır
  const m = rowMargins([200, 200, 200], [undefined, 250, 450], 500, 2);
  expect(m[0]).toBe(0);
  expect(m).toEqual([0, 0, 0]); // toplam 604 px > 500: tüm boşluklar kapanır, taşan kısım ok menüsüne gider
  // kısmi daralma
  expect(rowMargins([100, 100], [undefined, 450], 500, 2)).toEqual([0, 298]);
});

test('dropPosition: komşuya ve sağ uca yapışır', { tag: '@UI-17' }, () => {
  expect(dropPosition(110, 100, 800, 100)).toBeUndefined();
  expect(dropPosition(114, 100, 800, 100)).toBeUndefined();
  expect(dropPosition(120, 100, 800, 100)).toBeCloseTo(0.15);
  expect(dropPosition(690, 100, 800, 100)).toBe(1);
  expect(dropPosition(680, 100, 800, 100)).toBeCloseTo(0.85);
  expect(dropPosition(-20, 0, 800, 100)).toBeUndefined();
});
