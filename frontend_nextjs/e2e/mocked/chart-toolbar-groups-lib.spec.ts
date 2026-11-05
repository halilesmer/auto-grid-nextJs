import { test, expect } from '@playwright/test';
import { isAutoLayout, moveGroup, nudgeStep, parseToolbarLayout, placeFree, placementZone, toRatio } from '../../src/lib/chart-workspace/toolbar';

// Yerleşim mantığı (UI-16, 1105-A5.8): oto yer, oran, kenara yaslama, sığmazsa alt şerit
const area = { width: 1000, height: 600, left: 60, right: 80, top: 8, bottom: 8 };

test('Kayıtsız grup otodur: geniş kapta üst, dar kapta alt şerit', { tag: '@UI-16' }, () => {
  expect(placementZone({}, 'edit', true)).toBe('top');
  expect(placementZone({}, 'edit', false)).toBe('bottom');
  const layout = moveGroup({}, 'edit', { zone: 'bottom' });
  expect(placementZone(layout, 'edit', true)).toBe('bottom');
  expect(placementZone(layout, 'view', true)).toBe('top');
  expect(isAutoLayout({})).toBe(true);
  expect(isAutoLayout(layout)).toBe(false);
});

test('Serbest konum oran olarak saklanır ve kap boyutuyla ölçeklenir', { tag: '@UI-16' }, () => {
  const layout = moveGroup({}, 'indicators', { zone: 'free', x: 0.5, y: 0.25 });
  expect(layout.indicators).toEqual({ zone: 'free', x: 0.5, y: 0.25 });
  expect(placeFree({ x: 0.5, y: 0.25 }, { width: 100, height: 30 }, area)).toEqual({ left: 500, top: 150 });
  expect(placeFree({ x: 0.5, y: 0.25 }, { width: 100, height: 30 }, { ...area, width: 500, height: 300 })).toEqual({ left: 250, top: 75 });
  expect(toRatio(250, 75, { width: 500, height: 300 })).toEqual({ x: 0.5, y: 0.25 });
});

test('Serbest grup grafiğin içinde kalır (kenarlara yaslanır)', { tag: '@UI-16' }, () => {
  const size = { width: 200, height: 30 };
  expect(placeFree({ x: 0, y: 0 }, size, area)).toEqual({ left: 60, top: 8 });
  expect(placeFree({ x: 1, y: 1 }, size, area)).toEqual({ left: 1000 - 80 - 200, top: 600 - 8 - 30 });
});

test('Sığmayan serbest grup için yer yoktur (alt şeride düşer)', { tag: '@UI-16' }, () => {
  const size = { width: 160, height: 30 };
  // 280 px: 280 − 60 − 80 = 140 px < 160 px
  expect(placeFree({ x: 0.2, y: 0.2 }, size, { ...area, width: 280 })).toBeNull();
  expect(placeFree({ x: 0.2, y: 0.2 }, size, { ...area, height: 40 })).toBeNull();
  // Kap henüz ölçülmedi
  expect(placeFree({ x: 0.2, y: 0.2 }, size, { ...area, width: 0, height: 0 })).toBeNull();
  expect(placeFree({ x: 0.2, y: 0.2 }, size, { ...area, width: 300 })).not.toBeNull();
});

test('Bozuk kayıt otoya düşer; oranlar 0–1 arasına sıkışır', { tag: '@UI-16' }, () => {
  expect(parseToolbarLayout(null)).toEqual({});
  expect(parseToolbarLayout('x')).toEqual({});
  expect(parseToolbarLayout({ edit: { zone: 'left' }, view: { zone: 'free', x: 'a', y: 1 }, foo: { zone: 'top' } })).toEqual({});
  expect(parseToolbarLayout({ edit: { zone: 'bottom', x: 3 }, window: { zone: 'free', x: 2, y: -1 } })).toEqual({ edit: { zone: 'bottom' }, window: { zone: 'free', x: 1, y: 0 } });
  expect(nudgeStep(false)).toBeLessThan(nudgeStep(true));
});
