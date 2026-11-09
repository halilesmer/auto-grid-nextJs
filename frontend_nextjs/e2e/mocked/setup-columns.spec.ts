/**
 * ZON-20 Drei Kästen im Setup (Plan 1108-A5, K2): ab lg stehen „Giriş“, „Kırılım ve Pullback“ (mit Spread-Schutz)
 * und „Bölgeden çıkış“ nebeneinander (1,2 : 1 : 1), darunter (unter lg) untereinander. UI-08: bei 375 px kein
 * horizontaler Überlauf, auch bei BOTH ohne Sync und im Fraktal-Modus. Der Backtest-Editor behält sein Layout.
 */
import type { Locator, Page } from '@playwright/test';
import { msg } from '../fixtures/i18n';
import { DEMO_ID, ZONE_ID, expect, makeZone, openSetup, test } from '../fixtures/test';

async function boxOf(locator: Locator, name: string) {
  await expect(locator, name).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, name).not.toBeNull();
  return box!;
}

async function noOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(sizes.scroll, 'Kein horizontaler Überlauf').toBeLessThanOrEqual(sizes.client);
}

const columns = (page: Page) => ({
  entry: page.getByTestId('zone-entry-column').first(),
  guard: page.getByTestId('zone-guard-column').first(),
  exit: page.getByTestId('zone-exit-column').first(),
});

