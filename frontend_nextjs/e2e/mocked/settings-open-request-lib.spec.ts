/** USR-12 · „Grafikte aç“-İsteği (1115-A10 F13): zamanında tüketilmeyen istek geçersizdir; pencere yeniden açılınca düşer. */
import { test, expect } from '@playwright/test';
import { OPEN_REQUEST_MAX_AGE_MS, isOpenRequestFresh, useSettingsDialogStore } from '../../src/store/useSettingsDialogStore';

test('F13: istek 15 sn içinde geçerli, sonra geçersiz', { tag: '@USR-12' }, () => {
  expect(OPEN_REQUEST_MAX_AGE_MS).toBe(15_000);
  expect(isOpenRequestFresh(1_000, 1_000 + 14_999)).toBe(true);
  expect(isOpenRequestFresh(1_000, 1_000 + 15_000)).toBe(true);
  expect(isOpenRequestFresh(1_000, 1_000 + 15_001)).toBe(false);
});

test('F13: istek zamanı saklanır; pencere yeniden açılınca bekleyen istekler düşer', { tag: '@USR-12' }, () => {
  const store = useSettingsDialogStore;
  const before = Date.now();
  store.getState().requestIndicators();
  store.getState().requestAppearance();
  expect(store.getState().indicatorsRequested).toBe(true);
  expect(store.getState().indicatorsRequestedAt).toBeGreaterThanOrEqual(before);
  expect(store.getState().appearanceRequestedAt).toBeGreaterThanOrEqual(before);
  store.getState().show('chart');
  expect(store.getState().indicatorsRequested).toBe(false);
  expect(store.getState().appearanceRequested).toBe(false);
});
