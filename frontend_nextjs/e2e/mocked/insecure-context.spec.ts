/**
 * SYS-13 Unsicherer Kontext (LAN über http): crypto.randomUUID fehlt dort, crypto.getRandomValues bleibt.
 * Die Seiten dürfen deshalb nicht abstürzen, und die IDs behalten das UUID-v4-Format.
 */
import { randomId } from '@/lib/randomId';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, test } from '../fixtures/test';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test.describe('SYS-13 randomId ohne randomUUID', () => {
  test('liefert UUID v4, jeder Aufruf anders, auch ohne crypto.randomUUID', { tag: '@SYS-13' }, () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const ids = Array.from({ length: 50 }, () => randomId());
      for (const id of ids) expect(id).toMatch(UUID_V4);
      expect(new Set(ids).size).toBe(ids.length);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    }
    expect(randomId()).toMatch(UUID_V4);
  });
});

test.describe('SYS-13 Seiten ohne crypto.randomUUID', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    });
  });

  test('Dashboard und „Setup Ekle“ laufen ohne Seitenfehler', { tag: '@SYS-13' }, async ({ page, dashboard }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await dashboard.open(DEMO_ID);
    await dashboard.symbolCard().getByRole('button', { name: msg('zone.symbol.addSetup') }).click();
    await expect(dashboard.zone(1).getByTestId('zone-cancel')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('/chart mit gespeicherten Indikatoren rendert ohne Seitenfehler', { tag: '@SYS-13' }, async ({ page, worker }) => {
    void worker;
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`/chart?account=${DEMO_ID}&zone=${ZONE_ID}&tf=M15`);
    await expect(page.getByTestId('analysis-chart')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