test.describe('ZON-20 Drei Kästen', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const width of [1440, 1024]) {
    test(`${width} px: Kästen in einer Reihe, Reihenfolge Giriş, Schutz, Ausstieg`, { tag: '@ZON-20' }, async ({ page, dashboard }) => {
      await page.setViewportSize({ width, height: 900 });
      await dashboard.open(DEMO_ID);
      await openSetup(dashboard.zone());
      const c = columns(page);
      const [e, g, x] = [await boxOf(c.entry, 'Giriş'), await boxOf(c.guard, 'Kırılım'), await boxOf(c.exit, 'Çıkış')];
      expect(e.x, 'Giriş links von Schutz').toBeLessThan(g.x);
      expect(g.x, 'Schutz links von Ausstieg').toBeLessThan(x.x);
      expect(Math.abs(e.y - g.y), 'gleiche Reihe').toBeLessThanOrEqual(1);
      expect(Math.abs(g.y - x.y), 'gleiche Reihe').toBeLessThanOrEqual(1);
      expect(e.width / g.width, 'Verhältnis 1,2 : 1').toBeGreaterThan(1.1);
      expect(e.width / g.width, 'Verhältnis 1,2 : 1').toBeLessThan(1.3);
      expect(Math.abs(g.width - x.width), 'Schutz und Ausstieg gleich breit').toBeLessThanOrEqual(1);
      expect(g.x - (e.x + e.width), 'Abstand 14 px').toBeGreaterThanOrEqual(13);
      expect(g.x - (e.x + e.width), 'Abstand 14 px').toBeLessThanOrEqual(15);
      // Spread-Schutz liegt im mittleren Kasten, nicht im Ausstieg
      await expect(c.guard.getByTestId('spread-guard')).toBeVisible();
      await expect(c.exit.getByTestId('spread-guard')).toHaveCount(0);
      await noOverflow(page);
    });
  }

  test('Schalter: „Sofort erste Position“ unter Temel, „Zarara göre“ vor Grid-Schritt', { tag: '@ZON-20' }, async ({ dashboard }) => {
    await dashboard.open(DEMO_ID);
    await openSetup(dashboard.zone());
    const orderType = await boxOf(dashboard.zoneField(msg('zone.field.orderType')), 'Ordertyp');
    const minPrice = dashboard.zoneField(msg('zone.field.minPrice'));
    await expect(minPrice).toBeVisible();
    const instant = await boxOf(dashboard.zoneSwitch(msg('zone.instantEntry')), 'Sofort erste Position');
    const step = await boxOf(dashboard.zoneField(msg('zone.field.gridStep')), 'Grid-Schritt');
    expect(instant.y, 'unter der Zeile Temel').toBeGreaterThan(orderType.y + orderType.height);
    expect(instant.y + instant.height, 'über dem Grid-Block').toBeLessThanOrEqual(step.y);
    // „Zarara göre“: kurze Beschriftung, Schalter vor dem Grid-Schritt auf Höhe des Feldes
    const sw = await boxOf(dashboard.zoneSwitch(msg('zone.stepByLoss.short')), 'Zarara göre');
    expect(sw.x + sw.width, 'links vom Grid-Schritt').toBeLessThanOrEqual(step.x);
    expect(Math.abs(sw.y + sw.height / 2 - (step.y + step.height / 2)), 'auf Höhe des Feldes').toBeLessThanOrEqual(4);
    await expect(dashboard.zone().getByText(msg('zone.stepByLoss.short'), { exact: true })).toBeVisible();
    // Der volle Name bleibt der Name für Screenreader
    await expect(dashboard.zoneSwitch(msg('zone.stepByLoss.short'))).toHaveAttribute('aria-label', msg('zone.stepByLoss'));
  });

  test('Fraktal-Modus: kein „Sofort erste Position“, kein „Zarara göre“', { tag: '@ZON-20' }, async ({ worker, dashboard }) => {
    worker.setZones(DEMO_ID, [makeZone({ entry_mode: 'fractal' })]);
    await dashboard.open(DEMO_ID);
    await openSetup(dashboard.zone());
    await expect(dashboard.zoneSwitch(msg('zone.instantEntry'))).toHaveCount(0);
    await expect(dashboard.zoneSwitch(msg('zone.stepByLoss.short'))).toHaveCount(0);
  });

  test('Eingaben sind 28 px hoch und ohne Spin-Knöpfe', { tag: '@ZON-20' }, async ({ dashboard }) => {
    await dashboard.open(DEMO_ID);
    await openSetup(dashboard.zone());
    const input = dashboard.zoneField(msg('zone.field.gridStep'));
    const box = await boxOf(input, 'Grid-Schritt');
    expect(box.height).toBeGreaterThanOrEqual(27.5);
    expect(box.height).toBeLessThanOrEqual(28.5);
    // Ein Zahlenfeld außerhalb der Setup-Felder hat Spin-Knöpfe (appearance auto), das im Setup nicht
    const { setup, plain } = await input.evaluate((el) => {
      const probe = document.createElement('input');
      probe.type = 'number';
      document.body.append(probe);
      const plainAppearance = getComputedStyle(probe).appearance;
      probe.remove();
      return { setup: getComputedStyle(el).appearance, plain: plainAppearance };
    });
    expect(plain, 'Vergleichsfeld hat Spin-Knöpfe').toBe('auto');
    expect(setup, 'Setup-Zahlenfeld ohne Spin-Knöpfe').toBe('textfield');
    // Pfeiltasten funktionieren weiter
    await input.fill('1');
    await input.press('ArrowUp');
    await expect(input).not.toHaveValue('1');
  });

  test('Backtest-Editor behält sein Layout (zwei Spalten, kein Schutz-Kasten)', { tag: '@ZON-20' }, async ({ page, worker }) => {
    worker.setZones(DEMO_ID, [makeZone({ magic: 200001 })]);
    await page.goto(`/backtest?account=${DEMO_ID}&zone=${ZONE_ID}&range=last7`);
    await expect(page.getByTestId('bt-setup')).toBeVisible();
    await page.getByTestId('bt-setup').getByRole('button', { name: msg('backtest.setups.edit'), exact: true }).click();
    const editor = page.getByTestId('bt-setup-editor');
    await expect(editor).toBeVisible();
    await expect(editor.getByTestId('zone-entry-column')).toBeVisible();
    await expect(editor.getByTestId('zone-exit-column')).toBeVisible();
    await expect(editor.getByTestId('zone-guard-column')).toHaveCount(0);
    const e = await boxOf(editor.getByTestId('zone-entry-column'), 'Entry');
    const x = await boxOf(editor.getByTestId('zone-exit-column'), 'Exit');
    expect(x.x, 'Ausstieg rechts neben Einstieg').toBeGreaterThan(e.x + e.width - 1);
  });
});

test.describe('ZON-20 Ausstieg-Kasten paarweise', () => {
  const rowsOf = async (page: Page) => {
    const selects = page.getByTestId('zone-exit-column').first().locator('select');
    await expect(selects).toHaveCount(4);
    const ys: number[] = [];
    for (let i = 0; i < 4; i++) ys.push((await selects.nth(i).boundingBox())!.y);
    return ys;
  };

  test('1440 px: vier Auswahlfelder als 2×2', { tag: '@ZON-20' }, async ({ page, worker, dashboard }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    worker.setZones(DEMO_ID, [makeZone({ clear_on_exit: true })]);
    await dashboard.open(DEMO_ID);
    await openSetup(dashboard.zone());
    const ys = await rowsOf(page);
    expect(Math.abs(ys[0] - ys[1]), 'Paar 1 in einer Reihe').toBeLessThanOrEqual(1);
    expect(Math.abs(ys[2] - ys[3]), 'Paar 2 in einer Reihe').toBeLessThanOrEqual(1);
    expect(ys[2], 'Paar 2 unter Paar 1').toBeGreaterThan(ys[0] + 10);
  });

  test('390 px: vier Auswahlfelder untereinander', { tag: ['@ZON-20', '@UI-08'] }, async ({ page, worker, dashboard }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    worker.setZones(DEMO_ID, [makeZone({ clear_on_exit: true })]);
    await dashboard.open(DEMO_ID);
    await openSetup(dashboard.zone());
    const ys = await rowsOf(page);
    expect(ys[1], 'untereinander').toBeGreaterThan(ys[0] + 10);
    expect(ys[2], 'untereinander').toBeGreaterThan(ys[1] + 10);
    expect(ys[3], 'untereinander').toBeGreaterThan(ys[2] + 10);
  });
});

test.describe('UI-08 Kästen bei 375 px', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  const setups = [
    { name: 'BUY', zone: { order_type: 'BUY' as const } },
    { name: 'BOTH ohne Sync', zone: { order_type: 'BOTH' as const, sync_buy_sell: false, is_breakout: true, clear_on_exit: true } },
    { name: 'Fraktal BOTH ohne Sync', zone: { order_type: 'BOTH' as const, sync_buy_sell: false, entry_mode: 'fractal' as const } },
  ];
  for (const s of setups) {
    test(`Kästen untereinander, kein Überlauf: ${s.name}`, { tag: ['@ZON-20', '@UI-08'] }, async ({ page, worker, dashboard }) => {
      worker.setZones(DEMO_ID, [makeZone(s.zone)]);
      await dashboard.open(DEMO_ID);
      await openSetup(dashboard.zone());
      const c = columns(page);
      const [e, g, x] = [await boxOf(c.entry, 'Giriş'), await boxOf(c.guard, 'Kırılım'), await boxOf(c.exit, 'Çıkış')];
      expect(Math.abs(e.x - g.x), 'gleiche linke Kante').toBeLessThanOrEqual(1);
      expect(Math.abs(g.x - x.x), 'gleiche linke Kante').toBeLessThanOrEqual(1);
      expect(g.y, 'Schutz unter Giriş').toBeGreaterThanOrEqual(e.y + e.height);
      expect(x.y, 'Ausstieg unter Schutz').toBeGreaterThanOrEqual(g.y + g.height);
      expect(e.x + e.width, 'Kasten im Fenster').toBeLessThanOrEqual(375);
      await noOverflow(page);
    });
  }
});
